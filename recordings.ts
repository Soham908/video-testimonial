import { Directory, File, Paths } from 'expo-file-system';

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
  // 0-based - which question this answer belongs to. Used to find/replace
  // the right entry on retake (id isn't usable for that: it embeds a
  // timestamp, so it changes on every re-record of the same question).
  questionIndex: number;
  // Wall-clock duration of the recording in seconds - measured from when
  // startRecording() was called to when the file was finalized. Required
  // by POST /segments/confirm per API_CONTRACT.md.
  durationSeconds: number;
  // Trim metadata only - Review & Trim's timeline doesn't do any actual
  // media processing (no frame thumbnails/waveform, no bundled video/audio
  // decode dependency - see DECISIONS.md). These are just the chosen
  // in/out points and toggle state, applied at upload/render time.
  // undefined (not pre-seeded to 0..duration) until an actual drag happens
  // - upload.ts's `!= null` check is what distinguishes "never touched"
  // from "deliberately chose the full clip," no separate flag needed.
  // Per-take (not a single flow-level value) since up to 2 takes can now
  // be kept per question (AppFlow.tsx's take-keeping flow) and each needs
  // its own trim state to survive switching between them in Review & Trim.
  trimStartSeconds?: number;
  trimEndSeconds?: number;
  removeLastTwoSeconds?: boolean;
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
}

const RECORDINGS_DIR_NAME = 'recordings';

function getRecordingsDirectory(): Directory {
  const dir = new Directory(Paths.document, RECORDINGS_DIR_NAME);
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
  const file = new File(filePath);
  if (file.exists) {
    file.delete();
  }
}
