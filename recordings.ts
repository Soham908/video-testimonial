import { Directory, File, Paths } from 'expo-file-system';

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
