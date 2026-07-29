import { File, Paths } from 'expo-file-system';
import { apiGet } from './api';

export interface SegmentDto {
  question_index: number;
  status: 'uploaded' | 'transcribing' | 'transcribed' | 'failed';
  playback_url: string;
  duration_seconds: number;
  created_at: string;
  updated_at: string;
}

export interface RenderedVideoDto {
  question_index: number;
  status: 'rendering' | 'rendered' | 'failed';
  playback_url: string | null;
  updated_at: string;
}

export async function fetchSegments(): Promise<SegmentDto[]> {
  const { segments } = await apiGet<{ segments: SegmentDto[] }>('/distributors/me/segments');
  return segments;
}

export async function fetchRenderedVideos(): Promise<RenderedVideoDto[]> {
  const { rendered_videos } = await apiGet<{ rendered_videos: RenderedVideoDto[] }>(
    '/distributors/me/rendered-videos',
  );
  return rendered_videos;
}

// A segment appearing in the list at all means it's already durably
// uploaded - `failed` on a segment is about the (invisible-to-the-user)
// transcription pipeline downstream of that, not the video itself. Per
// product decision, the distributor never needs to know about
// transcription/subtitle-baking status - their own recorded answer is
// either there or it isn't, so this always reads as ready once listed.
// Only the branded/rendered video has a meaningful status distinction
// worth surfacing (processing / ready / failed) - see renderedUserStatus.
export type UserFacingStatus = 'processing' | 'ready' | 'failed';

export function renderedUserStatus(status: RenderedVideoDto['status']): UserFacingStatus {
  if (status === 'rendered') return 'ready';
  if (status === 'failed') return 'failed';
  return 'processing';
}

// --- Basic local-first cache ---------------------------------------------
// Deliberately minimal, per product decision ("a super basic basic one"):
// a single JSON file mapping question_index -> the segment updated_at we
// last synced against. No versioning, no per-field diffing - just enough
// to tell "has the server's copy of this segment changed since we last
// looked" before deciding whether the local file is still safe to play
// instead of the network playback_url.
const CACHE_FILE_NAME = 'my-videos-sync-cache.json';

function getCacheFile(): File {
  return new File(Paths.document, CACHE_FILE_NAME);
}

type SyncCache = Record<number, string>;

function readCache(): SyncCache {
  const file = getCacheFile();
  if (!file.exists) return {};
  try {
    return JSON.parse(file.textSync());
  } catch {
    return {};
  }
}

function writeCache(cache: SyncCache): void {
  const file = getCacheFile();
  if (!file.exists) file.create();
  file.write(JSON.stringify(cache));
}

// Returns true if `updatedAt` matches what's cached for this question -
// i.e. nothing has changed server-side since last sync, so a local file
// (if one exists) is still safe to play instead of fetching playback_url.
// Always refreshes the cache to the latest `updatedAt` as a side effect,
// so the next check reflects whatever the server just reported.
export function checkAndSyncCache(questionIndex: number, updatedAt: string): boolean {
  const cache = readCache();
  const matches = cache[questionIndex] === updatedAt;
  cache[questionIndex] = updatedAt;
  writeCache(cache);
  return matches;
}
