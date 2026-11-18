import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Platform, StyleSheet, Text, View } from 'react-native';
import { File } from 'expo-file-system';
import * as Application from 'expo-application';
import BackgroundService from 'react-native-background-actions';
import { useCameraPermission, useMicrophonePermission } from 'react-native-vision-camera';
import { setActiveLanguage, useStrings } from './i18n/useStrings';
import { LoginScreen } from './screens/LoginScreen';
import { SelfRegisterScreen } from './screens/SelfRegisterScreen';
import { SplashScreen } from './screens/SplashScreen';
import { WhatsAppInviteScreen } from './screens/WhatsAppInviteScreen';
import { IdentityConfirmScreen } from './screens/IdentityConfirmScreen';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { ConsentScreen } from './screens/ConsentScreen';
import { PermissionsScreen } from './screens/PermissionsScreen';
import { HomeScreen } from './screens/HomeScreen';
import { MyVideosScreen, type AnswerRow, type BrandedRow } from './screens/MyVideosScreen';
import { HelpScreen } from './screens/HelpScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { BottomTabBar, type MainTab } from './screens/BottomTabBar';
import { VideoPlayerScreen, type PlayableVideo } from './screens/VideoPlayerScreen';
import { QuestionBriefScreen } from './screens/QuestionBriefScreen';
import { RehearseScreen } from './screens/RehearseScreen';
import { CameraCheckScreen } from './screens/CameraCheckScreen';
import { RecordingScreen } from './screens/RecordingScreen';
import { ReviewTrimScreen } from './screens/ReviewTrimScreen';
import { UpdateRequiredScreen } from './screens/UpdateRequiredScreen';
import { CameraAlignment, type CameraAlignmentHandle, type CaptureFormatInfo } from './CameraAlignment';
import { RetakeConfirmOverlay } from './screens/RetakeConfirmOverlay';
import { UploadingScreen } from './screens/UploadingScreen';
import { ConfirmationScreen } from './screens/ConfirmationScreen';
import { DevEntryMenu } from './components/dev/DevEntryMenu';
import { PopupSheet } from './components/ui/Modal';
import { Button } from './components/ui/Button';
import { useQuestionPrompts } from './useQuestionPrompts';
import { commitTakeDeletion, firstUnansweredQuestion, planTakeDeletion } from './takeDeletion';
import { keptAnswerCount, savedFeedback, type SavedFeedback } from './completionFeedback';
import { CompletionFeedback } from './components/CompletionFeedback';
import {
  moveRecordingToDurableStorage,
  clearAllRecordings,
  deleteRecording,
  MAX_KEPT_TAKES,
  snapshotQuestion,
  reconcileTakePositions,
  questionSnapshotMatches,
  type RecordedQuestionSnapshot,
  type RecordedVideo,
} from './recordings';
import { useTheme } from './theme/ThemeContext';
import { useHideNavigationBarWhile } from './theme/NavigationBarSync';
import { restoreSession, getCurrentAuth, logout, logoutIfSession, adoptRecoveredAuth } from './auth';
import { setSessionExpiredHandler, captureAuthSession, authSessionIsCurrent, type AuthSession } from './api';
import { activateAccount, accountScope, currentAccount, scopeIsCurrent } from './accountStorage';
import { rememberAccountDeletion, pendingAccountDeletion, requestAccountDeletion, finishLocalAccountDeletion, recoverAccountDeletion, reauthenticateAccountDeletion } from './accountDeletion';
import type { PhoneCountryCode } from './phoneNumbers';
import { hasConsented, markConsented } from './consent';
import { fetchDistributorProfile, type DistributorProfile } from './distributorProfile';
import { isVersionBelow } from './appVersion';
import { uploadSegment, recoverUploadReceipt, readUploadFileIdentity, requireUploadCapabilities } from './upload';
import { createApprovedBatch, freezeUploadSelection, takeIdentity, checkpointBatchAttempt, confirmBatchEntry, batchSummary,
  isQuestionLocked, isExactConfirmedTake, acknowledgeConfirmedTakes, acknowledgeUploadReceipt, hasExactAcknowledgement,
  availableUploadTakes, pendingReceiptsForBatch, type ApprovedUploadBatch, type PendingUploadReceipt, type UploadConfirmation } from './uploadBatch';
import { fetchSegments, fetchRenderedVideos, renderedUserStatus, type SegmentDto } from './myVideos';
import { buildAnswerRows, reviewedTakeSelection } from './answerLibrary';
import { normalizeReviewTrim, requestedTrim } from './trim';
import { getDeviceInfo } from './deviceInfo';
import { ENABLE_REEL_RENDERING, ENABLE_SELF_REGISTRATION } from './config';
import {
  getReadQuestionAloudPref,
  setReadQuestionAloudPref,
  getLanguagePref,
  setLanguagePref,
  type LanguageCode,
} from './preferences';
import {
  fetchQuestions,
  getCachedQuestions,
  cacheQuestions,
  type QuestionDto,
} from './questions';
import { cacheQuestionAudio, clearVoCache, getLocalVoUri } from './voCache';
import {
  saveSession,
  loadSession,
  clearSession,
  hasMeaningfulProgress,
  restorableQuestionPhase,
  purgeOrphanedRecordingTempFiles,
  type PersistedScreen,
  type PersistedSession,
} from './session';

// Lightweight state-based flow - no navigation library added yet, so this
// doesn't require any new native dependencies/rebuild. Swap for
// React Navigation later if the flow grows more complex (e.g. back
// gestures, deep links).
type Screen =
  | 'sessionLoading'
  | 'login'
  // The actual landing screen for an unauthenticated user during this
  // internal-testing phase (see DEFAULT_UNAUTHENTICATED_SCREEN below), also
  // reachable from Login's "New distributor? Register" link either way.
  // Covers both register and phone+password sign-in (SelfRegisterScreen's
  // own mode toggle) - either one proceeds exactly like a successful login
  // (handleAuthenticated).
  | 'selfRegister'
  // Entry-cluster screens (splash / WhatsApp-invite open / identity
  // confirmation / onboarding) - reachable for now only via the
  // __DEV__-gated DevEntryMenu below since real deep-link routing isn't
  // wired yet (DECISIONS.md).
  | 'splash'
  | 'whatsappInvite'
  | 'identityConfirm'
  | 'onboarding'
  | 'consent'
  | 'main'
  | 'permissions'
  | 'question'
  // Covers the whole send sequence: the pre-confirm review list, the
  // live-progress "release" state, and the post-completion "released"
  // state - all rendered from this one screen value (see the
  // screen === 'uploading' render block) so the upload-resume/persistence
  // logic never needs to know which of those three is currently visible.
  | 'uploading';

// Real entry point when ENABLE_SELF_REGISTRATION is on (config.ts) - this
// build currently targets the internal testing group (self-registering
// participants), not pre-provisioned distributor accounts, so landing on
// Login first (with no account to type in yet) was the wrong default.
// Falls back to 'login' when self-registration is off, e.g. a future build
// actually distributed to pre-seeded distributor accounts.
const DEFAULT_UNAUTHENTICATED_SCREEN: Screen = ENABLE_SELF_REGISTRATION ? 'selfRegister' : 'login';

// Question Brief is shown before every question (not just question 1) and
// always requires an explicit tap - Start recording or Rehearse - never
// auto-advances. Camera Check (framing/distance/sound) always runs right
// before recording, whichever path got there. Review & Trim is mandatory
// after every take, replacing the old conditional "alignment broke ->
// redo prompt" overlay: DECISIONS.md - "checks revealed one at a time,
// executed in parallel" (Camera Check) and "quality over smoothness"
// (mandatory review) apply throughout.
type QuestionPhase =
  | 'brief'
  | 'rehearse'
  | 'cameraCheck'
  | 'countdown'
  | 'recording'
  | 'reviewTrim';

const MAX_TAKES = 3;
// The full question audio finishes before these five seconds begin.
const COUNTDOWN_SECONDS = 5;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// The Android foreground-service upload wrapper's task body (see the effect
// near the real upload effect below) - deliberately does no work of its
// own. `uploadSegment` calls still come entirely from the untouched upload
// effect; this task's only job is to give react-native-background-actions
// something to run so the service (and the process priority that comes
// with it) stays alive. Loops on BackgroundService.isRunning() rather than
// a promise that never resolves - the library's own README uses this exact
// shape; stop() flips isRunning() false, which is what lets this loop (and
// so the task) actually end.
async function androidUploadKeepAliveTask(): Promise<void> {
  while (BackgroundService.isRunning()) {
    await sleep(1000);
  }
}

// Questions (text, count, order, VO) are backend-configured per client now,
// fetched via GET /distributors/me/questions (API_CONTRACT.md) - not
// hardcoded here any more. Nothing in this file may assume a fixed number
// of questions; the internal test client currently has 5, a real client
// engagement (e.g. IFB) will have 7. See `questions` state below.
//
// Per-question talking points and on-screen recording prompts (previously
// PLACEHOLDER_TALKING_POINTS/PLACEHOLDER_PROMPTS) have no backend
// equivalent yet - QuestionBriefScreen/RecordingScreen degrade gracefully
// with empty arrays (see their own components) rather than inventing
// placeholder content for backend-provided questions.

