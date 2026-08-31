import { File } from 'expo-file-system';
import { ApiError, apiPost } from './api';
import type { RecordedVideo } from './recordings';
import type { QuestionDto } from './questions';

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
//
// `questions` is the fetched, backend-ordered set this take was recorded
// against (CLAUDE.md) - `video.questionIndex` is only this app's own
// 0-based position within it, not a backend value. The real
// question_index to send is `questions[video.questionIndex].index`; today
// that always happens to equal `video.questionIndex + 1` (every seeded
// client's questions are 1-based and contiguous), but the API contract
// never promises that, so deriving it via +1 would be an assumption this
// app can no longer make now that the question set is backend-configured.
export async function uploadSegment(
  video: RecordedVideo,
  questions: QuestionDto[],
  isRetry = false,
): Promise<void> {
  const question = questions[video.questionIndex];
  if (!question) {
    throw new Error(`No question found for local position ${video.questionIndex} - question set may have changed since this was recorded.`);
  }
  const questionIndex = question.index;

  const { upload_url, video_key } = await apiPost<UploadUrlResponse>('/segments/upload-url', {
    question_index: questionIndex,
  });

  await putVideoBytes(upload_url, video.filePath);

  try {
    await apiPost<ConfirmResponse>('/segments/confirm', {
      question_index: questionIndex,
      video_key,
      duration: video.durationSeconds,
      // Best-effort - only exists at capture time, gathered in
      // AppFlow.tsx's handleRecordingFinished. Omitted entirely (rather
      // than sent as null/undefined fields) if a take somehow lacks it,
      // e.g. a session persisted before this field existed.
      ...(video.captureMetadata && {
        capture: {
          file_size_bytes: video.captureMetadata.fileSizeBytes,
          width: video.captureMetadata.width,
          height: video.captureMetadata.height,
          fps: video.captureMetadata.fps,
          codec: video.captureMetadata.codec,
          device_model: video.captureMetadata.deviceModel,
          os_version: video.captureMetadata.osVersion,
        },
      }),
    });
  } catch (error) {
    const isVideoNotFound = error instanceof ApiError && error.code === 'video_not_found';
    if (isVideoNotFound && !isRetry) {
      await uploadSegment(video, questions, true);
      return;
    }
    throw error;
  }
}
