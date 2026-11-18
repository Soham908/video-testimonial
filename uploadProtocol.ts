import type { LanguageCode } from './preferences';

// The v2 wire contract is shared with the API. No storage capability or owner
// supplied by the client selects the destination of an upload.
export interface UploadIntent {
  contract_version: 2;
  client_entry_id: string;
  take_id: string;
  question_id: string;
  question_index: number;
  question_updated_at: string;
  question_text: string;
  language: LanguageCode;
  source_sha256: string;
  source_size_bytes: number;
  trim_start_ms: number;
  trim_end_ms: number | null;
  expected_current_segment_id: string | null;
}
export interface AcceptedReceipt {
  contract_version: 2;
  receipt_id: string;
  attempt_id: string;
  distributor_id: string;
  client_id: string;
  segment_id: string;
  accepted_at: string;
  intent: UploadIntent;
  verified: {
    source_sha256: string;
    source_size_bytes: number;
    source_duration_ms: number;
    effective_trim_start_ms: number;
    effective_trim_end_ms: number;
    source_identity: { video_key: string; etag?: string; version_id?: string; write_once: true };
  };
}
export interface AttemptEnvelope {
  contract_version: 2;
  attempt_id: string;
  state: 'awaiting_upload' | 'validating' | 'accepted' | 'rejected' | 'conflict';
  intent: UploadIntent;
  upload: { upload_url: string; required_headers: Record<string, string>; expires_at: string } | null;
  receipt: AcceptedReceipt | null;
  error_code?: string;
  // Only create responses may prove a new server-generated key. Never persist
  // this hint: after a restart even a fresh attempt may already have bytes.
  created?: boolean;
}
export interface UploadAttemptCheckpoint {
  attemptId: string;
  requiredHeaders: Record<string, string> | null;
  expiresAt: string | null;
  // Missing on older manifests. Treat that as potentially dispatched.
  confirmationRequested?: boolean;
}
export interface UploadCapabilities {
  contract_version: 2;
  intake_enabled: boolean;
  immutable_attempts: true;
  sha256: true;
  write_once: true;
  selected_playback: true;
  legacy_writes_allowed: false;
  limits: { source_size_bytes: number; duration_ms: number };
}
export const MAX_SOURCE_BYTES = 268435456;
export const MAX_DURATION_MS = 180000;
export const isUuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const isIsoDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
export const isOpaqueId = (value: unknown): value is string => typeof value === 'string' && /^[\x20-\x7e]{1,160}$/.test(value);
export const isSha256 = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export const isLanguage = (value: unknown): value is LanguageCode => value === 'en' || value === 'hi' || value === 'mr';
export const isIntegerIn = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;

// Explicit field order also rejects unexpected/missing fields; JSON key order
// in a server response is irrelevant to this comparison.
const intentKeys: (keyof UploadIntent)[] = ['contract_version', 'client_entry_id', 'take_id', 'question_id', 'question_index', 'question_updated_at', 'question_text', 'language', 'source_sha256', 'source_size_bytes', 'trim_start_ms', 'trim_end_ms', 'expected_current_segment_id'];
export function sameIntent(actual: UploadIntent, expected: UploadIntent): boolean {
  return !!actual && Object.keys(actual).length === intentKeys.length && intentKeys.every(key => actual[key] === expected[key]);
}
export function validIntent(value: UploadIntent): boolean {
  return !!value && value.contract_version === 2 && Object.keys(value).length === intentKeys.length
    && isOpaqueId(value.client_entry_id) && isOpaqueId(value.take_id) && isUuid(value.question_id)
    && isIntegerIn(value.question_index, 1, 2147483647) && isIsoDate(value.question_updated_at)
    && typeof value.question_text === 'string' && value.question_text.length > 0 && value.question_text.length <= 4096
    && isLanguage(value.language) && isSha256(value.source_sha256) && isIntegerIn(value.source_size_bytes, 1, MAX_SOURCE_BYTES)
    && isIntegerIn(value.trim_start_ms, 0, MAX_DURATION_MS - 1)
    && (value.trim_end_ms === null || isIntegerIn(value.trim_end_ms, value.trim_start_ms + 1, MAX_DURATION_MS))
    && (value.expected_current_segment_id === null || isUuid(value.expected_current_segment_id));
}
export function receiptMatches(receipt: AcceptedReceipt, intent: UploadIntent, ownerId: string, clientId: string, attemptId?: string): boolean {
  if (!receipt || receipt.contract_version !== 2 || !isUuid(receipt.receipt_id) || !isUuid(receipt.attempt_id) || !isUuid(receipt.segment_id)
    || receipt.distributor_id !== ownerId || receipt.client_id !== clientId || !isIsoDate(receipt.accepted_at)
    || (attemptId !== undefined && receipt.attempt_id !== attemptId) || !sameIntent(receipt.intent, intent)) return false;
  const verified = receipt.verified;
  if (!verified || verified.source_sha256 !== intent.source_sha256 || verified.source_size_bytes !== intent.source_size_bytes
    || !isIntegerIn(verified.source_duration_ms, 1, MAX_DURATION_MS)
    || verified.effective_trim_start_ms !== intent.trim_start_ms
    || verified.effective_trim_end_ms !== (intent.trim_end_ms ?? verified.source_duration_ms)
    || !isIntegerIn(verified.effective_trim_end_ms, verified.effective_trim_start_ms + 1, verified.source_duration_ms)) return false;
  const source = verified.source_identity;
  return !!source && source.write_once === true
    && source.video_key === `clients/${clientId}/distributors/${ownerId}/uploads/${receipt.attempt_id}/source.mp4`
    && (source.etag === undefined || typeof source.etag === 'string')
    && (source.version_id === undefined || typeof source.version_id === 'string');
}
