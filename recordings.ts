import { Directory, File, Paths } from 'expo-file-system';

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
