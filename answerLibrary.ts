import { hasExactAcknowledgement } from './uploadBatch';
import type { RecordedVideo } from './recordings';
import type { SegmentDto } from './myVideos';
import type { QuestionDto } from './questions';
import type { AnswerRow } from './screens/MyVideosScreen';
import { isFullSourceSelection } from './trim';

export function localMatchesRevision(video: RecordedVideo, segment: SegmentDto): boolean {
  const receipt = video.uploadAcknowledgement?.receipt;
  return hasExactAcknowledgement(video) && !!receipt && segment.integrity_status === 'verified_v2'
    && segment.segment_id === receipt.segment_id && segment.receipt_id === receipt.receipt_id
    && segment.question_id === receipt.intent.question_id && segment.source_sha256 === receipt.verified.source_sha256
    && segment.source_size_bytes === receipt.verified.source_size_bytes
    && segment.trim_start_ms === receipt.intent.trim_start_ms
    && segment.trim_end_ms === receipt.intent.trim_end_ms
    && segment.source_duration_ms === receipt.verified.source_duration_ms;
}
export function revisionCacheIdentity(segment: SegmentDto): string {
  return JSON.stringify([segment.segment_id, segment.receipt_id, segment.question_id, segment.source_sha256,
    segment.source_size_bytes, segment.trim_start_ms, segment.trim_end_ms, segment.playback_status]);
}
// An explicit local reselection of a historical answer is a new submission
// decision. Retain its historical receipt, but move its local identity away
// from that old approval. Its prior accepted revision is the safe stale CAS
// basis until the user explicitly reviews a newer current answer.
export function reviewedTakeSelection(video: RecordedVideo, current?: SegmentDto): RecordedVideo {
  if (!hasExactAcknowledgement(video) || (current && localMatchesRevision(video, current))) return video;
  return { ...video, expectedCurrentSegmentId: video.uploadAcknowledgement!.receipt!.segment_id };
}
export function buildAnswerRows(videos: readonly RecordedVideo[], questions: readonly QuestionDto[], segments: readonly SegmentDto[]): AnswerRow[] {
  const rows = new Map<number, AnswerRow>();
  for (let qIndex = 0; qIndex < questions.length; qIndex++) {
    const question = questions[qIndex];
    const local = videos.filter(video => video.questionSnapshot ? video.questionSnapshot.id === question.id : video.questionIndex === qIndex);
    const primary = local.find(video => video.isPrimary !== false) ?? local[0];
    // Legacy positional rows are candidates for deliberate CAS replacement,
    // never proof of a question snapshot or verified participant playback.
    const segment = segments.find(segment => segment.question_id === question.id)
      ?? segments.find(segment => !segment.question_id && segment.question_index === question.index);
    if (!primary && !segment) continue;
    const label = `Question ${qIndex + 1}`;
    const exact = primary && segment && localMatchesRevision(primary, segment);
    const privatePrimary = primary && (!segment || !hasExactAcknowledgement(primary));
    const remotePlay = segment?.integrity_status === 'verified_v2' && segment.playback_status === 'ready' && segment.playback_url
      ? { filePath: segment.playback_url, label } : null;
    const localPlay = primary && isFullSourceSelection(primary) ? { filePath: primary.filePath, label } : null;
    const play = privatePrimary ? localPlay : exact && localPlay ? localPlay : remotePlay;
    rows.set(qIndex, {
      questionIndex: qIndex, label, questionText: privatePrimary ? primary.questionSnapshot?.text ?? question.text : segment?.question_text ?? primary?.questionSnapshot?.text ?? question.text,
      play, uploaded: !privatePrimary && !!segment,
      serverSegmentId: segment?.segment_id ?? null,
      hasLocalTakes: local.length > 0,
      playbackStatus: play ? 'ready' : privatePrimary ? 'local_trim' : segment?.integrity_status === 'legacy_unverified' ? 'legacy_unverified' : segment?.playback_status === 'failed' ? 'failed' : 'processing',
      takes: local.length ? [...local].sort((a, b) => Number(b.id === primary?.id) - Number(a.id === primary?.id)).map(video => ({ id: video.id, play: isFullSourceSelection(video) ? { filePath: video.filePath, label } : null, durationSeconds: video.durationSeconds }))
        : [{ id: segment?.segment_id ?? `legacy-${qIndex}`, play, durationSeconds: segment?.duration_seconds ?? 0 }],
    });
  }
  return [...rows.values()];
}
