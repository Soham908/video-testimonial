import { accountScope, scopeIsCurrent, ownsRecording, trackAccountTask } from './accountStorage';
import { File } from 'expo-file-system';
import { ApiError, apiGet, apiPost } from './api';
import { validConfirmation, type ApprovedUploadEntry, type PendingUploadReceipt, type UploadConfirmation } from './uploadBatch';
import { readUploadFileIdentity, readLocalUploadGuard } from './uploadFileIdentity';
import { isIsoDate, isUuid, MAX_DURATION_MS, MAX_SOURCE_BYTES, sameIntent,
  type AttemptEnvelope, type UploadAttemptCheckpoint, type UploadCapabilities } from './uploadProtocol';
import { fetchQuestions } from './questions';
import { questionSnapshotMatches } from './recordings';
import { t } from './i18n/useStrings';
export { readUploadFileIdentity } from './uploadFileIdentity';

export async function requireUploadCapabilities(signal?: AbortSignal): Promise<UploadCapabilities> {
  let capabilities: UploadCapabilities;
  try { capabilities = await apiGet<UploadCapabilities>('/segments/upload-capabilities', signal); }
  catch (error) {
    if (error instanceof ApiError && [404, 405, 410, 426, 501].includes(error.status)) throw new Error(t('uploadApproval.unavailable'));
    throw error;
  }
  if (capabilities?.contract_version !== 2 || capabilities.intake_enabled !== true || capabilities.immutable_attempts !== true
    || capabilities.sha256 !== true || capabilities.write_once !== true || capabilities.selected_playback !== true
    || capabilities.legacy_writes_allowed !== false || !Number.isSafeInteger(capabilities.limits?.source_size_bytes)
    || capabilities.limits.source_size_bytes <= 0 || capabilities.limits.source_size_bytes > MAX_SOURCE_BYTES
    || !Number.isSafeInteger(capabilities.limits?.duration_ms) || capabilities.limits.duration_ms <= 0 || capabilities.limits.duration_ms > MAX_DURATION_MS) {
    throw new Error(t('uploadApproval.unavailable'));
  }
  return capabilities;
}
// Preserve every signed header. Content-Length is also derived from the native
// file body by Android/URLSession; never remove its signed size binding.
export function verifiedUploadHeaders(envelope: AttemptEnvelope, entry: ApprovedUploadEntry): Record<string, string> {
  const upload = envelope.upload;
  if (!upload || typeof upload.upload_url !== 'string' || !/^https:\/\//.test(upload.upload_url) || !isIsoDate(upload.expires_at)) throw new Error(t('uploadApproval.unavailable'));
  const headers = upload.required_headers;
  if (!headers || typeof headers !== 'object' || Object.values(headers).some(value => typeof value !== 'string')) throw new Error(t('uploadApproval.unavailable'));
  const normalized = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  // A SHA256 digest always encodes to 44 base64 characters. Compare the
  // decoded representation without relying on browser-only atob/Buffer.
  const expectedChecksum = hexSha256ToBase64(entry.intent.source_sha256);
  if (Object.keys(normalized).length !== Object.keys(headers).length || normalized['content-type'] !== 'video/mp4'
    || normalized['if-none-match'] !== '*' || normalized['content-length'] !== String(entry.file.sizeBytes)
    || normalized['x-amz-checksum-sha256'] !== expectedChecksum
    || Object.keys(normalized).some(key => !['content-type', 'content-length', 'if-none-match', 'x-amz-checksum-sha256'].includes(key))) throw new Error(t('uploadApproval.unavailable'));
  return { ...headers };
}
function hexSha256ToBase64(hex: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let encoded = '';
  for (let offset = 0; offset < hex.length; offset += 6) {
    const bytes = hex.slice(offset, offset + 6), number = parseInt(bytes.padEnd(6, '0'), 16);
    encoded += alphabet[(number >>> 18) & 63] + alphabet[(number >>> 12) & 63]
      + (bytes.length > 2 ? alphabet[(number >>> 6) & 63] : '=') + (bytes.length > 4 ? alphabet[number & 63] : '=');
  }
  return encoded;
}

function checkEnvelope(envelope: AttemptEnvelope, entry: ApprovedUploadEntry, attemptId?: string): AttemptEnvelope {
  if (!envelope || envelope.contract_version !== 2 || !isUuid(envelope.attempt_id)
    || (attemptId !== undefined && envelope.attempt_id !== attemptId) || !sameIntent(envelope.intent, entry.intent)
    || !['awaiting_upload', 'validating', 'accepted', 'rejected', 'conflict'].includes(envelope.state)
    || (envelope.state === 'accepted' ? !envelope.receipt || envelope.upload !== null : envelope.receipt !== null)) {
    throw new Error(t('uploadApproval.receiptMismatch'));
  }
  return envelope;
}

function readConfirmation(envelope: AttemptEnvelope, entry: ApprovedUploadEntry): UploadConfirmation {
  const receipt = envelope.receipt!;
  const confirmation = { confirmedAt: receipt.accepted_at, segmentId: receipt.segment_id, receipt };
  const attempt = entry.attempt ?? { attemptId: envelope.attempt_id, requiredHeaders: null, expiresAt: null };
  if (!validConfirmation({ ...entry, attempt }, confirmation)) throw new Error(t('uploadApproval.receiptMismatch'));
  return confirmation;
}

// Detached receipts are read-only. Cancellation cannot queue confirmation,
// renew a capability or send bytes, even when the server reports missing media.
export async function recoverUploadReceipt(entry: PendingUploadReceipt, signal?: AbortSignal): Promise<UploadConfirmation | 'terminal' | null> {
  const scope = accountScope();
  if (entry.ownerId !== scope.owner || !ownsRecording(entry.video.filePath, scope.owner)) throw new Error(t('uploadApproval.wrongAccount'));
  const id = entry.attempt.attemptId;
  const response = await apiGet<AttemptEnvelope>(`/segments/upload-attempts/${id}`, signal);
  if (signal?.aborted || !scopeIsCurrent(scope)) throw new Error(t('uploadApproval.accountChanged'));
  const envelope = checkEnvelope(response, entry, id);
  if (envelope.state === 'accepted') return readConfirmation(envelope, entry);
  if (envelope.state === 'rejected' || envelope.state === 'conflict') return 'terminal';
  return null;
}

// Native File.upload streams from disk. No fetch(fileUri).blob(), File.bytes(),
// File.slice(), whole-file ArrayBuffer, or legacy canonical PUT fallback.
export async function uploadSegment(
  entry: ApprovedUploadEntry, signal?: AbortSignal,
  persistAttempt?: (checkpoint: UploadAttemptCheckpoint) => void,
): Promise<UploadConfirmation> {
  const scope = accountScope();
  if (entry.ownerId !== scope.owner || !ownsRecording(entry.video.filePath, scope.owner)) throw new Error(t('uploadApproval.wrongAccount'));
  const controller = new AbortController();
  const abort = () => controller.abort();
  scope.signal.addEventListener('abort', abort);
  signal?.addEventListener('abort', abort);
  if (scope.signal.aborted || signal?.aborted) controller.abort();
  return trackAccountTask(scope.owner, uploadForAccount()).catch(error => {
    if (controller.signal.aborted || !scopeIsCurrent(scope)) throw new Error(t('uploadApproval.accountChanged'));
    if (error instanceof ApiError) {
      if (error.code === 'question_snapshot_changed') throw new Error(t('uploadApproval.questionChanged'));
      if (error.status === 409) throw new Error(t('uploadApproval.replacementConflict'));
      if (error.status === 422) throw new Error(t('uploadApproval.rejected'));
    }
    throw error;
  }).finally(() => {
    scope.signal.removeEventListener('abort', abort);
    signal?.removeEventListener('abort', abort);
  });
  async function uploadForAccount(): Promise<UploadConfirmation> {
    let checkpoint = entry.attempt;
    const ensureCurrent = () => { if (controller.signal.aborted || !scopeIsCurrent(scope)) throw new Error(t('uploadApproval.accountChanged')); };
    const verifyFileGuard = () => {
      ensureCurrent();
      const actual = readLocalUploadGuard(entry.video.filePath);
      if (actual.sizeBytes !== entry.file.sizeBytes || actual.md5 !== entry.file.md5) throw new Error(t('uploadApproval.fileChanged'));
    };
    const verifyFileSha256 = async () => {
      const actual = await readUploadFileIdentity(entry.video.filePath, controller.signal);
      ensureCurrent();
      if (actual.sizeBytes !== entry.file.sizeBytes || actual.sha256 !== entry.file.sha256 || actual.md5 !== entry.file.md5) throw new Error(t('uploadApproval.fileChanged'));
    };
    const validateEnvelope = (envelope: AttemptEnvelope, attemptId?: string): AttemptEnvelope => {
      ensureCurrent();
      return checkEnvelope(envelope, entry, attemptId);
    };
    const accepted = (envelope: AttemptEnvelope): UploadConfirmation | null => {
      if (envelope.state !== 'accepted') {
        if (envelope.state === 'rejected' || envelope.state === 'conflict') throw new Error(t(envelope.state === 'conflict' ? 'uploadApproval.replacementConflict' : 'uploadApproval.rejected'));
        return null;
      }
      return readConfirmation(envelope, entry);
    };
    const storeCheckpoint = (next: UploadAttemptCheckpoint) => {
      ensureCurrent();
      if (!persistAttempt) throw new Error(t('uploadApproval.saveFailed'));
      persistAttempt(next);
      checkpoint = next;
      ensureCurrent();
    };
    const persist = (envelope: AttemptEnvelope) => {
      const requiredHeaders = envelope.upload ? verifiedUploadHeaders(envelope, entry) : checkpoint?.requiredHeaders ?? null;
      storeCheckpoint({ ...(checkpoint ?? { confirmationRequested: false }), attemptId: envelope.attempt_id,
        requiredHeaders, expiresAt: envelope.upload?.expires_at ?? checkpoint?.expiresAt ?? null });
    };
    const status = async (attemptId: string) => validateEnvelope(await apiGet<AttemptEnvelope>(`/segments/upload-attempts/${attemptId}`, controller.signal), attemptId);
    const confirm = async (attemptId: string) => {
      if (checkpoint?.confirmationRequested !== true) {
        storeCheckpoint({ attemptId, requiredHeaders: checkpoint?.requiredHeaders ?? null,
          expiresAt: checkpoint?.expiresAt ?? null, confirmationRequested: true });
      }
      return validateEnvelope(await apiPost<AttemptEnvelope>(`/segments/upload-attempts/${attemptId}/confirm`, { contract_version: 2 }, controller.signal), attemptId);
    };
    const waitForValidation = async (initial: AttemptEnvelope) => {
      let envelope = initial;
      for (let poll = 0; envelope.state === 'validating' && poll < 20; poll++) {
        await new Promise<void>((resolve, reject) => {
          const onAbort = () => { clearTimeout(timer); reject(new Error(t('uploadApproval.accountChanged'))); };
          const timer = setTimeout(() => { controller.signal.removeEventListener('abort', onAbort); resolve(); }, 1000);
          controller.signal.addEventListener('abort', onAbort, { once: true });
          if (controller.signal.aborted) onAbort();
        });
        ensureCurrent();
        envelope = await status(envelope.attempt_id);
      }
      if (envelope.state === 'validating') throw new Error(t('uploadApproval.validating'));
      return envelope;
    };
    ensureCurrent();
    // Receipt recovery precedes a capability check/local hash: accepted media
    // can be acknowledged after a lost response even if intake is now closed.
    let envelope: AttemptEnvelope;
    let newlyCreated = false;
    if (entry.attempt) {
      envelope = await waitForValidation(await status(entry.attempt.attemptId));
      const recovered = accepted(envelope);
      if (recovered) return recovered;
    } else {
      const capabilities = await requireUploadCapabilities(controller.signal);
      ensureCurrent();
      if (entry.file.sizeBytes > capabilities.limits.source_size_bytes) throw new Error(t('uploadApproval.verifyFailed'));
      verifyFileGuard();
      const currentQuestions = await fetchQuestions(entry.question.language, controller.signal);
      ensureCurrent();
      if (!questionSnapshotMatches(entry.question, currentQuestions.find(question => question.id === entry.question.id))) throw new Error(t('uploadApproval.questionChanged'));
      envelope = validateEnvelope(await apiPost<AttemptEnvelope>('/segments/upload-attempts', entry.intent, controller.signal));
      newlyCreated = envelope.created === true && envelope.state === 'awaiting_upload';
      persist(envelope);
      const recovered = accepted(envelope);
      if (recovered) return recovered;
      envelope = await waitForValidation(envelope);
    }
    // A new server-generated key has no previous transfer to recover. Replays
    // and restored attempts must confirm first, including a lost create/PUT.
    if (!newlyCreated) {
      try {
        envelope = await waitForValidation(await confirm(envelope.attempt_id));
        const recovered = accepted(envelope);
        if (recovered) return recovered;
        // Confirmation can queue validation in the bounded worker. Only its
        // explicit missing-source result permits a PUT; infrastructure failures
        // and a busy queue must never be mistaken for missing footage.
        if (envelope.state === 'awaiting_upload' && envelope.error_code === 'video_not_found') {
          throw new ApiError(404, 'video_not_found', 'video_not_found');
        }
        if (envelope.state === 'awaiting_upload' && envelope.error_code) {
          throw new ApiError(503, envelope.error_code, t('uploadApproval.validating'));
        }
        throw new Error(t('uploadApproval.validating'));
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 404 || error.code !== 'video_not_found') throw error;
      }
    }
    await requireUploadCapabilities(controller.signal);
    ensureCurrent();
    verifyFileGuard();
    if (!envelope.upload || Date.parse(envelope.upload.expires_at) <= Date.now() + 30000) {
      envelope = validateEnvelope(await apiPost<AttemptEnvelope>('/segments/upload-attempts', entry.intent, controller.signal), envelope.attempt_id);
    }
    const recovered = accepted(envelope);
    if (recovered) return recovered;
    if (envelope.state !== 'awaiting_upload') throw new Error(t('uploadApproval.validating'));
    const headers = verifiedUploadHeaders(envelope, entry);
    persist(envelope); // Durable attempt + signed profile before native PUT.
    // One fresh bounded SHA immediately before each PUT, in addition to
    // explicit-approval SHA. Other checkpoints use accidental-change guards;
    // signed SHA + storage/backend digest checks remain the acceptance proof.
    await verifyFileSha256();
    const result = await new File(entry.video.filePath).upload(envelope.upload!.upload_url, { httpMethod: 'PUT', headers, signal: controller.signal });
    ensureCurrent();
    if ((result.status < 200 || result.status >= 300) && result.status !== 412) throw new Error(t('upload.storageUploadFailed', { status: result.status }));
    verifyFileGuard();
    envelope = await waitForValidation(await confirm(envelope.attempt_id));
    const confirmation = accepted(envelope);
    if (!confirmation) throw new Error(t('uploadApproval.validating'));
    return confirmation;
  }
}
