import { t } from './i18n/useStrings';
import { questionSnapshotMatches, snapshotQuestion, type RecordedVideo, type RecordedQuestionSnapshot } from './recordings';
import type { QuestionDto } from './questions';
import { currentAccount } from './accountStorage';
import { requestedTrim } from './trim';
import type { UploadFileIdentity } from './uploadFileIdentity';
import { isIsoDate, isOpaqueId, isSha256, isUuid, receiptMatches, sameIntent, validIntent,
  type AcceptedReceipt, type UploadIntent, type UploadAttemptCheckpoint } from './uploadProtocol';
export type { UploadFileIdentity } from './uploadFileIdentity';
export interface UploadConfirmation { confirmedAt: string; segmentId: string; receipt: AcceptedReceipt }
export interface ApprovedUploadEntry {
  id: string;
  ownerId: string;
  clientId: string;
  contentIdentity: string;
  video: RecordedVideo;
  question: RecordedQuestionSnapshot;
  file: UploadFileIdentity;
  intent: UploadIntent;
  attempt: UploadAttemptCheckpoint | null;
  confirmation: UploadConfirmation | null;
}
export interface ApprovedUploadBatch {
  version: 2;
  id: string;
  ownerId: string;
  clientId: string;
  approvedAt: string;
  status: 'pending' | 'completed';
  entries: ApprovedUploadEntry[];
}
export type PendingUploadReceipt = ApprovedUploadEntry & { attempt: UploadAttemptCheckpoint; confirmation: null };
export function takeIdentity(video: RecordedVideo): string {
  // Array positions can move when the catalog is reordered. Source identity
  // belongs to the recorded stable snapshot and chosen trim, never that slot.
  return JSON.stringify([video.id, video.filePath, video.durationSeconds,
    video.trimStartSeconds ?? null, video.trimEndSeconds ?? null,
    video.questionSnapshot ?? null, video.expectedCurrentSegmentId ?? null]);
}
function entryIdentity(entry: Pick<ApprovedUploadEntry, 'video' | 'question' | 'file' | 'intent' | 'ownerId' | 'clientId'>): string {
  return JSON.stringify([takeIdentity(entry.video), entry.question, entry.file, entry.intent, entry.ownerId, entry.clientId]);
}
export function freezeUploadSelection(videos: readonly RecordedVideo[], questions: readonly QuestionDto[]): RecordedVideo[] {
  const primaries = videos.filter(video => video.isPrimary !== false && !hasExactAcknowledgement(video)
    && (!video.questionSnapshot || questions.some(question => question.id === video.questionSnapshot!.id)));
  if (!primaries.length || new Set(primaries.map(video => video.questionSnapshot?.id)).size !== primaries.length) throw new Error(t('uploadApproval.reviewSelected'));
  return primaries.map(source => {
    const video = JSON.parse(JSON.stringify(source)) as RecordedVideo;
    if (!validVideo(video)) throw new Error(t('uploadApproval.reviewTrim'));
    if (!video.questionSnapshot || !Object.prototype.hasOwnProperty.call(video, 'expectedCurrentSegmentId')) throw new Error(t('uploadApproval.legacyReview'));
    if (!questionSnapshotMatches(video.questionSnapshot, questions.find(question => question.id === video.questionSnapshot!.id))) throw new Error(t('uploadApproval.questionChanged'));
    return video;
  });
}
export async function createApprovedBatch(
  videos: readonly RecordedVideo[], questions: readonly QuestionDto[],
  readFileIdentity: (path: string) => Promise<UploadFileIdentity>,
  account: { ownerId: string; clientId: string },
  now = new Date().toISOString(), id = `batch-${Date.now()}-${Math.random().toString(36).slice(2)}`,
): Promise<ApprovedUploadBatch> {
  if (!isUuid(account.ownerId) || !isUuid(account.clientId)) throw new Error(t('uploadApproval.notReady'));
  const frozen = freezeUploadSelection(videos, questions);
  const entries: ApprovedUploadEntry[] = [];
  for (const video of frozen) {
    const question = video.questionSnapshot!;
    const file = await readFileIdentity(video.filePath);
    const trim = requestedTrim(video)!;
    const entryId = `${id}:${entries.length}`;
    const intent: UploadIntent = {
      contract_version: 2, client_entry_id: entryId, take_id: video.id,
      question_id: question.id, question_index: question.index, question_updated_at: question.updated_at,
      question_text: question.text, language: question.language,
      source_sha256: file.sha256, source_size_bytes: file.sizeBytes,
      trim_start_ms: trim.startMs,
      trim_end_ms: trim.endMs,
      expected_current_segment_id: video.expectedCurrentSegmentId!,
    };
    if (!validIntent(intent) || !file.md5) throw new Error(t('uploadApproval.verifyFailed'));
    const entry = { id: entryId, ...account, video, question, file, intent, attempt: null, confirmation: null };
    entries.push({ ...entry, contentIdentity: entryIdentity(entry) });
  }
  return { version: 2, id, ...account, approvedAt: now, status: 'pending', entries };
}
export function validConfirmation(entry: ApprovedUploadEntry, confirmation: UploadConfirmation): boolean {
  return !!entry.attempt && !!confirmation && receiptMatches(confirmation.receipt, entry.intent, entry.ownerId, entry.clientId, entry.attempt.attemptId)
    && confirmation.segmentId === confirmation.receipt.segment_id && confirmation.confirmedAt === confirmation.receipt.accepted_at;
}
function validEntry(entry: ApprovedUploadEntry, ownerId: string, clientId: string): boolean {
  return !!entry && isOpaqueId(entry.id) && !!entry.video?.filePath && validVideo(entry.video)
    && snapshotQuestion(entry.question as QuestionDto) !== null
    && questionSnapshotMatches(entry.video.questionSnapshot, entry.question as QuestionDto)
    && entry.ownerId === ownerId && entry.clientId === clientId
    && Number.isSafeInteger(entry.file?.sizeBytes) && entry.file.sizeBytes > 0 && !!entry.file.md5 && isSha256(entry.file.sha256)
    && validIntent(entry.intent) && entry.intent.client_entry_id === entry.id && entry.intent.take_id === entry.video.id
    && entry.intent.source_sha256 === entry.file.sha256 && entry.intent.source_size_bytes === entry.file.sizeBytes
    && sameIntent(entry.intent, expectedIntent(entry)) && entry.contentIdentity === entryIdentity(entry)
    && (entry.attempt === null || (!!entry.attempt && isUuid(entry.attempt.attemptId)
      && (entry.attempt.expiresAt === null || isIsoDate(entry.attempt.expiresAt))
      && (entry.attempt.requiredHeaders === null || (typeof entry.attempt.requiredHeaders === 'object' && Object.values(entry.attempt.requiredHeaders).every(value => typeof value === 'string')))
      && (entry.attempt.confirmationRequested === undefined || typeof entry.attempt.confirmationRequested === 'boolean')))
    && (entry.confirmation === null || validConfirmation(entry, entry.confirmation));
}
function mayHavePendingReceipt(entry: ApprovedUploadEntry): entry is PendingUploadReceipt {
  return !!entry?.attempt && entry.attempt.confirmationRequested !== false && entry.confirmation === null;
}
export function pendingReceiptsForBatch(batch: ApprovedUploadBatch | null): PendingUploadReceipt[] {
  return batch?.entries.filter(mayHavePendingReceipt) ?? [];
}
export function restorePendingUploadReceipts(value: unknown, ownerId: string): PendingUploadReceipt[] {
  if (!Array.isArray(value)) return [];
  const byAttempt = new Map<string, PendingUploadReceipt>();
  for (const entry of value as ApprovedUploadEntry[]) {
    try {
      if (mayHavePendingReceipt(entry) && isUuid(entry.clientId) && isUuid(ownerId) && validEntry(entry, ownerId, entry.clientId)) {
        byAttempt.set(entry.attempt.attemptId, entry);
      }
    } catch {
      // One damaged entry must not discard other exact recovery records.
    }
  }
  return [...byAttempt.values()];
}
export function availableUploadTakes(videos: readonly RecordedVideo[], pending: readonly PendingUploadReceipt[]): RecordedVideo[] {
  const waiting = new Set(pending.map(entry => entry.question.id));
  return videos.filter(take => take.isPrimary !== false && !hasExactAcknowledgement(take)
    && (!take.questionSnapshot || !waiting.has(take.questionSnapshot.id)));
}
export function restoreApprovedBatch(value: unknown): ApprovedUploadBatch | null {
  try {
    const batch = JSON.parse(JSON.stringify(value)) as ApprovedUploadBatch;
    if (batch.version !== 2 || !isOpaqueId(batch.id) || !isUuid(batch.ownerId) || !isUuid(batch.clientId) || !isIsoDate(batch.approvedAt) || !Array.isArray(batch.entries) || !batch.entries.length) return null;
    const ids = new Set<string>(), questions = new Set<string>();
    for (const entry of batch.entries) {
      if (!validEntry(entry, batch.ownerId, batch.clientId) || ids.has(entry.id) || questions.has(entry.question.id)) return null;
      ids.add(entry.id); questions.add(entry.question.id);
    }
    const complete = batch.entries.every(entry => entry.confirmation !== null);
    if (batch.status !== (complete ? 'completed' : 'pending')) return null;
    return batch;
  } catch { return null; }
}
function expectedIntent(entry: ApprovedUploadEntry): UploadIntent {
  const snapshot = entry.video.questionSnapshot;
  const trim = requestedTrim(entry.video);
  return { contract_version: 2, client_entry_id: entry.id, take_id: entry.video.id,
    question_id: snapshot?.id ?? '', question_index: snapshot?.index ?? 0,
    question_updated_at: snapshot?.updated_at ?? '', question_text: snapshot?.text ?? '', language: snapshot?.language as UploadIntent['language'],
    source_sha256: entry.file.sha256, source_size_bytes: entry.file.sizeBytes,
    trim_start_ms: trim?.startMs ?? -1,
    trim_end_ms: trim?.endMs ?? null,
    expected_current_segment_id: entry.video.expectedCurrentSegmentId!,
  };
}
export function checkpointBatchAttempt(batch: ApprovedUploadBatch, entryId: string, attempt: UploadAttemptCheckpoint): ApprovedUploadBatch {
  const entry = batch.entries.find(entry => entry.id === entryId);
  if (!entry || !isUuid(attempt.attemptId) || (entry.attempt && entry.attempt.attemptId !== attempt.attemptId)) throw new Error(t('uploadApproval.receiptMismatch'));
  const checkpoint = { ...attempt, requiredHeaders: attempt.requiredHeaders ? { ...attempt.requiredHeaders } : null };
  if (entry.attempt?.confirmationRequested === true) checkpoint.confirmationRequested = true;
  return { ...batch, entries: batch.entries.map(entry => entry.id === entryId ? { ...entry, attempt: checkpoint } : entry) };
}
export function confirmBatchEntry(batch: ApprovedUploadBatch, entryId: string, confirmation: UploadConfirmation): ApprovedUploadBatch {
  const approved = batch.entries.find(entry => entry.id === entryId);
  if (!approved || !validConfirmation(approved, confirmation)) throw new Error(t('uploadApproval.receiptMismatch'));
  const entries = batch.entries.map(entry => entry.id === entryId && !entry.confirmation ? { ...entry, confirmation: JSON.parse(JSON.stringify(confirmation)) } : entry);
  return { ...batch, entries, status: entries.every(entry => entry.confirmation) ? 'completed' : 'pending' };
}
export function batchSummary(batch: ApprovedUploadBatch | null) {
  const total = batch?.entries.length ?? 0;
  const completed = batch?.entries.filter(entry => entry.confirmation).length ?? 0;
  return { total, completed, complete: total > 0 && total === completed, progress: total ? completed / total : 0 };
}
export function isQuestionLocked(batch: ApprovedUploadBatch | null, index: number, preparing?: readonly RecordedVideo[], questionId?: string): boolean {
  return !!preparing?.some(video => questionId ? video.questionSnapshot?.id === questionId : video.questionIndex === index)
    || (batch?.status === 'pending' && batch.entries.some(entry => questionId ? entry.question.id === questionId : entry.video.questionIndex === index));
}
export function isExactConfirmedTake(batch: ApprovedUploadBatch | null, video: RecordedVideo): boolean {
  return hasExactAcknowledgement(video) || !!batch?.entries.some(entry => entry.confirmation && validConfirmation(entry, entry.confirmation) && takeIdentity(entry.video) === takeIdentity(video));
}
function validVideo(video: RecordedVideo): boolean {
  const start = video.trimStartSeconds ?? 0, end = video.trimEndSeconds ?? video.durationSeconds;
  return isOpaqueId(video.id) && Number.isInteger(video.questionIndex) && video.questionIndex >= 0 && Number.isFinite(video.durationSeconds) && video.durationSeconds > 0
    && Number.isFinite(start) && Number.isFinite(end) && start >= 0 && Math.round(start * 1000) < Math.round(end * 1000) && end <= video.durationSeconds
    && requestedTrim(video) !== null;
}
export function hasExactAcknowledgement(video: RecordedVideo): boolean {
  const ack = video.uploadAcknowledgement, receipt = ack?.receipt;
  if (!ack || !receipt || ack.identity !== takeIdentity(video) || ack.confirmedAt !== receipt.accepted_at) return false;
  if (receipt.distributor_id !== currentAccount()) return false;
  const intent = receipt.intent, snapshot = video.questionSnapshot;
  const trim = requestedTrim(video);
  return !!snapshot && intent.take_id === video.id && intent.question_id === snapshot.id && intent.question_text === snapshot.text
    && intent.question_index === snapshot.index && intent.question_updated_at === snapshot.updated_at && intent.language === snapshot.language
    && !!trim && intent.trim_start_ms === trim.startMs && intent.trim_end_ms === trim.endMs
    && intent.expected_current_segment_id === video.expectedCurrentSegmentId
    && validIntent(intent) && receiptMatches(receipt, intent, receipt.distributor_id, receipt.client_id);
}
export function acknowledgeConfirmedTakes(videos: readonly RecordedVideo[], batch: ApprovedUploadBatch): RecordedVideo[] {
  return batch.entries.reduce((takes, entry) => entry.confirmation ? acknowledgeUploadReceipt(takes, entry, entry.confirmation) : takes, [...videos]);
}
export function acknowledgeUploadReceipt(videos: readonly RecordedVideo[], entry: ApprovedUploadEntry, confirmation: UploadConfirmation): RecordedVideo[] {
  if (!validConfirmation(entry, confirmation)) throw new Error(t('uploadApproval.receiptMismatch'));
  const identity = takeIdentity(entry.video);
  return videos.map(video => takeIdentity(video) === identity
    ? { ...video, uploadAcknowledgement: { identity, confirmedAt: confirmation.confirmedAt, receipt: confirmation.receipt } }
    : video);
}
