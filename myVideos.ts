import { accountFile, currentAccount } from './accountStorage';
import { File, Paths } from 'expo-file-system';
import { apiGet } from './api';

export interface SegmentDto {
  segment_id?: string;
  question_id?: string | null;
  question_updated_at?: string | null;
  question_text?: string | null;
  language?: 'en' | 'hi' | 'mr' | null;
  integrity_status?: 'verified_v2' | 'legacy_unverified';
  receipt_id?: string | null;
  source_sha256?: string | null;
  source_size_bytes?: number | null;
  trim_start_ms?: number | null;
  trim_end_ms?: number | null;
  source_duration_ms?: number | null;
  playback_status?: 'pending' | 'ready' | 'failed' | 'unavailable' | 'legacy_unverified';
  question_index: number;
  status: 'uploaded' | 'transcribing' | 'transcribed' | 'failed';
  playback_url: string | null;
  duration_seconds: number;
  created_at: string;
  updated_at: string;
}

export interface RenderedVideoDto {
  segment_id?: string;
  question_id?: string | null;
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

// Acceptance and playback readiness are separate. A received revision may
// still be preparing its selected clip; the UI withholds default playback
// until playback_status is ready and a selected-content URL is available.
export type UserFacingStatus = 'processing' | 'ready' | 'failed';

export function renderedUserStatus(status: RenderedVideoDto['status']): UserFacingStatus {
  if (status === 'rendered') return 'ready';
  if (status === 'failed') return 'failed';
  return 'processing';
}

// Optional account-scoped observations keyed by stable question + revision.
// This cache never authorizes local playback: that requires a verified receipt
// matching the server segment, exact source SHA/size and selected interval.
const CACHE_FILE_NAME = 'my-videos-sync-cache.json';

function getCacheFile(): File {
  return accountFile(CACHE_FILE_NAME);
}

type SyncCache = Record<string, string>;

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

// Legacy positional/updated_at entries use different keys and cannot match a
// v2 observation. Revision identity includes source and selected interval.
export function checkAndSyncCache(questionId: string, revisionIdentity: string): boolean {
  const cache = readCache();
  const key = `v2:${questionId}`;
  const matches = cache[key] === revisionIdentity;
  cache[key] = revisionIdentity;
  writeCache(cache);
  return matches;
}
