import { File, Paths } from 'expo-file-system';
import { apiGet } from './api';

// Ordered by `index` server-side (API_CONTRACT.md) - count and content vary
// per client (5 for the internal test client, 7 for IFB), so nothing in
// this app may assume a fixed number of questions or a specific index
// range. `id` is stable across reorders/edits on the backend; `index` is
// just display/ordering, not a safe key for anything (see deviceInfo.ts's
// sibling reasoning in CameraAlignment.tsx for why "position" and
// "identity" are kept separate here too).
export interface QuestionDto {
  id: string;
  index: number;
  is_branded: boolean;
  text: string;
  vo_playback_url: string;
  // Null when the client hasn't configured talking points for this
  // question, or when the resolved language's array hasn't been
  // translated yet (backend today only has these for "en" - see
  // localizeQuestion in the backend repo). No fallback to English there,
  // so a null here is expected, not a bug - QuestionBriefScreen/
  // RecordingScreen already degrade to no prompts for it.
  talking_points: string[] | null;
}

// Only 'en' is ever requested today - a real language selector is a later
// change (CLAUDE.md). Passed as a query param rather than hardcoded so the
// plumbing is already in place once that selector exists; the backend
// falls back to the distributor's stored language_pref if omitted.
export const DEFAULT_LANGUAGE = 'en';

export async function fetchQuestions(language: string = DEFAULT_LANGUAGE): Promise<QuestionDto[]> {
  const { questions } = await apiGet<{ questions: QuestionDto[] }>(
    `/distributors/me/questions?language=${encodeURIComponent(language)}`,
  );
  return questions;
}

// --- Local cache: cache-first, refresh-in-background ----------------------
// A distributor on patchy rural data must never hit a blank screen because
// a request timed out - the cached set (if any) is shown immediately while
// a fresh fetch happens in the background; a failed fetch just keeps
// whatever's already showing. Same synchronous file-read/write pattern as
// session.ts (no new dependency, no async race with the launch-restore
// effect that needs this synchronously).
const CACHE_FILE_NAME = 'questions-cache.json';

function getCacheFile(): File {
  return new File(Paths.document, CACHE_FILE_NAME);
}

export function getCachedQuestions(): QuestionDto[] | null {
  const file = getCacheFile();
  if (!file.exists) return null;
  try {
    const parsed = JSON.parse(file.textSync());
    return Array.isArray(parsed) ? (parsed as QuestionDto[]) : null;
  } catch {
    return null;
  }
}

export function cacheQuestions(questions: QuestionDto[]): void {
  const file = getCacheFile();
  if (!file.exists) file.create();
  file.write(JSON.stringify(questions));
}
