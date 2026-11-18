import type { RecordedVideo } from './recordings';
import { MAX_DURATION_MS } from './uploadProtocol';

export function measuredDurationMs(seconds: number): number | null {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const duration = Math.floor(seconds * 1000);
  return Number.isSafeInteger(duration) && duration >= 1 && duration <= MAX_DURATION_MS ? duration : null;
}
export function requestedTrim(video: Pick<RecordedVideo, 'durationSeconds' | 'durationVerified' | 'trimStartSeconds' | 'trimEndSeconds'>): { startMs: number; endMs: number | null } | null {
  const duration = measuredDurationMs(video.durationSeconds);
  if (video.durationVerified !== true || duration === null) return null;
  const start = video.trimStartSeconds ?? 0, end = video.trimEndSeconds;
  if (!Number.isFinite(start) || start < 0 || (end !== undefined && (!Number.isFinite(end) || end <= start || end > video.durationSeconds + 0.0005))) return null;
  const startMs = Math.round(start * 1000);
  // A handle at source end means through the observed source end. It must
  // not turn tiny native/probe duration differences into a false overrun.
  const endMs = end === undefined || Math.abs(end - video.durationSeconds) <= 0.001 ? null : Math.round(end * 1000);
  if (!Number.isSafeInteger(startMs) || startMs < 0 || startMs >= duration
    || (endMs !== null && (!Number.isSafeInteger(endMs) || endMs <= startMs || endMs > duration))) return null;
  return { startMs, endMs };
}
export function isFullSourceSelection(video: Pick<RecordedVideo, 'durationSeconds' | 'durationVerified' | 'trimStartSeconds' | 'trimEndSeconds'>): boolean {
  if ((video.trimStartSeconds ?? 0) !== 0) return false;
  if (video.trimEndSeconds === undefined) return true;
  const trim = requestedTrim(video);
  return trim !== null && trim.startMs === 0 && trim.endMs === null;
}
// This normalization is confined to explicit local review, before approval.
// Submitted intervals are never silently clamped by the client/server.
export function normalizeReviewTrim(durationSeconds: number, startSeconds?: number, endSeconds?: number) {
  const durationMs = measuredDurationMs(durationSeconds);
  if (durationMs === null) return null;
  const finiteStart = Number.isFinite(startSeconds) ? Math.round(startSeconds! * 1000) : 0;
  const finiteEnd = Number.isFinite(endSeconds) ? Math.round(endSeconds! * 1000) : durationMs;
  const startMs = Math.max(0, Math.min(durationMs - 1, finiteStart));
  const endMs = Math.max(startMs + 1, Math.min(durationMs, finiteEnd));
  const start = startMs / 1000;
  const end = endMs === durationMs ? undefined : endMs / 1000;
  return { startSeconds: start, endSeconds: end,
    adjusted: (startSeconds !== undefined && (!Number.isFinite(startSeconds) || Math.round(startSeconds * 1000) !== startMs))
      || (endSeconds !== undefined && (!Number.isFinite(endSeconds) || Math.round(endSeconds * 1000) !== endMs)) };
}
export function trimAfterRemovingTail(durationSeconds: number, startSeconds: number, enabled: boolean) {
  const durationMs = measuredDurationMs(durationSeconds);
  if (durationMs === null || !Number.isFinite(startSeconds)) return null;
  const startMs = Math.round(startSeconds * 1000);
  if (startMs < 0 || startMs >= durationMs) return null;
  const endMs = enabled ? durationMs - 2000 : durationMs;
  if (endMs <= startMs) return null;
  return { startSeconds: startMs / 1000, endSeconds: endMs / 1000 };
}
export function draggedTrimMs(handle: 'start' | 'end', dx: number, width: number, durationMs: number, initialStartMs: number, initialEndMs: number) {
  if (![dx, width, durationMs, initialStartMs, initialEndMs].every(Number.isFinite) || width <= 0 || durationMs < 1) return null;
  const delta = Math.round(dx / width * durationMs);
  return handle === 'start'
    ? { startMs: Math.max(0, Math.min(initialEndMs - 1, initialStartMs + delta)), endMs: initialEndMs }
    : { startMs: initialStartMs, endMs: Math.min(durationMs, Math.max(initialStartMs + 1, initialEndMs + delta)) };
}
