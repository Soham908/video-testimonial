import type { RecordedVideo } from './recordings';
import type { PersistedSession } from './session';

export type TakeState = Pick<PersistedSession, 'videos' | 'takesByQuestion' | 'selectedTakeId' | 'keptTakeIds'>;

export function firstUnansweredQuestion(videos: readonly RecordedVideo[], total: number): number | null {
  const answered = new Set(videos.map(video => video.questionIndex));
  for (let index = 0; index < total; index++) if (!answered.has(index)) return index;
  return null;
}

export function planTakeDeletion(state: TakeState, questionIndex: number, takeId: string) {
  const pool = [...state.videos.filter(take => take.questionIndex === questionIndex), ...(state.takesByQuestion[questionIndex] ?? [])];
  const removed = pool.find(take => take.id === takeId);
  if (!removed) return null;

  const saved = state.videos.filter(take => take.questionIndex === questionIndex && take.id !== takeId);
  const primary = saved.find(take => take.isPrimary === true) ?? saved.find(take => take.isPrimary !== false) ?? saved[0];
  const videos = state.videos.filter(take => take.questionIndex !== questionIndex || take.id !== takeId)
    .map(take => take.questionIndex === questionIndex ? { ...take, isPrimary: take.id === primary?.id } : take);
  const takesByQuestion = { ...state.takesByQuestion };
  const pending = (takesByQuestion[questionIndex] ?? []).filter(take => take.id !== takeId);
  if (pending.length) takesByQuestion[questionIndex] = pending;
  else delete takesByQuestion[questionIndex];
  const remaining = [...videos.filter(take => take.questionIndex === questionIndex), ...pending];
  const ids = new Set(remaining.map(take => take.id));
  const selectedTakeId = state.selectedTakeId && ids.has(state.selectedTakeId)
    ? state.selectedTakeId : primary?.id ?? remaining[remaining.length - 1]?.id ?? null;
  // Each surviving take retains its own trim/capture metadata. Only the
  // deleted ID is removed from the keep selection; the existing <=2 rule
  // continues to keep every remaining take automatically.
  const next: TakeState = { videos, takesByQuestion, selectedTakeId, keptTakeIds: (state.keptTakeIds ?? []).filter(id => ids.has(id)) };
  const referenced = [...videos, ...Object.values(takesByQuestion).flat()].some(take => take.filePath === removed.filePath);
  return { next, remaining, fileToDelete: referenced ? undefined : removed.filePath };
}

// Checkpoint first: a crash after unlinking cannot restore a deleted take.
// If unlinking fails, restore the old checkpoint and leave UI state intact.
export function commitTakeDeletion<T>(previous: T, next: T, filePath: string | undefined, persist: (state: T) => void, remove: (path: string) => void): void {
  persist(next);
  if (!filePath) return;
  try { remove(filePath); }
  catch (error) {
    try { persist(previous); }
    catch (rollbackError) { console.error('[delete-take] could not restore checkpoint', rollbackError); }
    throw error;
  }
}
