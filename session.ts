import { File, Paths } from 'expo-file-system';
import { accountFile, currentAccount, ownsRecording } from './accountStorage';
import type { RecordedVideo } from './recordings';
import { acknowledgeConfirmedTakes, pendingReceiptsForBatch, restoreApprovedBatch, restorePendingUploadReceipts,
  type ApprovedUploadBatch, type PendingUploadReceipt } from './uploadBatch';
import type { MainTab } from './screens/BottomTabBar';

// Persists the in-progress recording session (which question, every take,
// trim choices, upload status) so a force-quit at any point during the
// question/upload flow can be restored on relaunch instead of resetting.
// Deliberately excludes pre-session screens (login/onboarding/consent/
// permissions) and ephemeral UI-only state (countdown ticker, popups,
// My Videos' server-fetched rows) - those either don't need surviving a
// force-quit or are cheaply refetched/recomputed on restore.

const SESSION_FILES = ['session-state.json', 'session-state.backup.json'] as const;
const SESSION_VERSION = 5;

// The subset of AppFlow's QuestionPhase that can actually be resumed as-is.
// 'countdown' and 'recording' are intentionally not included here - see
// restorableQuestionPhase() below for why.
export type PersistedQuestionPhase = 'brief' | 'rehearse' | 'cameraCheck' | 'countdown' | 'recording' | 'reviewTrim';

export type PersistedScreen = 'main' | 'question' | 'uploading';

export interface PersistedSession {
  version: number;
  ownerId: string;
  screen: PersistedScreen;
  mainTab: MainTab;
  questionIndex: number;
  phase: PersistedQuestionPhase;
  retakeQuestionIndex: number | null;
  videos: RecordedVideo[];
  takesByQuestion: Record<number, RecordedVideo[]>;
  selectedTakeId: string | null;
  // Which pool member ids (existing saved takes + this session's fresh
  // ones) are marked to keep, only meaningful once the combined pool
  // exceeds 2 (AppFlow.tsx's handleKeepTake) - trim/removeLastTwoSeconds
  // moved onto each take itself (recordings.ts) since up to 2 takes can
  // now be kept per question, so there's no longer a single flow-level
  // trim value to persist here. Optional because a session persisted
  // before this field existed can be restored without it - an empty
  // selection is always a safe default (handleKeepTake's own
  // pool.length <= 2 fallback keeps everything automatically anyway).
  keptTakeIds?: string[];
  autoStart: boolean;
  hasSubmittedBatch: boolean;
  approvedBatch?: ApprovedUploadBatch | null;
  pendingUploadReceipts?: PendingUploadReceipt[];
  // Deprecated compatibility fields; never grant approval on restore.
  uploadConfirmed: boolean;
  // question_index (0-based) of every video that upload.ts has already
  // successfully confirmed in the current batch - lets a force-quit
  // mid-upload resume from the next unconfirmed one instead of re-sending
  // everything.
  uploadedQuestionIndices: number[];
}

function readCheckpoint(file: File, ownerId: string): { revision: number; state: PersistedSession } | null {
  try {
    const parsed = JSON.parse(file.textSync());
    if (![2, 3, 4, SESSION_VERSION].includes(parsed?.version) || parsed.ownerId !== ownerId
      || !Array.isArray(parsed.videos) || !parsed.takesByQuestion || typeof parsed.takesByQuestion !== 'object'
      || Object.values(parsed.takesByQuestion).some(takes => !Array.isArray(takes))) return null;
    const revision = parsed.version === SESSION_VERSION ? parsed.checkpoint : 0;
    if (!Number.isSafeInteger(revision) || revision < 0) return null;
    const restored = parsed.version >= 4 ? restoreApprovedBatch(parsed.approvedBatch) : null;
    const approvedBatch = restored?.ownerId === ownerId ? restored : null;
    const pendingUploadReceipts = restorePendingUploadReceipts(parsed.pendingUploadReceipts, ownerId)
      .filter(entry => ownsRecording(entry.video.filePath, ownerId));
    const takes = [...parsed.videos, ...Object.values(parsed.takesByQuestion).flat()] as RecordedVideo[];
    if ([...takes, ...(approvedBatch?.entries.map(entry => entry.video) ?? [])]
      .some(video => typeof video?.filePath !== 'string' || !ownsRecording(video.filePath, ownerId))) return null;
    // Older approvals and MD5-only acknowledgements never authorize a v2 send.
    if (parsed.version < 4) for (const video of takes) delete video.uploadAcknowledgement;
    const { checkpoint: _checkpoint, ...state } = parsed;
    return { revision, state: { ...state, version: SESSION_VERSION, approvedBatch, pendingUploadReceipts,
      uploadConfirmed: false, uploadedQuestionIndices: [] } };
  } catch {
    return null;
  }
}

function readSlots(ownerId: string) {
  return SESSION_FILES.map(name => {
    const file = accountFile(name), exists = file.exists;
    return { file, exists, checkpoint: exists ? readCheckpoint(file, ownerId) : null };
  }).sort((a, b) => (b.checkpoint?.revision ?? -1) - (a.checkpoint?.revision ?? -1));
}

export function saveSession(state: Omit<PersistedSession, 'version' | 'ownerId'>): void {
  const ownerId = currentAccount();
  if (!ownerId) return;
  const [latest, spare] = readSlots(ownerId);
  if (!latest.checkpoint && (latest.exists || spare.exists)) throw new Error('No readable session checkpoint');
  // Expo overwrite/move can unlink its destination first. Alternate files so
  // a partial write always leaves the previously committed checkpoint intact.
  const file = latest.checkpoint ? spare.file : latest.file;
  if (!file.exists) file.create();
  file.write(JSON.stringify({ ...state, ownerId, version: SESSION_VERSION, checkpoint: (latest.checkpoint?.revision ?? 0) + 1 }));
}

export function loadSession(): PersistedSession | null {
  const ownerId = currentAccount();
  if (!ownerId) return null;
  const [latest, spare] = readSlots(ownerId);
  const state = latest.checkpoint?.state;
  if (!state || !spare.exists || spare.checkpoint || state.approvedBatch?.status !== 'pending') return state ?? null;
  // An interrupted checkpoint could have been a cancellation. Recover the old
  // takes and receipts, while requiring fresh approval for any future send.
  return { ...state, approvedBatch: null, videos: acknowledgeConfirmedTakes(state.videos, state.approvedBatch),
    pendingUploadReceipts: restorePendingUploadReceipts([
      ...(state.pendingUploadReceipts ?? []), ...pendingReceiptsForBatch(state.approvedBatch),
    ], ownerId) };
}

export function clearSession(): void {
  if (!currentAccount()) return;
  for (const name of SESSION_FILES) {
    const file = accountFile(name);
    if (file.exists) file.delete();
  }
}

// True only once real progress exists worth restoring - an empty/default
// session (fresh install, never past onboarding) shouldn't skip onboarding
// just because a session file happens to exist.
export function hasMeaningfulProgress(session: PersistedSession): boolean {
  return (
    session.videos.length > 0 ||
    !!session.pendingUploadReceipts?.length ||
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
