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
  // Bumps whenever this question's text/talking_points/VO changes
  // server-side (API_CONTRACT.md) - drives voCache.ts's local-first check,
  // same `updated_at`-compare pattern as myVideos.ts's segments/
  // rendered-videos caching.
  updated_at: string;
}

// No in-app language selector exists yet (CLAUDE.md) - `language` is an
// explicit, deliberate override for when one lands, not something this app
// has a value for today. Omitted (not defaulted to 'en') whenever the
// caller doesn't pass one, so the backend falls through to the
// distributor's own stored language_pref instead of every distributor
// silently getting English regardless of their real preference.
export async function fetchQuestions(language?: string): Promise<QuestionDto[]> {
  const query = language ? `?language=${encodeURIComponent(language)}` : '';
  const { questions } = await apiGet<{ questions: QuestionDto[] }>(`/distributors/me/questions${query}`);
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