// Real upload is real (see upload.ts); mid-answer alignment-break detection
// during a live take still doesn't exist. Question VO, alignment guidance
// (incl. ambient noise check), and video recording/storage/playback are
// all real.
export function AppFlow({ onImmersiveChange }: { onImmersiveChange: (immersive: boolean) => void }) {
  const renderAccountScope = currentAccount() ? accountScope() : null;
  const renderAuthSession = captureAuthSession();
  const { colors, spacing } = useTheme();
  const { t } = useStrings();
  const [screen, setScreen] = useState<Screen>('sessionLoading');
  const [deletionBusy, setDeletionBusy] = useState(false);
  const [deletionRecovery, setDeletionRecovery] = useState<string | null>(null);
  const [deletionRecoveryOwner, setDeletionRecoveryOwner] = useState<string | null>(null);
  const deletionUIVersion = useRef(0);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [deletionNotice, setDeletionNotice] = useState(false);
  const [mainTab, setMainTab] = useState<MainTab>('home');
  const [questionIndex, setQuestionIndex] = useState(0);
  const [phase, setPhase] = useState<QuestionPhase>('brief');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [countdownRemaining, setCountdownRemaining] = useState(COUNTDOWN_SECONDS);
  const [questionAudioComplete, setQuestionAudioComplete] = useState(false);
  // Up to 2 entries per questionIndex now (the take-keeping flow below can
  // keep a runner-up alongside the primary) - `videos` itself is the right
  // source when something genuinely needs both (My Videos' take picker), but every
  // "how many questions has this distributor actually answered" count
  // elsewhere in this file means one video per question, so those read
  // primaryVideos instead. Undefined isPrimary is treated as primary (not
  // filtered out) - a session persisted before this field existed only
  // ever had exactly one entry per question, which was implicitly it.
  const [videos, setVideos] = useState<RecordedVideo[]>([]);
  const primaryVideos = videos.filter((v) => v.isPrimary !== false && v.questionIndex >= 0);
  const [playingVideo, setPlayingVideo] = useState<PlayableVideo | null>(null);
  // Non-null while retaking a single already-answered question from My
  // Videos - overrides lockMode to a full lock (this is a cold entry, not
  // a continuous session) and makes handleKeepTake replace that question's
  // existing entry instead of appending/advancing.
  const [retakeQuestionIndex, setRetakeQuestionIndex] = useState<number | null>(null);
  // The question index pending the "record again?" confirmation, shown
  // from My Videos before entering the camera flow at all.
  const [pendingRetake, setPendingRetake] = useState<number | null>(null);
  const [replacementReview, setReplacementReview] = useState<{ takeId: string; questionId: string; segmentId: string | null; play: PlayableVideo | null } | null>(null);
  const [replacementReviewError, setReplacementReviewError] = useState<string | null>(null);
  const retakeBaseRef = useRef<string | null>(null);
  const recordingSnapshotRef = useRef<{ question: RecordedQuestionSnapshot; expectedCurrentSegmentId: string | null } | null>(null);
  const [myVideosLoading, setMyVideosLoading] = useState(false);
  const [myVideosError, setMyVideosError] = useState<string | null>(null);
  const [answerRows, setAnswerRows] = useState<AnswerRow[]>([]);
  const [serverSegments, setServerSegments] = useState<SegmentDto[]>([]);
  const [brandedRows, setBrandedRows] = useState<BrandedRow[]>([]);
  const [myVideosRefreshToken, setMyVideosRefreshToken] = useState(0);
  const cameraRef = useRef<CameraAlignmentHandle>(null);
  const prepareQuestionAudio = useCallback(async () => {
    if (!cameraRef.current) throw new Error('Camera is not ready');
    await cameraRef.current.stopNoiseCheck();
  }, []);
  const handleQuestionAudioComplete = useCallback(() => setQuestionAudioComplete(true), []);
  // Live camera/mic permission status, read here (not just inside
  // CameraAlignment/PermissionsScreen) so "Start this question" from Home
  // can skip the whole Permissions explainer once both are already
  // granted - it was previously routing there unconditionally on every
  // tap, forcing a redundant "Allow camera and microphone" confirmation
  // even after the distributor had already granted both and completed a
  // question. Only a genuinely first-time or denied state should still
  // land on that screen.
  const cameraPermission = useCameraPermission();
  const microphonePermission = useMicrophonePermission();
  // Manual memo (a real useMemo can't live down where this gets read - see
  // its use site) for the resolved VO source of whichever question is
  // currently on screen. Pinned to that question's id and never updated
  // for it again until the id itself changes - deliberately NOT
  // recomputed on every voCacheVersion bump. useVideoPlayer(source)
  // creates a fresh native player and releases the old one whenever its
  // source argument changes; if that happened while CameraCheckScreen (or
  // QuestionBriefScreen) was still mounted for the same question - e.g.
  // the background VO download finished mid-countdown, flipping the
  // source from the remote URL to the just-downloaded local file - the
  // in-flight play/pause effect's cleanup was left holding a reference to
  // the now-released old player, crashing with "Cannot use shared object
  // that was already released" (real crash log, not hypothetical). Only a
  // question-id change (i.e. actually moving to a different question,
  // where nothing was still playing on the old one) is allowed to update
  // this - a language switch is also allowed to, since that can only
  // happen from Settings, never while a question's VO player is actually
  // mounted/playing.
  const voSourceRef = useRef<{ questionId: string; language: string; url: string | undefined } | null>(null);

  // Backend-configured question set (CLAUDE.md) - cache-first: shown
  // immediately from questions-cache.json on launch/login, refreshed in
  // the background right after. `questionsError` is only ever set when
  // there's truly nothing to show (no cache and the fetch also failed) -
  // a distributor on patchy rural data must never hit a blank screen just
  // because one request timed out.
  const [questions, setQuestions] = useState<QuestionDto[]>([]);
  const [questionsError, setQuestionsError] = useState<string | null>(null);
  // Bumped once each time cacheQuestionAudio finishes downloading whatever
  // wasn't already cached locally (voCache.ts). The value itself is never
  // read - this is purely a force-a-re-render trigger, so the plain
  // getLocalVoUri() lookup near the bottom of this component (recomputed
  // fresh on every render, same as questionText/talkingPoints there) picks
  // up a just-downloaded local file instead of sitting on the remote URL
  // until some unrelated state change happens to re-render this component.
  const [, setVoCacheVersion] = useState(0);

  // The one real piece of distributor identity available today - GET /me
  // only returns auth-scoped ids, not a display name/phone (see auth.ts).
  // Set on both a restored session and a fresh login; cleared on logout so
  // a different account signing in on the same device never shows a stale
  // id. Used by ProfileScreen's "Distributor ID" row.
  const [distributorId, setDistributorId] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const consentResumeScreen = useRef<Screen>('main');
  // Real name/phone (distributorProfile.ts) - fetched alongside distributorId
  // on both a restored session and a fresh login, best-effort (a failed
  // fetch just leaves whatever's already there, same as loadQuestions()'s
  // tolerance below). Only `name`/`phone` are consumed anywhere in the app
  // today - `business`/`city`/`years_as_distributor` also come back on this
  // same response but are internal-test-phase-only fields nothing reads yet.
  const [distributorProfile, setDistributorProfile] = useState<DistributorProfile | null>(null);
  // True right after api.ts's session-expired handler forces a logout mid-
  // flow (a token that died, not a fresh login attempt with wrong
  // credentials - see setSessionExpiredHandler's registration below) - shows
  // a one-time explanatory banner on the next Login render, cleared as soon
  // as a login actually succeeds (handleAuthenticated).
  const [sessionExpiredNotice, setSessionExpiredNotice] = useState(false);

  // Whether the Camera Check screen's toggle auto-starts the countdown once
  // checks pass, or waits for an explicit "Start recording" tap - no
  // backing state existed for this before (countdown-after-lock was
  // unconditional); this is genuinely new, not a reskin. Not reset
  // per-question - it's a standing preference the person sets once.
  const [autoStart, setAutoStart] = useState(true);
  // Whether the question is read aloud before the five-second countdown (existing
  // per-question VO, same clip QuestionBriefScreen's "Read to me" plays) -
  // a standing device preference, not per-question/per-session state, so it
  // lives in SecureStore (preferences.ts) rather than session.ts. Defaults
  // true; loaded async below, same pattern ThemeContext uses for
  // palette/font.
  const [readQuestionAloud, setReadQuestionAloudState] = useState(true);
  // Local-only override for GET /distributors/me/questions' ?language=
  // param (preferences.ts) - null means "never explicitly chosen," which
  // is meaningfully different from 'en': it lets the backend fall through
  // to the distributor's own stored language_pref instead of forcing
  // English. Loaded together with the initial restore below (not in its
  // own simple effect like readQuestionAloud) because the very first
  // loadQuestions() call needs the resolved value before it fires, not
  // whatever this state happens to hold by the time that unrelated effect
  // gets around to resolving - two independent async reads racing each
  // other would make that ordering unreliable.
  const [language, setLanguageState] = useState<LanguageCode | null>(null);
  // Mirrors `language` into the i18n module's own external store (see its
  // own comment for why - AppFlow has many early `return`s, no single JSX
  // root to wrap in a Context Provider) so every screen's useStrings()
  // re-renders whenever this state changes, without threading `language`
  // as a prop through every one of them.
  useEffect(() => {
    setActiveLanguage(language);
  }, [language]);
  // True once CameraAlignment's onLocked has fired for the current attempt
  // (framing/distance locked and sound clear or overridden) - drives
  // whether Camera Check's Start button is tappable.
  const [checksReady, setChecksReady] = useState(false);
  // Bumped every time a fresh Camera Check attempt begins (initial entry
  // from Brief/Rehearse, or "Record another" from Review & Trim) - folded
  // into CameraAlignment's `resetToken` so its internal lock cycle actually
  // restarts even when questionIndex itself hasn't changed.
  const [takeAttempt, setTakeAttempt] = useState(0);

  // Up to MAX_TAKES retained recordings per question, kept until one is
  // explicitly kept via Review & Trim (DECISIONS.md: takes capped at 3,
  // oldest replaced). Cleared for a question once a take from it is kept.
  const [takesByQuestion, setTakesByQuestion] = useState<Record<number, RecordedVideo[]>>({});
  const [selectedTakeId, setSelectedTakeId] = useState<string | null>(null);
  // Trim metadata (recordings.ts) now lives directly on each take object,
  // not as flat flow-level state - see updatePoolTake below (near
  // handleKeepTake). This is what lets 2 kept takes each carry their own
  // trim independently, and what makes switching the previewed take in
  // Review & Trim never lose an in-progress edit on the take being
  // switched away from (previously, switching reset a single shared
  // trimStartSeconds/trimEndSeconds to the newly-selected take's default,
  // silently discarding whatever hadn't been committed yet).
  //
  // Which pool member ids (this question's existing saved takes + this
  // session's fresh ones - see reviewPoolFor below) are marked to keep.
  // Only meaningful once the pool exceeds 2 - handleKeepTake keeps
  // everything in the pool automatically when it's 2 or fewer, no picking
  // needed.
  const [keptTakeIds, setKeptTakeIds] = useState<string[]>([]);
  // Shown after "Keep this take" while another question is unanswered -
  // DECISIONS.md's "post-keep prompt: next question / my videos / home".
  const [showPostKeepPrompt, setShowPostKeepPrompt] = useState(false);
  // Shown when the hardware back button is pressed during cameraCheck/
  // countdown/recording/reviewTrim - these phases have no on-screen back
  // affordance by design (DECISIONS.md's "no tap-to-advance, ever" during
  // recording), but a hardware back press is a deliberate enough signal
  // that it deserves a real way out, just gated behind a confirmation
  // rather than exiting silently or being blocked outright.
  const [pendingExitConfirm, setPendingExitConfirm] = useState(false);
  // Shown after a native recording failure (onRecordingError below) - a
  // storage-full write error, encoder fault, or the mic getting taken by
  // another app are exactly the kind of budget/mid-range-Android quirks
  // CLAUDE.md and CameraAlignment.tsx's own comments call out as expected
  // on this device range. Previously this callback only logged to console
  // with no state change at all, which left the distributor frozen on the
  // Recording screen indefinitely - the timer kept ticking (it's a plain
  // setInterval unrelated to the actual native recorder state) with no
  // signal anything was wrong and no automatic way forward
  // (FRONTEND_AUDIT_2026-09-09.md §3, "most important finding"). The fix
  // reuses the exact same recovery confirmExitQuestionFlow already does for
  // a deliberate hardware-back exit during recording - cancel the broken
  // recording, drop back to Brief - just triggered automatically instead of
  // requiring the person to discover a hardware-back gesture on their own.
  const [recordingFailedVisible, setRecordingFailedVisible] = useState(false);

  // Set right when startRecording() is called (not when 'recording' phase
  // is entered - those happen in the same tick anyway, but this is the
  // actual moment being measured). Read in handleRecordingFinished to
  // compute durationSeconds - the on-screen elapsedSeconds ticker isn't
  // usable for this, it's reset to 0 the instant phase leaves 'recording',
  // which happens before the finished callback fires.
  const recordingStartedAtRef = useRef(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadAttempt, setUploadAttempt] = useState(0);
  const [approvedBatch, setApprovedBatch] = useState<ApprovedUploadBatch | null>(null);
  // Updated synchronously at approval/checkpoint boundaries, so a second tap
  // cannot create another batch before React commits the first one.
  const approvedBatchRef = useRef<ApprovedUploadBatch | null>(null);
  const [pendingUploadReceipts, setPendingUploadReceipts] = useState<PendingUploadReceipt[]>([]);
  const pendingUploadReceiptsRef = useRef<PendingUploadReceipt[]>([]);
  const preparingUploadRef = useRef<{ videos: RecordedVideo[]; controller: AbortController } | null>(null);
  const [uploadPreparing, setUploadPreparing] = useState(false);
  const uploadConfirmed = approvedBatch !== null;
  const uploadedQuestionIndices = approvedBatch?.entries.filter(entry => entry.confirmation).map(entry => entry.video.questionIndex) ?? [];
  const uploadRunning = useRef(false);
  // True once the launch-time restore (session.ts) has run to completion -
  // gates the persistence effect below so it can never fire with the
  // component's initial default state and clobber a just-loaded session
  // file before the restore's own setState calls have applied.
  const [sessionRestored, setSessionRestored] = useState(false);
  // True once a batch has been sent successfully at least once - drives
  // Home's "submitted, being prepared" state. Deliberately does NOT hide
  // the upload entry point in My Videos afterward - a retake after
  // submitting still needs a way to send the updated video (this is the
  // fix for the retake-never-reuploads gap: My Videos' Upload button
  // always re-sends whatever is currently in `videos`, retaken or not).
  const [hasSubmittedBatch, setHasSubmittedBatch] = useState(false);

  // Fetches the current question set and updates both the cache and
  // in-memory state. Called once auth is confirmed - both on a fresh login
  // and on a restored launch (see below) - and again whenever the user
  // retries after a no-cache-no-network error. On failure, deliberately
  // keeps whatever's already showing (the cache, already loaded into state
  // before this is called) rather than clearing it - only sets
  // `questionsError` when there's truly nothing to fall back to.
  // `languageOverride` lets a caller pass the just-resolved/just-picked
  // value explicitly instead of relying on `language` state, which may not
  // have committed yet in the same tick (the initial launch call, and the
  // language-switch handler, both need this) - omit it entirely to use
  // whatever `language` currently holds, which is correct for every other
  // caller (retry button, fresh login/register).
  // Rapid language choices must not be overwritten by an older, slower response.
  function loadOwnedProfile() {
    const scope = accountScope();
    fetchDistributorProfile().then(profile => { if (scopeIsCurrent(scope)) setDistributorProfile(profile); }).catch(() => {});
  }
  const questionsRequest = useRef(0);
  const questionsCatalogRef = useRef<QuestionDto[]>(questions);
  questionsCatalogRef.current = questions;
  async function loadQuestions(languageOverride?: LanguageCode | null) {
    if (!currentAccount()) return;
    const scope = accountScope();
    const request = ++questionsRequest.current;
    const lang = languageOverride === undefined ? language : languageOverride;
    try {
      const fresh = await fetchQuestions(lang ?? undefined);
      if (request !== questionsRequest.current || !scopeIsCurrent(scope)) return;
      cacheQuestions(fresh);
      questionsCatalogRef.current = fresh;
      setVideos(previous => reconcileTakePositions(previous, fresh));
      setTakesByQuestion(previous => {
        const regrouped: Record<number, RecordedVideo[]> = {};
        for (const take of reconcileTakePositions(Object.values(previous).flat(), fresh)) (regrouped[take.questionIndex] ??= []).push(take);
        return regrouped;
      });
      setQuestions(fresh);
      setQuestionsError(null);
      // Fire-and-forget, same tolerance as fetchDistributorProfile() above -
      // a failed download just leaves that question's VO on the remote URL,
      // it doesn't block anything else here. 'default' (not 'en') when no
      // override has ever been chosen - see voCache.ts's own comment for
      // why guessing a real language code here would be wrong.
      cacheQuestionAudio(fresh, lang ?? 'default')
        .then(() => setVoCacheVersion((v) => v + 1))
        .catch(() => {});
    } catch (error) {
      if (request !== questionsRequest.current || !scopeIsCurrent(scope)) return;
      setQuestions((current) => {
        if (current.length === 0) {
          setQuestionsError(
            error instanceof Error ? error.message : t('appFlow.questionsLoadErrorFallback'),
          );
        }
        return current;
      });
    }
  }

  // Runs once on launch - a stored token merely being present doesn't mean
  // it's still valid, so restoreSession() confirms it against GET /me
  // before skipping the login screen. No dependency on `screen` - this
  // must only ever run once per app launch, not on every re-render.
  //
  // Once auth is confirmed, also restores the persisted recording session
  // (session.ts) if one exists and has real progress - this is what lets a
  // force-quit anywhere in the question/upload flow come back to a
  // coherent state instead of resetting to onboarding. `sessionRestored`
  // is set true in every branch so the save effect below always knows the
  // restore attempt has finished, whether or not there was anything to
  // restore.
  async function bootstrapApp() {
    const version = deletionUIVersion.current;
    setBootstrapError(null);
    // Resolved together, not in two independent effects each racing to
    // finish first - the very first loadQuestions() call below needs the
    // real preference value, not whichever of two unrelated async reads
    // happens to land first.
    try {
      let recoveryFailure: unknown = null;
      let recoveryOwner: string | null = null;
      try {
        recoveryOwner = pendingAccountDeletion()?.owner ?? null;
        if (await recoverAccountDeletion() === 'accepted') setDeletionNotice(true);
      } catch (error) { recoveryFailure = error; }
      if (deletionUIVersion.current !== version) return;
      const [auth, lang] = await Promise.all([restoreSession(), getLanguagePref()]);
      if (deletionUIVersion.current !== version) return;
      setLanguageState(lang);
      if (recoveryFailure && (!auth || auth.distributorId === recoveryOwner)) {
        setDeletionRecoveryOwner(recoveryOwner);
        setDeletionRecovery(recoveryFailure instanceof Error ? recoveryFailure.message : t('deletion.recoveryError'));
        return;
      }
      if (auth && pendingAccountDeletion(auth.distributorId)) {
        await handleAuthenticated(); return;
      }
      setDeletionBusy(false); setDeletionRecovery(null); setDeletionRecoveryOwner(null);
      if (!auth) {
        setScreen(DEFAULT_UNAUTHENTICATED_SCREEN);
        setSessionRestored(true);
        return;
      }
      activateAccount(auth.distributorId);
      setDistributorId(auth.distributorId);
      setClientId(auth.clientId);
      const currentConsent = hasConsented(auth.distributorId);
      setConsentAccepted(currentConsent);
      loadOwnedProfile();

      // Cache-first: show whatever's on disk immediately (if anything),
      // then kick a real fetch in the background - loadQuestions() keeps
      // this exact value on failure rather than clearing it. cachedQuestions
      // is also used below to bounds-check a restored questionIndex against
      // the question set actually known right now, synchronously - not the
      // (still in-flight) network response.
      const cachedQuestions = getCachedQuestions();
      if (cachedQuestions && cachedQuestions.length > 0) {
        setQuestions(cachedQuestions);
      }
      loadQuestions(lang);

      restoreOwnedProgress(currentConsent, cachedQuestions);

    } catch (error) { if (deletionUIVersion.current === version) setBootstrapError(error instanceof Error ? error.message : 'Could not restore your account. Please retry.'); }
  }
  useEffect(() => { void bootstrapApp(); }, []);

  function restoreOwnedProgress(currentConsent: boolean, cachedQuestions: QuestionDto[] | null) {
      const stored = loadSession();
      if (!stored || !hasMeaningfulProgress(stored)) {
        setScreen(currentConsent ? 'main' : 'onboarding');
        setSessionRestored(true);
        return;
      }

      setMainTab(stored.mainTab);
      setQuestionIndex(stored.questionIndex);
      setRetakeQuestionIndex(stored.retakeQuestionIndex);
      setVideos(cachedQuestions ? reconcileTakePositions(stored.videos, cachedQuestions) : stored.videos);
      const restoredTakes: Record<number, RecordedVideo[]> = {};
      for (const take of cachedQuestions ? reconcileTakePositions(Object.values(stored.takesByQuestion).flat(), cachedQuestions) : Object.values(stored.takesByQuestion).flat()) (restoredTakes[take.questionIndex] ??= []).push(take);
      setTakesByQuestion(restoredTakes);
      setSelectedTakeId(stored.selectedTakeId);
      // Optional because a session persisted before this field existed can
      // be restored without it - an empty selection is always safe (see
      // handleKeepTake's own pool.length <= 2 fallback).
      setKeptTakeIds(stored.keptTakeIds ?? []);
      setAutoStart(stored.autoStart);
      setHasSubmittedBatch(stored.hasSubmittedBatch);
      approvedBatchRef.current = stored.approvedBatch ?? null;
      setApprovedBatch(stored.approvedBatch ?? null);
      pendingUploadReceiptsRef.current = stored.pendingUploadReceipts ?? [];
      setPendingUploadReceipts(pendingUploadReceiptsRef.current);

      if (stored.phase === 'recording' || stored.phase === 'countdown') {
        // Force-quit landed mid-capture (or during the countdown right
        // before it) - that take was never added to takesByQuestion (only
        // handleRecordingFinished does that, and it never got to run), so
        // there's nothing of it to restore. Only its temp file might be
        // left behind; clean that up and land on 'brief' for the same
        // question, same as a deliberate "stop and go back" would.
        purgeOrphanedRecordingTempFiles();
      }

      let restoredScreen: Screen = 'main';
      if (stored.screen === 'question') {
        const restoredPhase = restorableQuestionPhase(stored.phase);
        // 'reviewTrim' with no pending takes for this question means the
        // take was already kept (handleKeepTake clears takesByQuestion for
        // the question right after finalizing it into `videos`) and the
        // force-quit landed in the narrow window where only the "Saved on
        // your phone" post-keep popup was still up - there is nothing left
        // for Review & Trim to show. `videos` already has the kept take
        // (restored above), so landing on Home is the coherent equivalent
        // of that popup's own "Home" button, rather than reopening a take
        // picker with nothing in it.
        const reviewTrimWithNothingToReview =
          restoredPhase === 'reviewTrim' &&
          (stored.takesByQuestion[stored.questionIndex] ?? []).length === 0;

        // Session state must remain correct across a question set that has
        // changed length since this session was persisted (CLAUDE.md) - a
        // resumed session must never point at a question index that no
        // longer exists. Only cachedQuestions (known synchronously) can be
        // checked here; a background refresh landing on a shorter/reordered
        // set later is handled the same way `videos.length < questions.length`
        // already guards entry into the question flow everywhere else.
        const questionIndexStillValid =
          cachedQuestions != null && stored.questionIndex < cachedQuestions.length;

        if (reviewTrimWithNothingToReview || !questionIndexStillValid) {
          setMainTab('home');
          setScreen('main');
        } else {
          setPhase(restoredPhase);
          setChecksReady(false);
          setTakeAttempt(0);
          restoredScreen = 'question';
          setScreen('question');
        }
      } else if (stored.screen === 'uploading') {
        restoredScreen = 'uploading';
        setScreen('uploading');
      } else {
        setScreen('main');
      }
      if (!currentConsent) {
        consentResumeScreen.current = restoredScreen;
        setScreen('consent');
      }
      setSessionRestored(true);
  }

  // Standing device preference (preferences.ts), not session state - loaded
  // independently of the force-quit restore above so it's available even
  // on a first-ever launch that never reaches loadSession() at all.
  useEffect(() => {
    getReadQuestionAloudPref().then(setReadQuestionAloudState);
  }, []);

  function setReadQuestionAloud(next: boolean) {
    setReadQuestionAloudState(next);
    setReadQuestionAloudPref(next);
  }

  // Onboarding and Settings share the same local-only override (API_CONTRACT.md:
  // nothing is written back to the distributor's stored language_pref).
  // Re-fetches and re-caches immediately so My Videos' question text and
  // every question's VO reflect the new language right away, rather than
  // waiting for the next natural loadQuestions() call. Passes `next`
  // explicitly instead of relying on `language` state, which wouldn't
  // have committed yet in this same tick.
  function handleChangeLanguage(next: LanguageCode) {
    if (preparingUploadRef.current) return;
    setLanguageState(next);
    setLanguagePref(next);
    loadQuestions(next);
  }

  const latestSessionRef = useRef<Omit<PersistedSession, 'version' | 'ownerId'> | null>(null);
  latestSessionRef.current = {
    screen: screen === 'question' || screen === 'uploading' ? screen : 'main',
    mainTab, questionIndex, phase, retakeQuestionIndex, videos, takesByQuestion,
    selectedTakeId, keptTakeIds, autoStart, hasSubmittedBatch,
    approvedBatch: approvedBatchRef.current, pendingUploadReceipts: pendingUploadReceiptsRef.current,
    uploadConfirmed: false, uploadedQuestionIndices: [],
  };
  function questionUploadLocked(index: number): boolean {
    return isQuestionLocked(approvedBatchRef.current, index, preparingUploadRef.current?.videos, questionsCatalogRef.current[index]?.id);
  }
  function checkpointBatch(batch: ApprovedUploadBatch | null, pending = pendingUploadReceiptsRef.current,
    recovered?: { entry: PendingUploadReceipt; confirmation: UploadConfirmation }) {
    if (!sessionRestored || !distributorId || currentAccount() !== distributorId || deletionBusy || deletionRecovery || !latestSessionRef.current) throw new Error(t('uploadApproval.notReady'));
    if (batch && (batch.ownerId !== distributorId || batch.clientId !== clientId)) throw new Error(t('uploadApproval.wrongAccount'));
    const latest = latestSessionRef.current;
    const accepted = batch ?? approvedBatchRef.current;
    const takes = accepted ? acknowledgeConfirmedTakes(latest.videos, accepted) : latest.videos;
    const next = { ...latest, videos: recovered ? acknowledgeUploadReceipt(takes, recovered.entry, recovered.confirmation) : takes,
      hasSubmittedBatch: latest.hasSubmittedBatch || batch?.status === 'completed',
      approvedBatch: batch, pendingUploadReceipts: pending };
    saveSession(next);
    latestSessionRef.current = next;
  }
  async function approveUpload() {
    if (approvedBatchRef.current?.status === 'pending' || preparingUploadRef.current) return;
    let preparing: { videos: RecordedVideo[]; controller: AbortController } | null = null;
    const scope = accountScope();
    const abortPreparation = () => preparing?.controller.abort();
    scope.signal.addEventListener('abort', abortPreparation);
    try {
      if (!consentAccepted) throw new Error(t('uploadApproval.consent'));
      if (!distributorId || !clientId || distributorId !== scope.owner) throw new Error(t('uploadApproval.notReady'));
      // Freeze and lock synchronously, before capabilities or hashing yields.
      const available = availableUploadTakes(primaryVideos, pendingUploadReceipts);
      if (!available.length && pendingUploadReceipts.length) throw new Error(t('uploadApproval.recoveringReceipt'));
      preparing = { videos: freezeUploadSelection(available, questions), controller: new AbortController() };
      preparingUploadRef.current = preparing;
      setUploadPreparing(true);
      setUploadError(null);
      const capabilities = await requireUploadCapabilities(preparing.controller.signal);
      if (!scopeIsCurrent(scope) || scope.signal.aborted || preparing.controller.signal.aborted || preparingUploadRef.current !== preparing) throw new Error(t('uploadApproval.accountChanged'));
      const batch = await createApprovedBatch(preparing.videos, questions,
        path => readUploadFileIdentity(path, preparing!.controller.signal), { ownerId: distributorId, clientId });
      if (!scopeIsCurrent(scope) || scope.signal.aborted || preparing.controller.signal.aborted || preparingUploadRef.current !== preparing) throw new Error(t('uploadApproval.accountChanged'));
      const latestSelection = freezeUploadSelection(
        availableUploadTakes(latestSessionRef.current?.videos ?? [], pendingUploadReceiptsRef.current), questionsCatalogRef.current);
      if (JSON.stringify(latestSelection.map(takeIdentity)) !== JSON.stringify(preparing.videos.map(takeIdentity))
        || batch.entries.some(entry => entry.file.sizeBytes > capabilities.limits.source_size_bytes)) throw new Error(t('uploadApproval.reviewSelected'));
      checkpointBatch(batch);
      approvedBatchRef.current = batch;
      setApprovedBatch(batch);
      setUploadError(null);
    } catch (error) { if (scopeIsCurrent(scope) && !preparing?.controller.signal.aborted) setUploadError(error instanceof Error ? error.message : t('uploadApproval.saveFailed')); }
    finally {
      scope.signal.removeEventListener('abort', abortPreparation);
      if (preparing && preparingUploadRef.current === preparing) { preparingUploadRef.current = null; setUploadPreparing(false); }
    }
  }
  function openUploadReview() {
    if (preparingUploadRef.current) return;
    // An unfinished approval remains the only batch until completion or an
    // explicit cancellation after its outstanding request has settled.
    if (approvedBatchRef.current?.status !== 'pending') {
      approvedBatchRef.current = null;
      setApprovedBatch(null);
      setUploadError(null);
    }
    setScreen('uploading');
  }
  function cancelFailedBatch() {
    if (uploadRunning.current || preparingUploadRef.current) return;
    try {
      const detached = pendingReceiptsForBatch(approvedBatchRef.current);
      const pending = [...pendingUploadReceiptsRef.current, ...detached];
      checkpointBatch(null, pending);
      pendingUploadReceiptsRef.current = pending;
      setPendingUploadReceipts(pending);
      approvedBatchRef.current = null;
      setApprovedBatch(null);
      setUploadError(null);
    } catch (error) { setUploadError(error instanceof Error ? error.message : t('uploadApproval.cancelFailed')); }
  }

  async function reconcilePendingUploadReceipts(signal: AbortSignal) {
    if (!clientId || !distributorId || currentAccount() !== distributorId) return;
    const scope = accountScope();
    for (const entry of pendingUploadReceiptsRef.current) {
      if (signal.aborted || !scopeIsCurrent(scope)) return;
      if (entry.ownerId !== scope.owner || entry.clientId !== clientId) continue;
      try {
        const result = await recoverUploadReceipt(entry, signal);
        if (signal.aborted || !scopeIsCurrent(scope)) return;
        const current = pendingUploadReceiptsRef.current;
        if (!result || !current.includes(entry)) continue;
        const pending = current.filter(item => item !== entry);
        // Commit the acknowledgement and journal removal together. A failure
        // leaves the handle available for another read-only check.
        checkpointBatch(approvedBatchRef.current, pending, result === 'terminal' ? undefined : { entry, confirmation: result });
        pendingUploadReceiptsRef.current = pending;
        setPendingUploadReceipts(pending);
        if (result !== 'terminal') setVideos(previous => acknowledgeUploadReceipt(previous, entry, result));
      } catch {
        // Ambiguous status, connectivity and disk errors retain this entry.
      }
    }
  }

  const hasPendingUploadReceipts = pendingUploadReceipts.length > 0;
  useEffect(() => {
    if (!sessionRestored || !consentAccepted || deletionBusy || deletionRecovery || !distributorId || !clientId || !hasPendingUploadReceipts) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function check() {
      await reconcilePendingUploadReceipts(controller.signal);
      if (!controller.signal.aborted && pendingUploadReceiptsRef.current.length) timer = setTimeout(check, 5000);
    }
    void check();
    return () => { controller.abort(); clearTimeout(timer); };
    // Pending entries and saved takes are read from current refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionRestored, consentAccepted, deletionBusy, deletionRecovery, distributorId, clientId, hasPendingUploadReceipts]);

  // Persists the whole session as it changes - not only on screen
  // transitions - so any of the force-quit points above can be resumed.
  // File writes here are synchronous local JSON (session.ts), same
  // pattern already used for the My Videos sync cache (myVideos.ts).
  useEffect(() => {
    if (!sessionRestored || !distributorId || currentAccount() !== distributorId || deletionBusy || deletionRecovery) return;
    const checkpoint = latestSessionRef.current;
    if (!checkpoint) return;
    const persistedScreen: PersistedScreen = checkpoint.screen;
    try {
      // A scheduled effect can run after a receipt checkpoint. Read the
      // current session so it cannot overwrite a just-recovered acknowledgement.
      saveSession({
        ...checkpoint,
        screen: persistedScreen,
        videos: approvedBatchRef.current ? acknowledgeConfirmedTakes(checkpoint.videos, approvedBatchRef.current) : checkpoint.videos,
        hasSubmittedBatch: checkpoint.hasSubmittedBatch || approvedBatchRef.current?.status === 'completed',
        approvedBatch: approvedBatchRef.current,
        pendingUploadReceipts: pendingUploadReceiptsRef.current,
      });
    } catch {
      // Leave the last readable checkpoint in place if storage is unavailable.
      console.warn('[session] checkpoint failed');
    }
  }, [
    sessionRestored,
    distributorId,
    deletionBusy,
    deletionRecovery,
    screen,
    mainTab,
    questionIndex,
    phase,
    retakeQuestionIndex,
    videos,
    takesByQuestion,
    selectedTakeId,
    keptTakeIds,
    autoStart,
    hasSubmittedBatch,
    approvedBatch,
  ]);

  // AppFlow is a custom state machine, not React Navigation, so the
  // hardware/gesture Android back button has no screen stack to pop by
  // default - without this it just closes the app from anywhere. Maps
  // back to whatever "one step up" means for the current screen/phase;
  // returns false (let the OS handle it, i.e. exit) only from Home and
  // from screens with no sensible in-app back target.
  useEffect(() => {
    const handler = () => {
      if (playingVideo) {
        setPlayingVideo(null);
        return true;
      }
      if (screen === 'permissions') {
        setScreen('main');
        return true;
      }
      if (screen === 'uploading') {
        preparingUploadRef.current?.controller.abort();
        // Pre-confirm: back means "stop reviewing the batch," same target
        // as before. Once confirmed (sending or already sent - the
        // "release" state), back means "go home," matching the old
        // separate 'confirmation' screen's behavior.
        if (uploadConfirmed) {
          setMainTab('home');
        } else {
          setMainTab('myVideos');
        }
        setScreen('main');
        return true;
      }
      if (screen === 'question') {
        if (phase === 'brief') {
          // Entered via a retake (My Videos' "Retake" or "Edit take(s)")
          // rather than the normal question sequence - back should return
          // to where that came from, same as every other exit point in this
          // flow that checks retakeQuestionIndex (handleKeepTake,
          // confirmExitQuestionFlow).
          if (retakeQuestionIndex !== null) {
            setRetakeQuestionIndex(null);
            setMainTab('myVideos');
          } else {
            setMainTab('home');
          }
          setScreen('main');
          return true;
        }
        if (phase === 'rehearse') {
          setPhase('brief');
          return true;
        }
        // cameraCheck / countdown / recording / reviewTrim - no silent
        // exit and no silent block either; confirm first, since a
        // hardware back press is a deliberate enough signal to deserve a
        // real way out.
        setPendingExitConfirm(true);
        return true;
      }
      if (screen === 'main') {
        if (mainTab !== 'home') {
          setMainTab('home');
          return true;
        }
        return false;
      }
      // The onboarding screen owns Back through cards -> language -> entry.
      if (screen === 'onboarding') return false;
      if (
        screen === 'splash' ||
        screen === 'whatsappInvite' ||
        screen === 'identityConfirm'
      ) {
        setScreen(DEFAULT_UNAUTHENTICATED_SCREEN);
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', handler);
    return () => sub.remove();
  }, [screen, phase, mainTab, playingVideo, uploadConfirmed, retakeQuestionIndex]);

  // Uploads every recorded segment for this session, sequentially, once
  // confirmed - real presigned-URL upload + confirm per segment (see
  // upload.ts). Deliberately doesn't change `screen` on completion any
  // more (it's already 'uploading' throughout - see the Screen type and
  // its render block) - only `hasSubmittedBatch` flips, which is what the
  // render block reads to swap from "sending" to "sent" copy on the same
  // screen. `uploadAttempt` exists only to let the retry button re-run
  // this same effect without changing `screen`.
  //
  // Every transfer reads only the durable approval snapshot. Current library
  // additions/selection never expand an already approved batch.
  useEffect(() => {
    const batch = approvedBatchRef.current;
    if (!batch || batch.status !== 'pending' || !consentAccepted || deletionBusy || deletionRecovery !== null || !distributorId) return;
    const scope = accountScope();
    let cancelled = false;
    const controller = new AbortController();
    uploadRunning.current = true;
    setUploadError(null);
    (async () => {
      try {
        for (const entry of batch.entries) {
          if (cancelled || !scopeIsCurrent(scope) || approvedBatchRef.current?.id !== batch.id) return;
          if (entry.confirmation) continue;
          const confirmation = await uploadSegment(entry, controller.signal, attempt => {
            if (cancelled || !scopeIsCurrent(scope) || approvedBatchRef.current?.id !== batch.id) throw new Error(t('uploadApproval.accountChanged'));
            const next = checkpointBatchAttempt(approvedBatchRef.current, entry.id, attempt);
            checkpointBatch(next);
            approvedBatchRef.current = next;
            setApprovedBatch(next);
          });
          if (cancelled || !scopeIsCurrent(scope) || approvedBatchRef.current?.id !== batch.id) return;
          const next = confirmBatchEntry(approvedBatchRef.current, entry.id, confirmation);
          // Closing the final entry is durable before any later take can be
          // saved. A checkpoint failure stops this batch without deleting media.
          checkpointBatch(next);
          approvedBatchRef.current = next;
          setApprovedBatch(next);
          setVideos(previous => acknowledgeConfirmedTakes(previous, next));
          if (next.status === 'completed') setHasSubmittedBatch(true);
        }
      } catch (error) {
        if (!cancelled && scopeIsCurrent(scope)) setUploadError(error instanceof Error ? error.message : t('uploadApproval.failed'));
      } finally {
        if (scopeIsCurrent(scope)) uploadRunning.current = false;
      }
    })();
    return () => { cancelled = true; controller.abort(); };
    // Batch progress is checkpointed inside this single loop; a state update
    // must not restart its still-running network request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approvedBatch?.id, uploadAttempt, consentAccepted, deletionBusy, deletionRecovery, distributorId]);

  // The Android keep-alive observes only the approved batch. Native PUT,
  // receipt recovery and exact-entry checkpoints remain in uploadSegment.
  // iOS uses Expo's background URLSession; runtime/termination behavior is
  // a separate device gate, never inferred from this foreground service.
  //
  // Must start right here, the instant a batch begins, not reactively off
  // an AppState backgrounding event - Android 12+ blocks starting a
  // foreground service from an already-backgrounded app, so the service has
  // to already be running by the time backgrounding happens, not started in
  // response to it. `t` is deliberately not a dependency - useStrings()
  // returns a new function reference every render, which would re-run this
  // effect (and its isRunning() checks) on every render for no reason; the
  // notification text updating a render late after a language switch mid-
  // upload is not worth that.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const batchInFlight = !deletionBusy && consentAccepted && approvedBatch?.status === 'pending' && !uploadError;

    if (batchInFlight) {
      if (!BackgroundService.isRunning()) {
        BackgroundService.start(androidUploadKeepAliveTask, {
          taskName: 'VideoUpload',
          taskTitle: t('appFlow.uploadServiceNotificationTitle'),
          taskDesc: t('appFlow.uploadServiceNotificationDesc'),
          taskIcon: { name: 'ic_launcher', type: 'mipmap' },
          foregroundServiceType: ['dataSync'],
        }).catch((error) => console.error('[upload] failed to start foreground service', error));
      }
    } else if (BackgroundService.isRunning()) {
      BackgroundService.stop().catch((error) => console.error('[upload] failed to stop foreground service', error));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approvedBatch, uploadAttempt, uploadError, consentAccepted, deletionBusy]);

  useEffect(() => { setUploadProgress(batchSummary(approvedBatch).progress); }, [approvedBatch]);

  // Fetches My Videos' data whenever that tab is opened while on 'main' -
  // not continuously polled (no push/notification system exists yet per
  // CLAUDE.md, so "reopen the tab" is the refresh mechanism for now).
  useEffect(() => {
    if (screen !== 'main' || mainTab !== 'myVideos' || !distributorId || currentAccount() !== distributorId) return;
    const scope = accountScope();
    let cancelled = false;
    setMyVideosLoading(true);
    setMyVideosError(null);

    (async () => {
      try {
        // No render job is ever created server-side while reel rendering
        // is disabled for this build (see config.ts), so there's nothing
        // to poll for - skip the request entirely rather than fetch an
        // endpoint that will only ever return an empty list.
        const [segments, renderedVideos] = await Promise.all([
          fetchSegments(),
          ENABLE_REEL_RENDERING ? fetchRenderedVideos() : Promise.resolve([]),
        ]);
        if (cancelled || !scopeIsCurrent(scope)) return;

        // Merge of local `videos` (recorded, possibly not yet uploaded) and
        // server `segments` (confirmed-uploaded) - a take kept via Review &
        // Trim must show as recorded here immediately, not only once
        // upload.ts's confirm call has gone through (DECISIONS.md's
        // "not recorded / recorded / uploaded" three pre-upload states).
        // Built as a Map keyed by the app's own 0-based position so both
        // sources can independently contribute a row for the same question.
        const answers = buildAnswerRows(videos, questions, segments);

        // Same real-index resolution as the segments merge above - not a
        // `- 1` assumption.
        const branded: BrandedRow[] = renderedVideos
          .map((rv) => {
            const qIndex = questions.findIndex((q) => q.id === rv.question_id);
            const current = segments.find(segment => segment.question_id === rv.question_id);
            if (!current || current.integrity_status !== 'verified_v2' || rv.segment_id !== current.segment_id) return null;
            const label = `Question ${rv.question_index}`;
            return {
              questionIndex: qIndex,
              label,
              status: renderedUserStatus(rv.status),
              play: rv.playback_url ? { filePath: rv.playback_url, label } : null,
            };
          })
          .filter((row): row is NonNullable<typeof row> => row !== null && row.questionIndex !== -1);

        setServerSegments(segments);
        setAnswerRows(answers);
        setBrandedRows(branded);
      } catch (error) {
        if (!cancelled) {
          setMyVideosError(
            error instanceof Error ? error.message : t('appFlow.myVideosLoadErrorFallback'),
          );
        }
      } finally {
        if (!cancelled) setMyVideosLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, mainTab, myVideosRefreshToken, distributorId]);

  // Fake elapsed-time ticker while "recording" - the recording itself is
  // real, but this on-screen timer doesn't yet read the Recorder's actual
  // recordedDuration.
  useEffect(() => {
    if (phase !== 'recording') {
      setElapsedSeconds(0);
      return;
    }
    const interval = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [phase]);

  // Replaces the old CountdownOverlay component - the countdown now
  // renders inline inside CameraCheckScreen's own chrome (design 3.1B), so
  // this just ticks the shared number down and starts the real recording
  // once it reaches zero.
  useEffect(() => {
    if (phase !== 'countdown') {
      setCountdownRemaining(COUNTDOWN_SECONDS);
      setQuestionAudioComplete(false);
      return;
    }
    if (!questionAudioComplete) return;
    if (countdownRemaining <= 0) {
      let cancelled = false;
      const camera = cameraRef.current;
      if (!camera) { handleRecordingError(new Error('Camera is not ready')); return; }
      camera.startRecording().then(() => {
        if (cancelled || !renderAccountScope || !scopeIsCurrent(renderAccountScope)) {
          camera.cancelRecording().catch(() => {});
          return;
        }
        recordingStartedAtRef.current = Date.now();
        setPhase('recording');
      }).catch(error => { if (!cancelled) handleRecordingError(error); });
      return () => { cancelled = true; };
    }
    const timeout = setTimeout(() => setCountdownRemaining((r) => r - 1), 1000);
    return () => clearTimeout(timeout);
  }, [phase, countdownRemaining, questionAudioComplete]);

  function enterCameraCheck() {
    const question = snapshotQuestion(questions[questionIndex]);
    recordingSnapshotRef.current = question ? { question, expectedCurrentSegmentId: retakeBaseRef.current } : null;
    setTakeAttempt((n) => n + 1);
    setChecksReady(false);
    setPhase('cameraCheck');
  }

  // Only ever fires once a take has actually been finalized
  // (stopRecording() was called from "I'm done answering") - adds it to
  // this question's takes list (capped at MAX_TAKES, oldest dropped) and
  // always routes into Review & Trim, which is now mandatory after every
  // take rather than a conditional "alignment broke" overlay.
  function handleRecordingFinished(tempFilePath: string, format: CaptureFormatInfo) {
    if (!renderAccountScope || !scopeIsCurrent(renderAccountScope)) {
      // Only this native callback's temporary file; never another account's
      // durable directory or an unowned legacy recording.
      const abandoned = new File(tempFilePath.startsWith('file://') ? tempFilePath : `file://${tempFilePath}`);
      if (abandoned.exists) abandoned.delete();
      return;
    }
    const snapshot = recordingSnapshotRef.current;
    const capturedIndex = snapshot ? questionsCatalogRef.current.findIndex(question => question.id === snapshot.question.id) : questionIndex;
    const fileName = `question-${capturedIndex + 1}-${Date.now()}.mp4`;
    const durablePath = moveRecordingToDurableStorage(tempFilePath, fileName);
    const durationSeconds = recordingStartedAtRef.current
      ? (Date.now() - recordingStartedAtRef.current) / 1000
      : 0;
    // Gathered once, here, for later analysis of what real distributor
    // phones produce (CLAUDE.md) - only exists at capture time, can't be
    // reconstructed afterwards. File size is read from the moved, durable
    // copy (actual bytes on disk), not estimated.
    const device = getDeviceInfo();
    const newTake: RecordedVideo = {
      id: `take-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      label: `Question ${capturedIndex + 1}`,
      filePath: durablePath,
      questionIndex: capturedIndex,
      durationSeconds,
      durationVerified: false,
      ...(recordingSnapshotRef.current && { questionSnapshot: { ...recordingSnapshotRef.current.question },
        expectedCurrentSegmentId: recordingSnapshotRef.current.expectedCurrentSegmentId }),
      captureMetadata: {
        fileSizeBytes: new File(durablePath).size,
        width: format.width ?? null,
        height: format.height ?? null,
        fps: format.fps ?? null,
        codec: format.codec,
        deviceModel: device.model,
        osVersion: device.osVersion,
      },
    };

    const existingLive = takesByQuestion[capturedIndex] ?? [];
    const updatedLive = [...existingLive, newTake];
    let finalLive = updatedLive;
    if (updatedLive.length > MAX_TAKES) {
      const [oldest, ...rest] = updatedLive;
      deleteRecording(oldest.filePath);
      finalLive = rest;
    }
    setTakesByQuestion((prev) => ({ ...prev, [capturedIndex]: finalLive }));
    setSelectedTakeId(newTake.id);
    // Default "kept" selection once the combined pool (this question's
    // already-saved takes + this session's fresh ones) exceeds the cap.
    // The current primary (if there is one) is always protected in this
    // default - it's the take someone already chose as their answer, so a
    // 3rd/4th take shouldn't silently bump it out of the picker's
    // preselection. The just-recorded take fills the other slot. Only a
    // preselection either way - handleToggleKept still lets the user pick
    // differently before confirming with "Keep."
    const savedForQuestion = videos.filter((v) => v.questionIndex === capturedIndex);
    const pool = [...savedForQuestion, ...finalLive];
    const currentPrimary = pool.find((t) => t.isPrimary);
    const defaultKeptIds = currentPrimary
      ? [currentPrimary.id, newTake.id]
      : pool.slice(-MAX_KEPT_TAKES).map((t) => t.id);
    setKeptTakeIds(pool.length > MAX_KEPT_TAKES ? defaultKeptIds : []);
    setQuestionIndex(capturedIndex);
    setPhase('reviewTrim');
  }

  // "Keep this take" - finalizes the selected take (with its trim
  // metadata) into `videos`, discards the question's other pending takes'
  // files, and routes onward: retakes go straight back to My Videos;
  // otherwise the last question goes to the existing 'complete' screen
  // unchanged, and every other question shows the post-keep prompt.
  //
  // The combined pool for this question - its already-saved takes (0-2,
  // non-empty only on a retake) plus whatever's been recorded live this
  // session (0-MAX_TAKES). Computed from source state on every access
  // rather than stored separately, so it can never drift out of sync with
  // `videos`/`takesByQuestion`.
  function reviewPoolFor(qIndex: number): RecordedVideo[] {
    return [...videos.filter((v) => v.questionIndex === qIndex), ...(takesByQuestion[qIndex] ?? [])];
  }
  function activeReviewTake(): RecordedVideo | undefined {
    const pool = reviewPoolFor(questionIndex);
    return pool.find(take => take.id === selectedTakeId) ?? pool[pool.length - 1];
  }

  // Applies a trim-edit patch to whichever pool member has this id,
  // regardless of whether it's an already-saved take
  // (in `videos`) or one recorded this session (in `takesByQuestion`) -
  // callers don't need to know which. This is what lets each take carry
  // its own trim independently, and what makes switching the previewed
  // take in Review & Trim never lose an in-progress edit on the take being
  // switched away from - there's no separate flow-level scratch value to
  // lose, edits go straight onto the take object.
  function updatePoolTake(qIndex: number, takeId: string, patch: Partial<RecordedVideo>) {
    if (questionUploadLocked(qIndex)) return;
    setVideos((prev) => {
      if (!prev.some((v) => v.id === takeId)) return prev;
      return prev.map((v) => (v.id === takeId ? { ...v,
        ...(hasExactAcknowledgement(v) && ('trimStartSeconds' in patch || 'trimEndSeconds' in patch) ? { expectedCurrentSegmentId: v.uploadAcknowledgement!.receipt!.segment_id } : {}), ...patch } : v));
    });
    setTakesByQuestion((prev) => {
      const list = prev[qIndex];
      if (!list) return prev;
      const idx = list.findIndex((t) => t.id === takeId);
      if (idx === -1) return prev;
      const next = [...list];
      next[idx] = { ...next[idx], ...patch };
      return { ...prev, [qIndex]: next };
    });
  }

  function handleMeasuredDuration(takeId: string, filePath: string, duration: number) {
    if (!renderAccountScope || !scopeIsCurrent(renderAccountScope) || activeReviewTake()?.id !== takeId
      || questionUploadLocked(questionIndex)) return;
    const take = reviewPoolFor(questionIndex).find(take => take.id === takeId && take.filePath === filePath);
    if (!take || hasExactAcknowledgement(take)) return;
    const trim = normalizeReviewTrim(duration, take.trimStartSeconds, take.trimEndSeconds);
    if (!trim) return;
    updatePoolTake(questionIndex, takeId, { durationSeconds: duration, durationVerified: true,
      trimStartSeconds: trim.startSeconds, trimEndSeconds: trim.endSeconds,
      trimAdjustedForReview: take.trimAdjustedForReview || trim.adjusted });
  }

  function bindReviewedQuestion() {
    if (questionUploadLocked(questionIndex)) return;
    const snapshot = snapshotQuestion(questions[questionIndex]);
    const take = activeReviewTake();
    if (!snapshot || !take) return;
    // Only this explicit review action assigns a modern snapshot to an old
    // positional recording. Restoring or refreshing never makes that claim.
    updatePoolTake(questionIndex, take.id, { questionSnapshot: snapshot, expectedCurrentSegmentId: retakeBaseRef.current });
  }

  async function reviewReplacementBase() {
    if (questionUploadLocked(questionIndex)) return;
    const take = activeReviewTake();
    const question = questions[questionIndex];
    if (!take || !question || !take.questionSnapshot || take.questionSnapshot.id !== question.id) return;
    const scope = accountScope();
    setReplacementReviewError(null);
    try {
      const segments = await fetchSegments();
      if (!scopeIsCurrent(scope)) return;
      const current = segments.find(segment => segment.question_id === question.id)
        ?? segments.find(segment => !segment.question_id && segment.question_index === question.index);
      setServerSegments(segments);
      // This modal pins the revision being shown. A later refresh cannot
      // silently move the replacement basis while the user is reviewing it.
      if (current && !current.segment_id) throw new Error(t('uploadApproval.unavailable'));
      setReplacementReview({ takeId: take.id, questionId: question.id, segmentId: current?.segment_id ?? null,
        play: current?.integrity_status === 'verified_v2' && current.playback_status === 'ready' && current.playback_url
          ? { filePath: current.playback_url, label: t('uploadApproval.currentAnswer') } : null });
    } catch (error) { if (scopeIsCurrent(scope)) setReplacementReviewError(error instanceof Error ? error.message : t('uploadApproval.failed')); }
  }

  function acceptReviewedReplacementBase() {
    const review = replacementReview;
    if (!review || questionUploadLocked(questionIndex)) return;
    const take = reviewPoolFor(questionIndex).find(take => take.id === review.takeId);
    if (!take || activeReviewTake()?.id !== take.id || take.questionSnapshot?.id !== review.questionId) { setReplacementReview(null); return; }
    updatePoolTake(questionIndex, take.id, { expectedCurrentSegmentId: review.segmentId });
    retakeBaseRef.current = review.segmentId;
    setReplacementReview(null);
  }

  // Toggles a pool member's kept/dropped status - capped at MAX_KEPT_TAKES
  // (attempting one more while already at the cap is a no-op; drop one
  // first). Only ever reachable from Review & Trim when the pool exceeds
  // the cap - see ReviewTrimScreen's takes.length > MAX_KEPT_TAKES branch.
  function handleToggleKept(id: string) {
    setKeptTakeIds((prev) => {
      if (prev.includes(id)) return prev.filter((k) => k !== id);
      if (prev.length >= MAX_KEPT_TAKES) return prev;
      return [...prev, id];
    });
  }

  function handleKeepTake() {
    if (questionUploadLocked(questionIndex)) return;
    const pool = reviewPoolFor(questionIndex);
    if (pool.length === 0) return;

    // Everything in the pool is kept automatically when there's room for
    // all of it - picking is only required once the pool exceeds
    // MAX_KEPT_TAKES, via keptTakeIds (Review & Trim's take-strip
    // checkboxes). The length check below is a defensive guard, not the
    // real gate - the "Keep" button itself is disabled in the UI until a
    // valid selection exists.
    const finalKeptIds = pool.length <= MAX_KEPT_TAKES ? pool.map((t) => t.id) : keptTakeIds;
    if (finalKeptIds.length !== Math.min(pool.length, MAX_KEPT_TAKES)) return;

    const kept = pool.filter((t) => finalKeptIds.includes(t.id));
    if (kept.some(take => requestedTrim(take) === null)) return;
    const dropped = pool.filter((t) => !finalKeptIds.includes(t.id));

    // Primary defaults to whichever kept take was actively being
    // previewed; falls back to the first kept take if that one somehow
    // isn't among the kept set (e.g. it was the one just dropped).
    const primaryId = kept.some((t) => t.id === selectedTakeId) ? selectedTakeId : kept[0]?.id;
    const current = serverSegments.find(segment => segment.question_id === questions[questionIndex]?.id);
    const finalized = kept.map((t) => ({ ...(t.id === primaryId ? reviewedTakeSelection(t, current) : t), isPrimary: t.id === primaryId, trimAdjustedForReview: false }));
    const nextVideos = [...videos.filter((v) => v.questionIndex !== questionIndex), ...finalized];
    if (latestSessionRef.current) {
      const nextPending = { ...takesByQuestion }; delete nextPending[questionIndex];
      const checkpoint = { ...latestSessionRef.current, videos: nextVideos, takesByQuestion: nextPending,
        approvedBatch: approvedBatchRef.current, keptTakeIds: [] };
      saveSession(checkpoint);
      latestSessionRef.current = checkpoint;
    }
    dropped.forEach((t) => deleteRecording(t.filePath));
    const allSaved = firstUnansweredQuestion(nextVideos, questions.length) === null;
    const destination = retakeQuestionIndex !== null ? 'myVideos' : allSaved ? 'home' : 'postKeep';
    setKeptFeedback(savedFeedback(videos, nextVideos, questionIndex, questions.length, ++feedbackSequence.current, destination));

    setTakesByQuestion((prev) => {
      const next = { ...prev };
      delete next[questionIndex];
      return next;
    });
    setKeptTakeIds([]);
    setVideos((prev) => [...prev.filter((v) => v.questionIndex !== questionIndex), ...finalized]);

    if (retakeQuestionIndex !== null) {
      setRetakeQuestionIndex(null);
      setMainTab('myVideos');
      setScreen('main');
      return;
    }

    // Deleting an earlier answer can leave a gap. Return Home only when
    // every question has a kept take; otherwise offer the next open one.
    if (allSaved) {
      setMainTab('home');
      setScreen('main');
    } else {
      setShowPostKeepPrompt(true);
    }
  }

  // Local primary selection never changes the server answer. A historical
  // receipt cannot approve a newly reselected take over a different revision.
  function handleSwitchPrimary(qIndex: number, takeId: string) {
    if (questionUploadLocked(qIndex)) return;
    const current = serverSegments.find(segment => segment.question_id === questions[qIndex]?.id);
    setVideos((prev) =>
      prev.map((v) => (v.questionIndex === qIndex ? { ...(v.id === takeId ? reviewedTakeSelection(v, current) : v), isPrimary: v.id === takeId } : v)),
    );
  }

  function handleRecordAnother() {
    enterCameraCheck();
  }

  function canDeleteReviewTake() {
    return sessionRestored && screen === 'question' && phase === 'reviewTrim'
      && !questionUploadLocked(questionIndex)
      && !uploadedQuestionIndices.includes(questionIndex)
      && !answerRows.some(row => row.questionIndex === questionIndex && row.uploaded);
  }

  function handleDeleteTake(takeId: string) {
    if (deletingTake.current || !canDeleteReviewTake()) throw new Error('Take deletion is unavailable');
    const plan = planTakeDeletion({ videos, takesByQuestion, selectedTakeId, keptTakeIds }, questionIndex, takeId);
    if (!plan) throw new Error('Take no longer exists');
    deletingTake.current = true;
    try {
      const previous = {
        screen: 'question' as const, mainTab, questionIndex, phase, retakeQuestionIndex,
        videos, takesByQuestion, selectedTakeId, keptTakeIds, autoStart, hasSubmittedBatch,
        approvedBatch: approvedBatchRef.current, pendingUploadReceipts: pendingUploadReceiptsRef.current,
        uploadConfirmed: false, uploadedQuestionIndices: [],
      };
      const empty = plan.remaining.length === 0;
      const returnToLibrary = empty && retakeQuestionIndex !== null;
      const next = {
        ...previous, ...plan.next,
        screen: returnToLibrary ? 'main' as const : 'question' as const,
        mainTab: returnToLibrary ? 'myVideos' as const : mainTab,
        phase: empty ? 'brief' as const : phase,
        retakeQuestionIndex: empty ? null : retakeQuestionIndex,
      };
      commitTakeDeletion(previous, next, plan.fileToDelete, saveSession, deleteRecording);
      setVideos(next.videos);
      setTakesByQuestion(next.takesByQuestion);
      setSelectedTakeId(next.selectedTakeId);
      setKeptTakeIds(next.keptTakeIds ?? []);
      if (empty) {
        setRetakeQuestionIndex(null);
        setPhase('brief');
        if (returnToLibrary) { setMainTab('myVideos'); setScreen('main'); }
      }
    } finally { deletingTake.current = false; }
  }

  // Confirmed exit from the hardware-back popup during cameraCheck/
  // countdown/recording/reviewTrim. Discards an in-progress recording if
  // there is one. A take already sitting in takesByQuestion (reviewTrim,
  // not yet kept) is normally left alone so it's still there if the person
  // comes back to this question - except when backing out of a forced pick
  // (pool over MAX_KEPT_TAKES, no valid keep confirmed yet): there, every
  // live take for this question is discarded instead, leaving the
  // already-saved takes and the current primary exactly as they were
  // before this attempt.
  function confirmExitQuestionFlow() {
    setPendingExitConfirm(false);
    if (phase === 'recording') {
      cameraRef.current?.cancelRecording().catch((error) => console.error('[recording] cancel failed', error));
    }
    if (phase === 'reviewTrim' && reviewPoolFor(questionIndex).length > MAX_KEPT_TAKES) {
      (takesByQuestion[questionIndex] ?? []).forEach((t) => deleteRecording(t.filePath));
      setTakesByQuestion((prev) => {
        const next = { ...prev };
        delete next[questionIndex];
        return next;
      });
      setKeptTakeIds([]);
    }
    // Backing out of a direct "Edit take(s)" entry (handleEditTakes) -
    // identified by reviewTrim + retakeQuestionIndex set + nothing was
    // actually recorded this session (takesByQuestion empty for this
    // question, which a genuine retake reaching reviewTrim never has,
    // since handleRecordingFinished always populates it first). Exiting
    // should return to My Videos, not drop into Question Brief for a
    // recording attempt that was never started.
    if (
      phase === 'reviewTrim' &&
      retakeQuestionIndex !== null &&
      (takesByQuestion[questionIndex] ?? []).length === 0
    ) {
      setRetakeQuestionIndex(null);
      setMainTab('myVideos');
      setScreen('main');
      return;
    }
    setChecksReady(false);
    setTakeAttempt(0);
    setPhase('brief');
  }

  // See recordingFailedVisible's own comment above - wired to
  // CameraAlignment's onRecordingError below. Only ever fires while
  // phase === 'recording' (that's the only time a native recorder is
  // actually active), so there's no reviewTrim/retake branching to mirror
  // from confirmExitQuestionFlow above - just cancel the broken recording
  // and return to the same Brief screen a deliberate exit would.
  function handleRecordingError(error: Error) {
    if (!renderAccountScope || !scopeIsCurrent(renderAccountScope)) return;
    console.error('[recording]', error);
    cameraRef.current?.cancelRecording().catch((cancelError) =>
      console.error('[recording] cancel after error failed', cancelError),
    );
    setChecksReady(false);
    setTakeAttempt(0);
    setPhase('brief');
    setRecordingFailedVisible(true);
  }

  function goToNextQuestion() {
    retakeBaseRef.current = null;
    setShowPostKeepPrompt(false);
    const next = firstUnansweredQuestion(videos, questions.length);
    if (next === null) { setMainTab('home'); setScreen('main'); return; }
    setQuestionIndex(next);
    setChecksReady(false);
    setTakeAttempt(0);
    setPhase('brief');
  }

  // Entered from Home (via Permissions) to record the next unanswered
  // question. Sets questionIndex to the next open slot without touching
  // any already-recorded videos - this used to be wired to
  // startNewSession() below, which wiped every recording made so far
  // whenever a later question was started (e.g. tapping "Start" for
  // question 3 deleted questions 1-2). See DEV_NOTES.md.
  function enterNextQuestion() {
    const next = firstUnansweredQuestion(videos, questions.length);
    if (next === null) return;
    setQuestionIndex(next);
    retakeBaseRef.current = null;
    setRetakeQuestionIndex(null);
    setChecksReady(false);
    setTakeAttempt(0);
    setPhase('brief');
    setScreen('question');
  }

  // Testing-only utility, reachable from the dev entry menu on Login -
  // wipes every local recording so My Videos doesn't grow indefinitely
  // across repeated test runs. Never wire this into the normal recording
  // flow (see enterNextQuestion() above for why).
  function startNewSession() {
    if (approvedBatchRef.current?.status === 'pending' || pendingUploadReceiptsRef.current.length || preparingUploadRef.current) return;
    clearAllRecordings();
    clearSession();
    setVideos([]);
    setTakesByQuestion({});
    setQuestionIndex(0);
    setRetakeQuestionIndex(null);
    setChecksReady(false);
    setTakeAttempt(0);
    setAutoStart(true);
    approvedBatchRef.current = null; setApprovedBatch(null);
    setHasSubmittedBatch(false);
    setPhase('brief');
    setScreen('question');
  }

  // Entered only via My Videos' retake confirmation. Mirrors question 1's
  // cold-start sequence (align first, full lock) rather than questions
  // 2-5's lighter recheck, since there's no continuous camera session
  // behind this entry to justify a lighter check.
  function startRetake(qIndex: number) {
    if (questionUploadLocked(qIndex)) return;
    setQuestionIndex(qIndex);
    setRetakeQuestionIndex(qIndex);
    setTakesByQuestion((prev) => {
      const next = { ...prev };
      delete next[qIndex];
      return next;
    });
    setChecksReady(false);
    setTakeAttempt(0);
    setPhase('brief');
    setScreen('question');
  }

  // Entered from My Videos' "Edit take(s)" link - jumps straight into
  // Review & Trim for a question's already-saved takes, skipping the
  // camera flow entirely (no re-recording needed just to adjust trim or
  // switch which take is primary). Works because ReviewTrimScreen is a
  // fully self-contained render branch (see the `phase === 'reviewTrim'`
  // block below) that only reads `videos`/`takesByQuestion` - it never
  // depends on CameraAlignment being mounted, so no camera/mic permission
  // or session state is touched by entering this way. Reuses
  // `retakeQuestionIndex` as the "return to My Videos after Keep" signal,
  // exactly like a real retake does once its own recording reaches
  // Review & Trim - handleKeepTake doesn't need to know which path got it
  // there. Submitted takes remain available through the labelled original
  // review route; changing their trim requires fresh submission approval.
  function handleEditTakes(qIndex: number) {
    if (questionUploadLocked(qIndex)) return;
    setQuestionIndex(qIndex);
    retakeBaseRef.current = buildAnswerRows(videos, questions, serverSegments).find(row => row.questionIndex === qIndex)?.serverSegmentId ?? null;
    setRetakeQuestionIndex(qIndex);
    const questionVideos = videos.filter((v) => v.questionIndex === qIndex);
    const primary = questionVideos.find((v) => v.isPrimary !== false) ?? questionVideos[0];
    setSelectedTakeId(primary?.id ?? '');
    setPhase('reviewTrim');
    setScreen('question');
  }

  function resetAccountMemory() {
    preparingUploadRef.current?.controller.abort(); preparingUploadRef.current = null; setUploadPreparing(false);
    recordingSnapshotRef.current = null; retakeBaseRef.current = null; setClientId(null);
    setReplacementReview(null); setReplacementReviewError(null);
    cameraRef.current?.cancelRecording().catch(() => {});
    questionsRequest.current++;
    setSessionRestored(false);
    setVideos([]); setTakesByQuestion({}); setQuestions([]);
    setAnswerRows([]); setServerSegments([]); setBrandedRows([]); setPlayingVideo(null);
    approvedBatchRef.current = null; setApprovedBatch(null); uploadRunning.current = false; setHasSubmittedBatch(false);
    pendingUploadReceiptsRef.current = []; setPendingUploadReceipts([]);
    setUploadError(null); setPendingRetake(null); setRetakeQuestionIndex(null);
    setSelectedTakeId(null); setKeptTakeIds([]); setQuestionIndex(0); setPhase('brief');
    setConsentAccepted(false); setDistributorProfile(null); setKeptFeedback(null);
    voSourceRef.current = null;
  }

  function deletionViewIsCurrent(version: number, owner: string, auth: AuthSession): boolean {
    return deletionUIVersion.current === version && (currentAccount() === owner || currentAccount() === null) && (!captureAuthSession().token || authSessionIsCurrent(auth));
  }

  async function handleDeleteAccount(password: string) {
    if (!renderAccountScope || !scopeIsCurrent(renderAccountScope) || !authSessionIsCurrent(renderAuthSession)) throw new Error(t('deletion.accountChanged'));
    const owner = renderAccountScope.owner, version = ++deletionUIVersion.current;
    const auth = captureAuthSession();
    setDeletionBusy(true);
    try {
      await requestAccountDeletion(password);
      if (deletionViewIsCurrent(version, owner, auth)) {
        resetAccountMemory(); setDeletionRecoveryOwner(owner); setDeletionRecovery(t('deletion.cleaning'));
      }
      await finishLocalAccountDeletion(owner);
      // This token comparison and the UI epoch are independent: storage,
      // native transfers and another account's login can all settle later.
      const cleared = await logoutIfSession(auth);
      if (deletionViewIsCurrent(version, owner, auth) && (!captureAuthSession().token || (cleared && authSessionIsCurrent(cleared)))) {
        setDistributorId(null); setMainTab('home'); setDeletionRecoveryOwner(null);
        setDeletionRecovery(null); setDeletionNotice(true); setScreen('login');
      }
    } catch (error) {
      if (deletionViewIsCurrent(version, owner, auth) && pendingAccountDeletion(owner)) {
        setDeletionRecoveryOwner(owner);
        setDeletionRecovery(error instanceof Error ? error.message : t('deletion.recoveryError'));
      }
      throw error;
    } finally { if (deletionViewIsCurrent(version, owner, auth)) setDeletionBusy(false); }
  }

  async function retryDeletionRecovery() {
    const owner = deletionRecoveryOwner ?? pendingAccountDeletion()?.owner;
    if (!owner) { void bootstrapApp(); return; }
    const version = deletionUIVersion.current, auth = captureAuthSession();
    if (!deletionViewIsCurrent(version, owner, renderAuthSession)) return;
    setDeletionBusy(true);
    try {
      const result = await recoverAccountDeletion(owner);
      if (!deletionViewIsCurrent(version, owner, auth)) return;
      setDeletionRecovery(null); setDeletionRecoveryOwner(null);
      if (result === 'accepted') { await logoutIfSession(auth); if (!deletionViewIsCurrent(version, owner, auth)) return; resetAccountMemory(); setDistributorId(null); setDeletionNotice(true); setScreen('login'); }
      else { await bootstrapApp(); }
    } catch (error) {
      if (deletionViewIsCurrent(version, owner, auth)) setDeletionRecovery(error instanceof Error ? error.message : t('deletion.recoveryError'));
    } finally { if (deletionViewIsCurrent(version, owner, auth)) setDeletionBusy(false); }
  }

  async function signInForDeletionRecovery(phone: string, password: string, country: PhoneCountryCode = 'IN') {
    const owner = deletionRecoveryOwner;
    if (!owner) throw new Error(t('deletion.recoveryError'));
    const version = deletionUIVersion.current, auth = captureAuthSession();
    if (!deletionViewIsCurrent(version, owner, renderAuthSession)) throw new Error(t('deletion.accountChanged'));
    const { result, credentials } = await reauthenticateAccountDeletion(owner, phone, password, country);
    if (!deletionViewIsCurrent(version, owner, auth) || (result === 'none' && !authSessionIsCurrent(auth))) return;
    setDeletionRecovery(null); setDeletionRecoveryOwner(null); setDeletionBusy(false);
    if (result === 'accepted') { await logoutIfSession(auth); if (!deletionViewIsCurrent(version, owner, auth)) return; resetAccountMemory(); setDistributorId(null); setDeletionNotice(true); setScreen('login'); }
    else {
      await adoptRecoveredAuth(credentials.token, auth);
      await handleAuthenticated();
    }
  }

  function leaveDeletionRecovery(version: number, owner: string | null, auth: AuthSession) {
    if (deletionUIVersion.current !== version || (currentAccount() && currentAccount() !== owner)) return;
    if (captureAuthSession().token && !authSessionIsCurrent(auth)) return;
    // Leave the owner-scoped journal/proof and drafts for later reconciliation.
    handleLogout();
  }

  // Clears the stored auth token and returns to the login screen. Recorded
  // videos on disk are left alone - logging out is a session/auth action,
  // not a data wipe (unlike the testing-only clearAllRecordings() above).
  function handleLogout() {
    deletionUIVersion.current++; setDeletionBusy(false); setDeletionRecovery(null); setDeletionRecoveryOwner(null);
    activateAccount(null);
    resetAccountMemory();
    setConsentAccepted(false);
    logout();
    setDistributorId(null);
    setDistributorProfile(null);
    setMainTab('home');
    setScreen('login');
  }

  // Registered once below (api.ts's setSessionExpiredHandler) - fires when
  // any authenticated request comes back 401 with a token actually
  // attached, meaning the token itself died mid-session (expired/revoked),
  // not a bad-credentials rejection on a fresh login attempt. Same cleanup
  // as a deliberate handleLogout, plus the one-time banner on the next
  // Login render so this doesn't look like an unexplained upload/fetch
  // failure - FRONTEND_AUDIT's §1 "Session/auth token expired mid-flow"
  // finding was specifically that nothing distinguished this case before.
  function handleSessionExpired(code?: string) {
    const owner = currentAccount(), auth = captureAuthSession();
    let hasIntent = false;
    try { hasIntent = !!owner && !!pendingAccountDeletion(owner); }
    catch { hasIntent = !!owner; }
    if (owner && (code === 'account_deleted' || hasIntent)) {
      const version = deletionUIVersion.current;
      // A generic account_deleted response is not itself a deletion receipt.
      // Preserve proof first, then verify the owner-bound receipt in isolation.
      const remembered = rememberAccountDeletion(owner, auth.token);
      activateAccount(null); resetAccountMemory(); setDistributorId(null);
      setDeletionRecoveryOwner(owner); setDeletionRecovery(t('deletion.recoveryBody')); setDeletionBusy(true);
      void remembered.then(async () => {
        await logoutIfSession(auth);
        if (code === 'account_deleted') await recoverAccountDeletion(owner);
      }).then(() => {
        if (deletionViewIsCurrent(version, owner, auth) && !captureAuthSession().token) {
          if (!pendingAccountDeletion(owner)) { setDeletionRecovery(null); setDeletionRecoveryOwner(null); setDeletionNotice(true); setScreen('login'); }
        }
      }).catch(error => {
        if (deletionViewIsCurrent(version, owner, auth)) setDeletionRecovery(error instanceof Error ? error.message : t('deletion.recoveryError'));
      }).finally(() => { if (deletionViewIsCurrent(version, owner, auth)) setDeletionBusy(false); });
      return;
    }
    handleLogout();
    setSessionExpiredNotice(true);
  }

  useEffect(() => {
    setSessionExpiredHandler(handleSessionExpired);
    return () => setSessionExpiredHandler(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Shared by a fresh login, self-registration, and phone+password sign-in
  // (auth.ts's register()/loginByPhone() both leave the app in an identical
  // state to login() - same token shape, immediately usable) - so all three
  // proceed exactly the same way from here on, not separate paths that
  // could drift out of sync with each other.
  async function handleAuthenticated() {
    const version = ++deletionUIVersion.current, authSession = captureAuthSession();
    setDeletionBusy(false); setDeletionRecovery(null); setDeletionRecoveryOwner(null);
    activateAccount(null);
    setSessionExpiredNotice(false);
    setDeletionNotice(false);
    resetAccountMemory();
    const auth = await getCurrentAuth();
    if (deletionUIVersion.current !== version || !authSessionIsCurrent(authSession)) return;
    if (!auth) { handleLogout(); return; }
    if (pendingAccountDeletion(auth.distributorId)) {
      try {
        const result = await recoverAccountDeletion(auth.distributorId, authSession.token ?? undefined);
        if (result === 'accepted') {
          const cleared = await logoutIfSession(authSession);
          if (deletionUIVersion.current === version && cleared && authSessionIsCurrent(cleared)) {
            setDistributorId(null); setDeletionNotice(true); setScreen('login');
          }
          return;
        }
      } catch (error) {
        if (deletionUIVersion.current === version && authSessionIsCurrent(authSession)) {
          setDeletionRecoveryOwner(auth.distributorId); setDeletionRecovery(error instanceof Error ? error.message : t('deletion.recoveryError'));
        }
        return;
      }
    }
    if (deletionUIVersion.current !== version || !authSessionIsCurrent(authSession)) return;
    activateAccount(auth.distributorId);
    if (auth) { setDistributorId(auth.distributorId); setClientId(auth.clientId); }
    loadOwnedProfile();
    // Cache-first: show cached questions immediately if any exist for this
    // device, then refresh in the background.
    const cachedQuestions = getCachedQuestions();
    if (cachedQuestions && cachedQuestions.length > 0) {
      setQuestions(cachedQuestions);
    }
    loadQuestions();
    // Already-consented distributor logging back in (e.g. after a logout)
    // goes straight to main instead of repeating Onboarding+Consent - see
    // consent.ts. auth can come back null here only if /me fails right
    // after a token was just issued, which would also fail every other
    // authenticated call about to fire above; falling back to onboarding
    // in that edge case is the safe default (same as a first-ever login).
    const currentConsent = !!auth && hasConsented(auth.distributorId);
    setConsentAccepted(currentConsent);
    consentResumeScreen.current = 'main';
    restoreOwnedProgress(currentConsent, cachedQuestions);
  }

  // One selection feeds preparation, countdown and recording. Preferences
  // use stable question IDs, and are kept separate from recorded media.
  const { controls: promptSelection, prompts } = useQuestionPrompts(
    distributorId, questions[questionIndex]?.id ?? '', language ?? 'default',
    questions[questionIndex]?.talking_points ?? [],
  );
  const deletingTake = useRef(false);
  const nextUnanswered = firstUnansweredQuestion(videos, questions.length);
  // UI-only feedback belongs to the successful Keep action, not a restored
  // session. Leaving its destination clears it so tab revisits stay quiet.
  const [keptFeedback, setKeptFeedback] = useState<SavedFeedback | null>(null);
  const feedbackSequence = useRef(0);
  useEffect(() => {
    if (!keptFeedback) return;
    const visible = !playingVideo && (keptFeedback.destination === 'postKeep'
      ? screen === 'question' && phase === 'reviewTrim' && showPostKeepPrompt
      : screen === 'main' && mainTab === keptFeedback.destination);
    if (!visible) setKeptFeedback(null);
  }, [keptFeedback, screen, mainTab, phase, showPostKeepPrompt, playingVideo]);

  // Force-update gate - checked ahead of every other screen (including a
  // still-open video player) since it's a hard block, not a normal
  // navigation state. Only ever true once distributorProfile has actually
  // loaded (null before that, so this can't false-trigger during
  // sessionLoading/login) and min_app_version is genuinely newer than what
  // Application.nativeApplicationVersion reports - see appVersion.ts.
  // nativeApplicationVersion is null on web, where this gate is meaningless
  // (no store to send anyone to) - defaulting a null reading to '0.0.0'
  // would incorrectly trigger the gate, so it's skipped entirely instead.
  const updateRequired =
    !!distributorProfile?.min_app_version &&
    !!Application.nativeApplicationVersion &&
    isVersionBelow(Application.nativeApplicationVersion, distributorProfile.min_app_version);

  // Use the same screen state for native navigation and its painted inset.
  const immersive = !updateRequired && (playingVideo !== null ||
    (screen === 'question' && (phase === 'rehearse' || phase === 'cameraCheck' ||
      phase === 'countdown' || phase === 'recording')));
  useHideNavigationBarWhile(immersive);
  useLayoutEffect(() => onImmersiveChange(immersive), [immersive, onImmersiveChange]);

  if (updateRequired) {
    return <UpdateRequiredScreen />;
  }

  if (playingVideo) {
    return (
      <VideoPlayerScreen
        video={playingVideo}
        onClose={() => setPlayingVideo(null)}
      />
    );
  }

  if (deletionRecovery !== null) {
    const version = deletionUIVersion.current, auth = captureAuthSession();
    return <LoginScreen key={`deletion-recovery-${deletionRecoveryOwner ?? 'unknown'}`}
      onLoggedIn={() => {}} authenticate={signInForDeletionRecovery}
      heading={t('deletion.recoveryTitle')} description={t('deletion.recoverySignInBody')}
      notice={deletionRecovery} signInLabel={t('deletion.recoverySignIn')}
      recoveryBusy={deletionBusy} onRetryRecovery={retryDeletionRecovery}
      onUseAnotherAccount={() => leaveDeletionRecovery(version, deletionRecoveryOwner, auth)} />;
  }
  if (bootstrapError !== null) {
    return <View style={[styles.sessionLoading, {backgroundColor:colors.background,padding:24,gap:16}]}><Text style={{color:colors.text}}>{bootstrapError}</Text><Button label={t('deletion.retry')} onPress={() => void bootstrapApp()} /></View>;
  }
  if (screen === 'sessionLoading') {
    return (
      <View style={[styles.sessionLoading, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (screen === 'login') {
    return (
      <View style={{ flex: 1 }}>
        <LoginScreen
          onLoggedIn={handleAuthenticated}
          onRegisterPress={ENABLE_SELF_REGISTRATION ? () => setScreen('selfRegister') : undefined}
          notice={deletionNotice ? t('deletion.acceptedNotice') : sessionExpiredNotice ? t('login.sessionExpiredNotice') : undefined}
        />
        {__DEV__ && (
          <DevEntryMenu
            items={[
              { label: 'Splash', onPress: () => setScreen('splash') },
              { label: 'WhatsApp invite → identity → onboarding', onPress: () => setScreen('whatsappInvite') },
              { label: 'Onboarding only', onPress: () => setScreen('onboarding') },
              { label: 'Reset all recordings (testing)', onPress: startNewSession },
              {
                label: 'Refresh questions + VO audio (testing)',
                onPress: () => {
                  clearVoCache();
                  loadQuestions();
                },
              },
            ]}
          />
        )}
      </View>
    );
  }

  if (screen === 'selfRegister') {
    return (
      <SelfRegisterScreen onAuthenticated={handleAuthenticated} onBack={() => setScreen('login')} />
    );
  }

  // Real WhatsApp deep-link routing isn't wired yet - "Splash" here just
  // simulates a returning-user cold start (splash -> login), reachable via
  // the dev entry menu above. See DECISIONS.md.
  if (screen === 'splash') {
    return <SplashScreen onContinue={() => setScreen(DEFAULT_UNAUTHENTICATED_SCREEN)} />;
  }

  // The full new-user chain: invite -> identity confirmation -> onboarding
  // -> consent, simulated end-to-end from the dev entry menu until real
  // deep-linking exists.
  if (screen === 'whatsappInvite') {
    return <WhatsAppInviteScreen onContinue={() => setScreen('identityConfirm')} />;
  }

  if (screen === 'identityConfirm') {
    return <IdentityConfirmScreen onConfirm={() => setScreen('onboarding')} />;
  }

  if (screen === 'onboarding') {
    return (
      <OnboardingScreen
        language={language}
        onChangeLanguage={handleChangeLanguage}
        onGetStarted={() => setScreen('consent')}
        onBack={() => setScreen(DEFAULT_UNAUTHENTICATED_SCREEN)}
      />
    );
  }

  if (screen === 'consent') {
    return (
      <ConsentScreen
        campaignNotice={distributorProfile?.campaign ? distributorProfile.campaign.participant_notice : undefined}
        onDecline={handleLogout}
        onAgree={() => {
          if (!distributorId || !distributorProfile) throw new Error('Wait for your account and campaign notice to load, then try again');
          markConsented(distributorId);
          setConsentAccepted(true);
          setScreen(consentResumeScreen.current);
          consentResumeScreen.current = 'main';
        }}
      />
    );
  }

  if (screen === 'permissions') {
    return (
      <PermissionsScreen
        onContinue={enterNextQuestion}
        onBack={() => setScreen('main')}
      />
    );
  }

  if (screen === 'main') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {mainTab === 'home' && questions.length === 0 && questionsError ? (
          // Only reachable with no cache and a failed fetch (loadQuestions
          // keeps the cache showing on failure otherwise) - a distributor
          // on patchy data must never see a blank Home, but there's
          // genuinely nothing to show without at least one of the two.
          <View style={styles.questionsErrorContainer}>
            <Text style={[styles.questionsErrorTitle, { color: colors.text }]}>
              {t('appFlow.questionsLoadErrorTitle')}
            </Text>
            <Text style={[styles.questionsErrorSubtitle, { color: colors.textMuted }]}>
              {questionsError}
            </Text>
            <Button
              label={t('appFlow.questionsLoadErrorTryAgainButton')}
              onPress={loadQuestions}
              variant="secondary"
              style={{ marginTop: spacing.lg }}
            />
          </View>
        ) : mainTab === 'home' && (
          <HomeScreen
            // Real name now available (distributorProfile.ts); business/city
            // are also on that response but stay unwired for now - see the
            // module's own comment. HomeScreen still falls back to a plain,
            // non-personalized greeting whenever the profile hasn't loaded
            // (or, in principle, a distributor genuinely has no name).
            distributorName={distributorProfile?.name}
            totalQuestions={questions.length}
            questionsAnswered={primaryVideos.length}
            hasSubmittedBatch={primaryVideos.length > 0 && primaryVideos.every(video => isExactConfirmedTake(approvedBatch, video))}
            completionFeedback={keptFeedback?.destination === 'home' ? keptFeedback : undefined}
            renderedReadyCount={brandedRows.filter((b) => b.status === 'ready').length}
            nextQuestion={
              nextUnanswered !== null
                ? {
                    index: nextUnanswered + 1,
                    text: questions[nextUnanswered]?.text ?? '',
                    estimate: '45–60 second answer · about 3 minutes',
                  }
                : null
            }
            readyReel={null}
            onOpenProfile={() => setMainTab('profile')}
            onStartNextQuestion={() => {
              if (cameraPermission.hasPermission && microphonePermission.hasPermission) {
                enterNextQuestion();
              } else {
                setScreen('permissions');
              }
            }}
            onSendAll={openUploadReview}
            onOpenMyVideos={() => setMainTab('myVideos')}
            onShareReadyReel={() => {}}
          />
        )}
        {mainTab === 'myVideos' && (
          <MyVideosScreen
            feedback={keptFeedback?.destination === 'myVideos'
              ? <CompletionFeedback compact feedback={keptFeedback} completed={keptFeedback.completed} total={keptFeedback.total} card onDismiss={() => setKeptFeedback(null)} />
              : undefined}
            loading={myVideosLoading}
            error={myVideosError}
            onRetryLoad={() => setMyVideosRefreshToken((n) => n + 1)}
            questionTexts={questions.map((q) => q.text)}
            answers={buildAnswerRows(videos, questions, serverSegments).map(row => ({ ...row, uploadLocked: questionUploadLocked(row.questionIndex) }))}
            branded={brandedRows}
            reelRenderingEnabled={ENABLE_REEL_RENDERING}
            onPressAnswer={(row) => { if (row.play) setPlayingVideo(row.play); }}
            onPressBranded={(row) => row.play && setPlayingVideo({ ...row.play, celebratory: true })}
            onRetake={(qIndex) => { if (!questionUploadLocked(qIndex)) { retakeBaseRef.current = serverSegments.find(segment => segment.question_id === questions[qIndex]?.id)?.segment_id ?? serverSegments.find(segment => !segment.question_id && segment.question_index === questions[qIndex]?.index)?.segment_id ?? null; setPendingRetake(qIndex); } }}
            onEditTakes={handleEditTakes}
            onSwitchPrimary={handleSwitchPrimary}
            onUploadAll={openUploadReview}
            unmatchedTakes={videos.filter(video => video.questionSnapshot && !questions.some(question => question.id === video.questionSnapshot!.id)).map(video => ({ id: video.id, label: video.questionSnapshot!.text }))}
            onReviewOriginal={(id) => { const take = videos.find(video => video.id === id); if (take) setPlayingVideo({ filePath: take.filePath, label: t('uploadApproval.originalReview') }); }}
          />
        )}
        {mainTab === 'help' && <HelpScreen />}
        {mainTab === 'profile' && (
          <ProfileScreen
            distributorId={distributorId}
            distributorName={distributorProfile?.name}
            distributorPhone={distributorProfile?.phone}
            language={language}
            onChangeLanguage={handleChangeLanguage}
            onOpenConsent={() => setScreen('consent')}
            onLogout={handleLogout}
            onDeleteAccount={handleDeleteAccount}
            deletionBusy={deletionBusy}
          />
        )}
        <BottomTabBar
          activeTab={mainTab}
          onTabPress={setMainTab}
          myVideosHasNotification={mainTab !== 'myVideos' && brandedRows.some((b) => b.status === 'ready')}
        />

        {pendingRetake !== null && (
          <RetakeConfirmOverlay
            questionNumber={pendingRetake + 1}
            isRetake={videos.some((v) => v.questionIndex === pendingRetake)}
            onCancel={() => setPendingRetake(null)}
            onConfirm={() => {
              const qIndex = pendingRetake;
              setPendingRetake(null);
              startRetake(qIndex);
            }}
          />
        )}
      </View>
    );
  }

  if (screen === 'uploading') {
    // Once confirmed and no error is blocking it, this becomes the
    // "release" screen immediately - not only once the batch finishes -
    // so the live progress bar (and, later, the completion message) has
    // something real to show instead of a static screen reached only
    // after there's nothing left to report. An error always falls back
    // to UploadingScreen's own retry/send-later UI, confirmed or not.
    if (uploadConfirmed && !uploadError) {
      const confirmed = batchSummary(approvedBatch);
      return (
        <ConfirmationScreen
          // Not `!hasSubmittedBatch` - that flag means "submitted at
          // least once, ever" and never resets, so it stays true across a
          // retake's re-upload and would wrongly skip straight to "done"
          // on a batch that's actually still sending. This is the actual
          // per-run signal the upload effect below drives.
          uploading={!confirmed.complete}
          progress={confirmed.progress}
          confirmedCount={confirmed.completed}
          totalCount={confirmed.total}
          reelsEnabled={ENABLE_REEL_RENDERING}
          onDone={() => {
            setMainTab('home');
            setScreen('main');
          }}
        />
      );
    }

    return (
      <UploadingScreen
        items={(approvedBatch?.entries.map(entry => entry.video) ?? availableUploadTakes(primaryVideos, pendingUploadReceipts)).map((v) => ({
          questionIndex: v.questionIndex,
          label: `Question ${v.questionIndex + 1}`,
          questionText: approvedBatch?.entries.find(entry => entry.video.id === v.id)?.question.text ?? questions[v.questionIndex]?.text ?? '',
          durationSeconds: v.durationSeconds,
        }))}
        error={uploadError}
        recoveringReceipt={!approvedBatch && hasPendingUploadReceipts}
        preparing={uploadPreparing}
        onConfirm={approveUpload}
        onRetry={() => approvedBatchRef.current?.status === 'pending' ? setUploadAttempt((n) => n + 1) : setUploadError(null)}
        onCancelBatch={approvedBatch?.status === 'pending' && !!uploadError ? cancelFailedBatch : undefined}
        onSendLater={() => {
          preparingUploadRef.current?.controller.abort();
          setMainTab('home');
          setScreen('main');
        }}
        onBack={() => {
          preparingUploadRef.current?.controller.abort();
          setMainTab('myVideos');
          setScreen('main');
        }}
        // "Tappable back to review," not a retake shortcut - DECISIONS.md
        // explicitly rejects a change-take control at this commitment
        // moment ("duplicates review-screen logic"). Every item here is
        // still local-only (nothing's uploaded yet), so play it straight
        // from disk, same shape My Videos uses for its own answer rows.
        onReviewItem={(qIndex) => {
          const video = approvedBatch?.entries.find(entry => entry.video.questionIndex === qIndex)?.video ?? primaryVideos.find((v) => v.questionIndex === qIndex);
          if (video) setPlayingVideo({ filePath: video.filePath, label: t('uploadApproval.originalReview') });
        }}
      />
    );
  }

  // screen === 'question'
  const currentQuestion = questions[questionIndex];
  const questionText = (phase === 'cameraCheck' || phase === 'countdown' || phase === 'recording')
    ? recordingSnapshotRef.current?.question.text ?? currentQuestion?.text ?? '' : currentQuestion?.text ?? '';
  // Same 'default' sentinel loadQuestions()/voCache.ts use - never a
  // guessed real language code for a lookup that hasn't been explicitly
  // chosen yet.
  const resolvedLanguage = language ?? 'default';
  // See voSourceRef's own comment (near cameraRef) for why this is pinned
  // per question id + language instead of recomputed on every render/
  // voCacheVersion bump - resolving fresh only when the question or the
  // language itself actually changes avoids swapping a mounted player's
  // source out from under it mid-use.
  if (voSourceRef.current?.questionId !== currentQuestion?.id || voSourceRef.current?.language !== resolvedLanguage) {
    voSourceRef.current = currentQuestion
      ? {
          questionId: currentQuestion.id,
          language: resolvedLanguage,
          url: getLocalVoUri(currentQuestion.id, resolvedLanguage) ?? currentQuestion.vo_playback_url,
        }
      : null;
  }
  const voPlaybackUrl = voSourceRef.current?.url;
  // Retake is always a cold entry (no continuous camera session behind
  // it) - full lock regardless of which question index it targets, same
  // as question 1's first-time entry.
  const lockMode = retakeQuestionIndex !== null || questionIndex === 0 ? 'initial' : 'recheck';
  const resetToken = `${questionIndex}-${takeAttempt}`;

  if (phase === 'brief') {
    return (
      <View style={{ flex: 1 }}>
        <QuestionBriefScreen
          questionNumber={questionIndex + 1}
          totalQuestions={questions.length}
          voPlaybackUrl={voPlaybackUrl}
          questionText={questionText}
          promptSelection={promptSelection}
          onStartRecording={enterCameraCheck}
          onRehearse={() => setPhase('rehearse')}
          onBack={() => {
            // Same retakeQuestionIndex check as the hardware-back handler
            // above - a retake entry must return to My Videos, not Home.
            if (retakeQuestionIndex !== null) {
              setRetakeQuestionIndex(null);
              setMainTab('myVideos');
            } else {
              setMainTab('home');
            }
            setScreen('main');
          }}
        />

        {/* handleRecordingError's own comment (near pendingExitConfirm)
            explains why this exists - phase is already back on 'brief' by
            the time this shows, so the person just needs to know why
            before trying again, not a choice to make. */}
        <PopupSheet
          visible={recordingFailedVisible}
          onDismiss={() => setRecordingFailedVisible(false)}
        >
          <Text style={{ fontSize: 21, fontWeight: '700', color: colors.text, marginBottom: 8 }}>
            {t('appFlow.recordingFailedPopupTitle')}
          </Text>
          <Text style={{ fontSize: 14.5, color: colors.textMuted, lineHeight: 21, marginBottom: 16 }}>
            {t('appFlow.recordingFailedPopupBody')}
          </Text>
          <Button label={t('appFlow.recordingFailedPopupButton')} onPress={() => setRecordingFailedVisible(false)} />
        </PopupSheet>
      </View>
    );
  }

  if (phase === 'reviewTrim') {
    const pool = reviewPoolFor(questionIndex);
    const activeTakeId = selectedTakeId ?? pool[pool.length - 1]?.id ?? '';
    const savedIds = new Set(videos.filter((v) => v.questionIndex === questionIndex).map((v) => v.id));
    return (
      <View style={{ flex: 1 }}>
        <ReviewTrimScreen
          questionNumber={questionIndex + 1}
          totalQuestions={questions.length}
          recordedQuestions={new Set([
            ...videos.map((video) => video.questionIndex),
            ...(pool.length > 0 ? [questionIndex] : []),
          ]).size}
          takes={pool.map((t) => ({
            id: t.id,
            filePath: t.filePath,
            durationSeconds: t.durationSeconds,
            durationVerified: t.durationVerified,
            trimAdjustedForReview: t.trimAdjustedForReview,
            trimStartSeconds: t.trimStartSeconds,
            trimEndSeconds: t.trimEndSeconds,
            saved: savedIds.has(t.id),
            isPrimary: savedIds.has(t.id) && t.isPrimary !== false,
          }))}
          selectedTakeId={activeTakeId}
          onSelectTake={setSelectedTakeId}
          onBack={() => {
            const editingSavedTakes = retakeQuestionIndex !== null && (takesByQuestion[questionIndex] ?? []).length === 0;
            if (editingSavedTakes) confirmExitQuestionFlow();
            else setPendingExitConfirm(true);
          }}
          onChangeTrim={(s, e) =>
            updatePoolTake(questionIndex, activeTakeId, { trimStartSeconds: s, trimEndSeconds: e })
          }
          // Everything in the pool counts as "kept" once it's at or below
          // the cap - no picking needed, keptTakeIds only holds a real
          // selection once handleRecordingFinished has populated it for a
          // pool that exceeds MAX_KEPT_TAKES.
          keptTakeIds={pool.length <= MAX_KEPT_TAKES ? pool.map((t) => t.id) : keptTakeIds}
          onToggleKept={handleToggleKept}
          onRecordAnother={handleRecordAnother}
          onKeep={handleKeepTake}
          onMeasuredDuration={handleMeasuredDuration}
          bindingQuestionText={questions[questionIndex]?.text}
          questionBindingNeeded={!questionSnapshotMatches(pool.find(take => take.id === activeTakeId)?.questionSnapshot, questions[questionIndex])}
          onBindQuestion={bindReviewedQuestion}
          onReviewReplacement={reviewReplacementBase}
          replacementReviewError={replacementReviewError}
          onDeleteTake={canDeleteReviewTake() ? handleDeleteTake : undefined}
        />

        <PopupSheet visible={replacementReview !== null} onDismiss={() => setReplacementReview(null)}>
          <Text style={{ fontSize: 21, fontWeight: '700', color: colors.text, marginBottom: spacing.sm }}>{t('uploadApproval.currentAnswer')}</Text>
          <Text style={{ color: colors.textMuted, marginBottom: spacing.md }}>{t(replacementReview?.segmentId ? 'uploadApproval.replaceReviewedBody' : 'uploadApproval.noCurrentAnswer')}</Text>
          {replacementReview?.play && <Button label={t('uploadApproval.reviewCurrentAnswer')} onPress={() => setPlayingVideo(replacementReview.play)} variant="secondary" />}
          <View style={{ marginTop: spacing.md }}><Button label={t('uploadApproval.useReviewedBase')} onPress={acceptReviewedReplacementBase} /></View>
        </PopupSheet>

        <PopupSheet visible={showPostKeepPrompt} onDismiss={() => setShowPostKeepPrompt(false)} dismissable={false} groupAccessibility={false}>
          <View style={{ marginBottom: spacing.lg }}>
            <CompletionFeedback feedback={keptFeedback?.destination === 'postKeep' ? keptFeedback : undefined} completed={keptAnswerCount(videos, questions.length)} total={questions.length} />
          </View>
          <View style={{ gap: 9 }}>
            <Button label={t('appFlow.postKeepPopupNextQuestionButton')} onPress={goToNextQuestion} />
            <View style={{ flexDirection: 'row', gap: 9 }}>
              <Button
                label={t('appFlow.postKeepPopupMyVideosButton')}
                variant="secondary"
                style={{ flex: 1 }}
                onPress={() => {
                  setShowPostKeepPrompt(false);
                  setMainTab('myVideos');
                  setScreen('main');
                }}
              />
              <Button
                label={t('appFlow.postKeepPopupHomeButton')}
                variant="secondary"
                style={{ flex: 1 }}
                onPress={() => {
                  setShowPostKeepPrompt(false);
                  setMainTab('home');
                  setScreen('main');
                }}
              />
            </View>
          </View>
        </PopupSheet>

        <PopupSheet visible={pendingExitConfirm} onDismiss={() => setPendingExitConfirm(false)}>
          <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 8 }}>
            {t('appFlow.exitConfirmPopupTitle')}
          </Text>
          <Text style={{ fontSize: 14.5, color: colors.textMuted, lineHeight: 21, marginBottom: 16 }}>
            {t('appFlow.exitConfirmPopupBodyDefault')}
          </Text>
          <View style={{ gap: 9 }}>
            <Button label={t('appFlow.exitConfirmPopupStopButton')} onPress={confirmExitQuestionFlow} />
            <Button
              label={t('appFlow.exitConfirmPopupKeepGoingButton')}
              variant="secondary"
              onPress={() => setPendingExitConfirm(false)}
            />
          </View>
        </PopupSheet>
      </View>
    );
  }

  // rehearse / cameraCheck / countdown / recording all share one
  // continuously-mounted <CameraAlignment/> - swapping which chrome
  // component wraps it (rather than layering chrome as siblings) would
  // remount the camera session mid-flow, right as recording is about to
  // start. See CameraCheckScreen's comment.
  return (
    <View style={{ flex: 1 }}>
      <CameraAlignment
        ref={cameraRef}
        lockMode={lockMode}
        resetToken={resetToken}
        onLocked={() => {
          if (phase !== 'cameraCheck') return;
          setChecksReady(true);
          if (autoStart) setPhase('countdown');
        }}
        onAlignmentInvalidated={() => {
          if (phase !== 'cameraCheck' && phase !== 'countdown') return;
          setChecksReady(false);
          setPhase('cameraCheck');
        }}
        alignmentActive={phase !== 'rehearse'}
        recordingActive={phase === 'recording'}
        onRecordingFinished={handleRecordingFinished}
        onRecordingError={handleRecordingError}
        onPermissionBlocked={() => setScreen('permissions')}
      />

      {phase === 'rehearse' && (
        <RehearseScreen
          questionText={questionText}
          voPlaybackUrl={voPlaybackUrl}
          readQuestionAloud={readQuestionAloud}
          onRecordForReal={enterCameraCheck}
          onBackToBrief={() => setPhase('brief')}
        />
      )}

      {(phase === 'cameraCheck' || phase === 'countdown') && (
        <CameraCheckScreen
          questionNumber={questionIndex + 1}
          totalQuestions={questions.length}
          questionText={questionText}
          prompts={prompts}
          autoStart={autoStart}
          onToggleAutoStart={setAutoStart}
          checksReady={checksReady}
          countingDown={phase === 'countdown'}
          countdownReady={questionAudioComplete}
          prepareQuestionAudio={prepareQuestionAudio}
          onQuestionAudioComplete={handleQuestionAudioComplete}
          countdownSeconds={countdownRemaining}
          onStartRecording={() => setPhase('countdown')}
          voPlaybackUrl={voPlaybackUrl}
          readQuestionAloud={readQuestionAloud}
          onToggleReadQuestionAloud={setReadQuestionAloud}
        />
      )}

      {phase === 'recording' && (
        <RecordingScreen
          questionNumber={questionIndex + 1}
          totalQuestions={questions.length}
          questionText={questionText}
          prompts={prompts}
          isRecording={phase === 'recording'}
          elapsedSeconds={elapsedSeconds}
          onFinishAnswer={() => {
            cameraRef.current
              ?.stopRecording()
              .catch((error) => console.error('[recording] stop failed', error));
          }}
        />
      )}

      <PopupSheet visible={pendingExitConfirm} onDismiss={() => setPendingExitConfirm(false)}>
        <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 8 }}>
          {t('appFlow.exitConfirmPopupTitle')}
        </Text>
        <Text style={{ fontSize: 14.5, color: colors.textMuted, lineHeight: 21, marginBottom: 16 }}>
          {phase === 'recording'
            ? t('appFlow.exitConfirmPopupBodyRecording')
            : t('appFlow.exitConfirmPopupBodyDefault')}
        </Text>
        <View style={{ gap: 9 }}>
          <Button label={t('appFlow.exitConfirmPopupStopButton')} onPress={confirmExitQuestionFlow} />
          <Button
            label={t('appFlow.exitConfirmPopupKeepGoingButton')}
            variant="secondary"
            onPress={() => setPendingExitConfirm(false)}
          />
        </View>
      </PopupSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  sessionLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  questionsErrorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  questionsErrorTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  questionsErrorSubtitle: {
    fontSize: 14.5,
    textAlign: 'center',
    lineHeight: 21,
  },
});
