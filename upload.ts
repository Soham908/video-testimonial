import { File } from 'expo-file-system';
import { ApiError, apiPost } from './api';
import type { RecordedVideo } from './recordings';

interface UploadUrlResponse {
  upload_url: string;
  video_key: string;
}

interface ConfirmResponse {
  segment: unknown;
}

// Goes straight to S3 via the presigned URL - never through api.ts's
// request() wrapper, since that always attaches our own Authorization
// header and forces a JSON content type, either of which would break the
// S3 signature on this URL.
//
// Uses expo-file-system's File.upload() (native, streams from disk)
// rather than fetch(fileUri).blob() + fetch(url, {body: blob}) - the blob
// approach pulls the entire file into a single in-memory buffer first,
// which OOM-crashed on a real recorded video (SDK 57's fetch is the
// OkHttp-backed expo/fetch module, not classic RN Networking). No new
// dependency - expo-file-system was already in use for local storage.
async function putVideoBytes(uploadUrl: string, filePath: string): Promise<void> {
  const file = new File(filePath);
  const result = await file.upload(uploadUrl, { httpMethod: 'PUT' });
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Upload to storage failed (status ${result.status}).`);
  }
}

// Uploads one recorded segment end-to-end: presigned URL -> PUT bytes ->
// confirm. Retries the whole sequence once if confirm comes back
// video_not_found - per API_CONTRACT.md that specifically means the PUT
// never actually landed in S3 and "nothing was written," i.e. safe to
// redo, not a fatal error.
export async function uploadSegment(video: RecordedVideo, isRetry = false): Promise<void> {
  const questionIndex1Based = video.questionIndex + 1;

  const { upload_url, video_key } = await apiPost<UploadUrlResponse>('/segments/upload-url', {
    question_index: questionIndex1Based,
  });

  await putVideoBytes(upload_url, video.filePath);

  try {
    await apiPost<ConfirmResponse>('/segments/confirm', {
      question_index: questionIndex1Based,
      video_key,
      duration: video.durationSeconds,
    });
  } catch (error) {
    const isVideoNotFound = error instanceof ApiError && error.code === 'video_not_found';
    if (isVideoNotFound && !isRetry) {
      await uploadSegment(video, true);
      return;
    }
    throw error;
  }
}
