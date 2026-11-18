import type { RecordedVideo } from './recordings';

export type SavedFeedbackDestination = 'postKeep' | 'home' | 'myVideos';
export interface SavedFeedback {
  id: number;
  destination: SavedFeedbackDestination;
  completed: number;
  previousCompleted: number;
  total: number;
  kind: 'first' | 'saved' | 'updated' | 'allSaved';
  // UI-only one-shot token, shared across remounts of the same feedback.
  animation: { current: boolean };
}

export function keptAnswerCount(videos: readonly RecordedVideo[], total: number): number {
  return new Set(videos.filter(video => video.questionIndex >= 0 && video.questionIndex < total).map(video => video.questionIndex)).size;
}

export function savedFeedback(previous: readonly RecordedVideo[], next: readonly RecordedVideo[], questionIndex: number, total: number, id: number, destination: SavedFeedbackDestination): SavedFeedback {
  const previousCompleted = keptAnswerCount(previous, total);
  const completed = keptAnswerCount(next, total);
  const updated = previous.some(video => video.questionIndex === questionIndex);
  const kind = total > 0 && completed === total && previousCompleted < total ? 'allSaved'
    : updated ? 'updated' : completed === 1 ? 'first' : 'saved';
  return { id, destination, completed, previousCompleted, total, kind, animation: { current: false } };
}

export function confirmedUploadSummary(videos: readonly RecordedVideo[], confirmedIndices: readonly number[]) {
  const required = new Set(videos.filter(video => video.isPrimary !== false).map(video => video.questionIndex));
  const confirmed = new Set(confirmedIndices.filter(index => required.has(index)));
  const total = required.size, completed = confirmed.size;
  return { total, completed, complete: total > 0 && completed === total, progress: total > 0 ? completed / total : 0 };
}
