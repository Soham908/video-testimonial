import { Directory, File } from 'expo-file-system';
import { accountDirectory, ownsRecording } from './accountStorage';
import type { QuestionDto } from './questions';
import type { AcceptedReceipt } from './uploadProtocol';
import { isIsoDate, isLanguage, isUuid } from './uploadProtocol';

export interface RecordedQuestionSnapshot {
  id: string;
  index: number;
  text: string;
  updated_at: string;
  language: 'en' | 'hi' | 'mr';
}
export function snapshotQuestion(question: QuestionDto | undefined): RecordedQuestionSnapshot | null {
  if (!question || !isUuid(question.id) || !Number.isInteger(question.index) || question.index < 1
    || !isIsoDate(question.updated_at) || !question.text || !isLanguage(question.language)) return null;
  return { id: question.id, index: question.index, text: question.text, updated_at: question.updated_at, language: question.language };
}
export function questionSnapshotMatches(snapshot: RecordedQuestionSnapshot | undefined, question: QuestionDto | undefined): boolean {
  const current = snapshotQuestion(question);
  return !!snapshot && !!current && snapshot.id === current.id && snapshot.index === current.index
    && snapshot.text === current.text && snapshot.updated_at === current.updated_at && snapshot.language === current.language;
}
// The position is navigation state only. A removed stable question remains
// recoverable as an unmatched local take; it never attaches to its old slot.
export function reconcileTakePositions(videos: readonly RecordedVideo[], questions: readonly QuestionDto[]): RecordedVideo[] {
  return videos.map(video => video.questionSnapshot
    ? { ...video, questionIndex: questions.findIndex(question => question.id === video.questionSnapshot!.id) }
    : video);
}

// What the device actually captured, gathered once at record-finish time
// (see CameraAlignment.tsx's CaptureFormatInfo + AppFlow.tsx's
// handleRecordingFinished). This only exists at capture time and can't be
// reconstructed afterwards, so it's carried on the take/segment from here
// through to the confirm call in upload.ts. `width`/`height`/`fps` are
// null when the underlying session didn't report a value.
export interface CaptureMetadata {
  fileSizeBytes: number;
  width: number | null;
  height: number | null;
  fps: number | null;
  codec: string;
  deviceModel: string;
  osVersion: string;
}

export interface RecordedVideo {
  id: string;
  label: string;
  // A file:// URI in the app's durable document storage (see
  // recordings.ts) - not a public gallery, moved there from VisionCamera's
  // temp cache once the recording is finalized.
  filePath: string;
  // Navigation position only, reconciled from questionSnapshot.id. A removed
  // question uses -1 while its owned original remains recoverable.
  questionIndex: number;
  questionSnapshot?: RecordedQuestionSnapshot;
  // Frozen when the user reviews/retakes this answer. Approval and retries
  // must not silently substitute a newer accepted server revision.
  expectedCurrentSegmentId?: string | null;
  // Initial capture timing is diagnostic only. Review replaces this with
  // actual native media duration and sets durationVerified before Keep or
  // approval. Backend probing remains the authority for accepted duration.
  durationSeconds: number;
  durationVerified?: boolean;
  trimAdjustedForReview?: boolean;
  // Trim metadata only - Review & Trim's timeline doesn't do any actual
  // media processing (no frame thumbnails/waveform, no bundled video/audio
  // decode dependency - see DECISIONS.md). These are just the chosen
  // in/out points, applied before server playback/STT/render. The "remove last 2
  // seconds" toggle isn't separate state of its own - it's derived from
  // trimEndSeconds (ReviewTrimScreen.tsx), so it can never drift out of
  // sync with what actually gets trimmed. undefined (not pre-seeded to
  // 0..duration) until an actual drag/toggle happens - upload.ts's `!= null`
  // check is what distinguishes "never touched" from "deliberately chose
  // the full clip," no separate flag needed.
  // Per-take (not a single flow-level value) since up to 2 takes can now
  // be kept per question (AppFlow.tsx's take-keeping flow) and each needs
  // its own trim state to survive switching between them in Review & Trim.
  trimStartSeconds?: number;
  trimEndSeconds?: number;
  // True for whichever of up to 2 kept takes is the one that actually gets
  // uploaded (AppFlow.tsx's upload effect uploads primary-only) and shown
  // by default in My Videos. Exactly one take per questionIndex is primary
  // at any time; switchable locally (no camera, no upload) from My Videos'
  // take picker. Optional because a session persisted before this field
  // existed had exactly one take per question, implicitly primary.
  isPrimary?: boolean;
  // Optional because a session persisted before this field existed
  // (see session.ts) can be restored without it - never absent on a take
  // recorded going forward.
  captureMetadata?: CaptureMetadata;
  // Local API acknowledgement bound to exact take/trim identity. This is
  // not a cryptographically verified server receipt and never permits unlink.
  uploadAcknowledgement?: { identity: string; confirmedAt: string; receipt?: AcceptedReceipt };

}

// How many takes a distributor can keep per question before having to pick
// which to drop (AppFlow.tsx's take-keeping flow, ReviewTrimScreen.tsx's
// picker). Single source of truth so raising this later (e.g. product
// wants 3) is a one-line change here, not a hunt for hardcoded 2s.
export const MAX_KEPT_TAKES = 2;

const RECORDINGS_DIR_NAME = 'recordings';

function getRecordingsDirectory(): Directory {
  const dir = new Directory(accountDirectory(), RECORDINGS_DIR_NAME);
  if (!dir.exists) {
    dir.create({ intermediates: true, idempotent: true });
  }
  return dir;
}

// VisionCamera's Recorder writes to a temp file in the app's cache dir
// (a plain filesystem path, not a file:// URI) - cache can be cleared by
// Android under storage pressure. Moves the finished recording into the
// app's document directory instead, which is safe from that, and returns
// the new file's file:// URI.
export function moveRecordingToDurableStorage(
  tempFilePath: string,
  fileName: string,
): string {
  const source = new File(`file://${tempFilePath}`);
  const destination = new File(getRecordingsDirectory(), fileName);
  source.moveSync(destination, { overwrite: true });
  return source.uri;
}

// Testing convenience: wipes all previously saved recordings so Home's
// list doesn't grow indefinitely across repeated test runs. Revisit for
// the real product - a real app would keep multiple completed sessions,
// not clear everything on each new one.
export function clearAllRecordings(): void {
  const dir = getRecordingsDirectory();
  if (dir.exists) {
    dir.delete();
  }
}

// Used by retake: the new take replaces the old one in `videos` state, but
// the old take's file on disk isn't cleaned up by that alone.
export function deleteRecording(filePath: string): void {
  if (!ownsRecording(filePath)) throw new Error("Recording belongs to a different or unknown account");
  const file = new File(filePath);
  if (file.exists) {
    file.delete();
  }
}
