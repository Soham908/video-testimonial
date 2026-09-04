import { Directory, File, Paths } from 'expo-file-system';
import type { QuestionDto } from './questions';

// Each question's vo_playback_url is a presigned S3 URL that expires after
// 1 hour (API_CONTRACT.md) - the in-memory `questions` array is only
// fetched once per session (login/restore), so a distributor who takes
// longer than that to get through the flow would hit a dead link for
// later questions. Downloading the audio once and playing it from local
// storage from then on sidesteps that entirely - a local file has no
// expiry, so playback never depends on the URL's freshness again after
// the first successful download.
const VO_DIR_NAME = 'vo-cache';

function getVoDirectory(): Directory {
  const dir = new Directory(Paths.document, VO_DIR_NAME);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

function getVoFile(questionId: string): File {
  // Keyed by question id, not index/position - same reasoning as the old
  // bundled-mp3 map this replaced (CLAUDE.md): id is stable across
  // reorders/edits, index isn't.
  return new File(getVoDirectory(), `${questionId}.mp3`);
}

// null when this question's audio hasn't been downloaded yet (or never
// will be, if the download failed) - callers fall back to the question's
// own vo_playback_url in that case.
export function getLocalVoUri(questionId: string): string | null {
  const file = getVoFile(questionId);
  return file.exists ? file.uri : null;
}

// --- Local-first sync cache -------------------------------------------
// Same `updated_at`-compare pattern as myVideos.ts's segment/rendered-video
// caching: a single JSON file mapping question id -> the `updated_at` we
// last downloaded VO against. Lets a re-recorded VO (backend bumps
// `updated_at` on that question - API_CONTRACT.md) get picked up
// automatically, instead of the old "skip if any local file exists"
// check, which had no way to notice a backend-side change at all.
const SYNC_CACHE_FILE_NAME = 'vo-sync-cache.json';

function getSyncCacheFile(): File {
  return new File(Paths.document, SYNC_CACHE_FILE_NAME);
}

type SyncCache = Record<string, string>;

function readSyncCache(): SyncCache {
  const file = getSyncCacheFile();
  if (!file.exists) return {};
  try {
    return JSON.parse(file.textSync());
  } catch {
    return {};
  }
}

function writeSyncCache(cache: SyncCache): void {
  const file = getSyncCacheFile();
  if (!file.exists) file.create();
  file.write(JSON.stringify(cache));
}

// Downloads each question's VO whenever its `updated_at` differs from what
// was last downloaded against (or nothing's been downloaded yet) - skips
// only when both the local file and a matching sync-cache entry already
// exist. clearVoCache() (dev-menu action) still works as a manual
// full-reset, but is no longer the only way to pick up a re-recorded clip.
// Best-effort per file: one failed download doesn't block the others, and
// that question's "Read to me"/countdown VO just falls back to the
// (possibly-expired-by-then) remote URL, same as before this cache
// existed.
export async function cacheQuestionAudio(questions: QuestionDto[]): Promise<void> {
  const cache = readSyncCache();
  await Promise.all(
    questions.map(async (question) => {
      const file = getVoFile(question.id);
      if (file.exists && cache[question.id] === question.updated_at) return;
      try {
        await File.downloadFileAsync(question.vo_playback_url, file, { idempotent: true });
        cache[question.id] = question.updated_at;
      } catch (error) {
        console.error(`[voCache] failed to download VO for question ${question.id}`, error);
      }
    }),
  );
  writeSyncCache(cache);
}

// Testing-only - wired to a __DEV__ menu action, kept as a manual
// full-reset fallback now that cacheQuestionAudio() detects real changes
// on its own via `updated_at`. Not a production feature.
export function clearVoCache(): void {
  const dir = getVoDirectory();
  if (dir.exists) dir.delete();
  const syncFile = getSyncCacheFile();
  if (syncFile.exists) syncFile.delete();
}
