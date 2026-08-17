import { File, Paths } from 'expo-file-system';
import type { RecordedVideo } from './recordings';
import type { MainTab } from './screens/BottomTabBar';

// Persists the in-progress recording session (which question, every take,
// trim choices, upload status) so a force-quit at any point during the
// question/upload flow can be restored on relaunch instead of resetting.
// Deliberately excludes pre-session screens (login/onboarding/consent/
// permissions) and ephemeral UI-only state (countdown ticker, popups,
// My Videos' server-fetched rows) - those either don't need surviving a
// force-quit or are cheaply refetched/recomputed on restore.

const SESSION_FILE_NAME = 'session-state.json';
const SESSION_VERSION = 1;

// The subset of AppFlow's QuestionPhase that can actually be resumed as-is.
// 'countdown' and 'recording' are intentionally not included here - see
// restorableQuestionPhase() below for why.
export type PersistedQuestionPhase = 'brief' | 'rehearse' | 'cameraCheck' | 'countdown' | 'recording' | 'reviewTrim';

export type PersistedScreen = 'main' | 'question' | 'uploading';

export interface PersistedSession {
  version: number;
  screen: PersistedScreen;
  mainTab: MainTab;
  questionIndex: number;
  phase: PersistedQuestionPhase;
  retakeQuestionIndex: number | null;
  videos: RecordedVideo[];
  takesByQuestion: Record<number, RecordedVideo[]>;
  selectedTakeId: string | null;
  trimStartSeconds: number;
  trimEndSeconds: number;
  removeLastTwoSeconds: boolean;
  autoStart: boolean;
  hasSubmittedBatch: boolean;
  uploadConfirmed: boolean;
  // question_index (0-based) of every video that upload.ts has already
  // successfully confirmed in the current batch - lets a force-quit
  // mid-upload resume from the next unconfirmed one instead of re-sending
  // everything.
  uploadedQuestionIndices: number[];
}

function getSessionFile(): File {
  return new File(Paths.document, SESSION_FILE_NAME);
}

export function saveSession(state: Omit<PersistedSession, 'version'>): void {
  const file = getSessionFile();
  if (!file.exists) file.create();
  file.write(JSON.stringify({ ...state, version: SESSION_VERSION }));
}

export function loadSession(): PersistedSession | null {
  const file = getSessionFile();
  if (!file.exists) return null;
  try {
    const parsed = JSON.parse(file.textSync());
    if (parsed?.version !== SESSION_VERSION) return null;
    return parsed as PersistedSession;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  const file = getSessionFile();
  if (file.exists) file.delete();
}

// True only once real progress exists worth restoring - an empty/default
// session (fresh install, never past onboarding) shouldn't skip onboarding
// just because a session file happens to exist.
export function hasMeaningfulProgress(session: PersistedSession): boolean {
  return (
    session.videos.length > 0 ||
    Object.keys(session.takesByQuestion).length > 0 ||
    session.screen !== 'main' ||
    session.mainTab !== 'home' ||
    session.hasSubmittedBatch
  );
}

// 'countdown' and 'recording' can never be resumed - there is no camera
// session to resume into, and (per CameraAlignment.tsx's
// onRecordingFinished contract) a take only exists in JS state once
// recording has actually finished, so an interrupted one was never kept
// anywhere restorable in the first place. Restoring instead lands on
// 'brief' for the same question, exactly what the hardware-back "stop and
// go back" confirmation already does for a deliberate cancel.
export function restorableQuestionPhase(phase: PersistedQuestionPhase): 'brief' | 'rehearse' | 'cameraCheck' | 'reviewTrim' {
  if (phase === 'countdown' || phase === 'recording') return 'brief';
  return phase;
}

// VisionCamera's Android Recorder writes an in-progress take to
// File.createTempFile("VisionCamera_", ".mp4") (see
// node_modules/react-native-vision-camera/android/.../HybridVideoOutput.kt),
// which resolves to java.io.tmpdir -> the app's cache dir, the same
// directory expo-file-system exposes as Paths.cache. A finished recording
// is moved out of there immediately (recordings.ts's
// moveRecordingToDurableStorage), so anything still matching this name on
// launch is an orphan from a take that was mid-capture when the app was
// force-quit - its onRecordingFinished callback never got the chance to
// run. Safe to delete unconditionally: nothing else in the app writes
// files with this prefix.
//
// iOS has no equivalent here: HybridVideoRecorder there writes to
// FileManager.default.temporaryDirectory (NSTemporaryDirectory) with a
// random UUID filename, not the cache dir expo-file-system exposes as
// Paths.cache, so an orphaned iOS temp file can't be positively located
// from JS to delete proactively. It never leaks into app state either way
// (same reasoning as restorableQuestionPhase above), and iOS documents
// NSTemporaryDirectory contents as system-purgeable, including "on next
// launch of the app that created them" - so it is still cleaned up, just
// by the OS rather than by us.
export function purgeOrphanedRecordingTempFiles(): void {
  const cacheDir = Paths.cache;
  if (!cacheDir.exists) return;
  for (const entry of cacheDir.list()) {
    if (entry instanceof File && /^VisionCamera_.*\.mp4$/.test(entry.name)) {
      try {
        entry.delete();
      } catch (error) {
        console.error('[session] failed to purge orphaned recording temp file', error);
      }
    }
  }
}
