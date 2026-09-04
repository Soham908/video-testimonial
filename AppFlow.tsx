import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, StyleSheet, Text, View } from 'react-native';
import { File } from 'expo-file-system';
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
import { CameraAlignment, type CameraAlignmentHandle, type CaptureFormatInfo } from './CameraAlignment';
import { RetakeConfirmOverlay } from './screens/RetakeConfirmOverlay';
import { UploadingScreen } from './screens/UploadingScreen';
import { ConfirmationScreen } from './screens/ConfirmationScreen';
import { DevEntryMenu } from './components/dev/DevEntryMenu';
import { PopupSheet } from './components/ui/Modal';
import { Button } from './components/ui/Button';
import {
  moveRecordingToDurableStorage,
  clearAllRecordings,
  deleteRecording,
  type RecordedVideo,
} from './recordings';
import { useTheme } from './theme/ThemeContext';
import { restoreSession, getCurrentAuth, logout } from './auth';
import { fetchDistributorProfile, type DistributorProfile } from './distributorProfile';
import { uploadSegment } from './upload';
import { fetchSegments, fetchRenderedVideos, checkAndSyncCache, renderedUserStatus } from './myVideos';
import { getDeviceInfo } from './deviceInfo';
import { ENABLE_REEL_RENDERING, ENABLE_SELF_REGISTRATION } from './config';
import { getReadQuestionAloudPref, setReadQuestionAloudPref } from './preferences';
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
} from './session';

// Lightweight state-based flow - no navigation library added yet, so this
// doesn't require any new native dependencies/rebuild. Swap for
// React Navigation later if the flow grows more complex (e.g. back
// gestures, deep links).
type Screen =
  | 'sessionLoading'
  | 'login'
  // Real entry point when ENABLE_SELF_REGISTRATION is on (config.ts) -
  // reachable from Login's "New distributor? Register" link, unlike the
  // dev-only entry-cluster screens below. A successful registration
  // proceeds exactly like a successful login (handleAuthenticated).
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
// Bumped 3 -> 5 as a stopgap: the question-read-aloud VO can outlast the
// countdown, and recording starting before it's actually finished is a
// real clash, not just an audio-overlap glitch - see the sequencing note
// on the countdown-tick effect below for why this alone doesn't fully fix
// it for a VO clip longer than 5s.
const COUNTDOWN_SECONDS = 5;

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
export function AppFlow() {
  const { colors, spacing } = useTheme();
  const [screen, setScreen] = useState<Screen>('sessionLoading');
  const [mainTab, setMainTab] = useState<MainTab>('home');
  const [questionIndex, setQuestionIndex] = useState(0);
  const [phase, setPhase] = useState<QuestionPhase>('brief');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [countdownRemaining, setCountdownRemaining] = useState(COUNTDOWN_SECONDS);
  const [videos, setVideos] = useState<RecordedVideo[]>([]);
  const [playingVideo, setPlayingVideo] = useState<PlayableVideo | null>(null);
  // Non-null while retaking a single already-answered question from My
  // Videos - overrides lockMode to a full lock (this is a cold entry, not
  // a continuous session) and makes handleKeepTake replace that question's
  // existing entry instead of appending/advancing.
  const [retakeQuestionIndex, setRetakeQuestionIndex] = useState<number | null>(null);
  // The question index pending the "record again?" confirmation, shown
  // from My Videos before entering the camera flow at all.
  const [pendingRetake, setPendingRetake] = useState<number | null>(null);
  const [myVideosLoading, setMyVideosLoading] = useState(false);
  const [myVideosError, setMyVideosError] = useState<string | null>(null);
  const [answerRows, setAnswerRows] = useState<AnswerRow[]>([]);
  const [brandedRows, setBrandedRows] = useState<BrandedRow[]>([]);
  const [myVideosRefreshToken, setMyVideosRefreshToken] = useState(0);
  const cameraRef = useRef<CameraAlignmentHandle>(null);
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
  // this.
  const voSourceRef = useRef<{ questionId: string; url: string | undefined } | null>(null);

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
  // Real name/phone (distributorProfile.ts) - fetched alongside distributorId
  // on both a restored session and a fresh login, best-effort (a failed
  // fetch just leaves whatever's already there, same as loadQuestions()'s
  // tolerance below). Only `name`/`phone` are consumed anywhere in the app
  // today - `business`/`city`/`years_as_distributor` also come back on this
  // same response but are internal-test-phase-only fields nothing reads yet.
  const [distributorProfile, setDistributorProfile] = useState<DistributorProfile | null>(null);

  // Whether the Camera Check screen's toggle auto-starts the countdown once
  // checks pass, or waits for an explicit "Start recording" tap - no
  // backing state existed for this before (countdown-after-lock was
  // unconditional); this is genuinely new, not a reskin. Not reset
  // per-question - it's a standing preference the person sets once.
  const [autoStart, setAutoStart] = useState(true);
  // Whether the 3-2-1 countdown reads the question aloud (existing
  // per-question VO, same clip QuestionBriefScreen's "Read to me" plays) -
  // a standing device preference, not per-question/per-session state, so it
  // lives in SecureStore (preferences.ts) rather than session.ts. Defaults
  // true; loaded async below, same pattern ThemeContext uses for
  // palette/font.
  const [readQuestionAloud, setReadQuestionAloudState] = useState(true);
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
  // Trim metadata only - see recordings.ts. No media is actually cut here.
  const [trimStartSeconds, setTrimStartSeconds] = useState(0);
  const [trimEndSeconds, setTrimEndSeconds] = useState(0);
  const [removeLastTwoSeconds, setRemoveLastTwoSeconds] = useState(false);
  // True only once the person has actually dragged a trim handle for the
  // take currently in Review & Trim - trimStartSeconds/trimEndSeconds above
  // are pre-seeded to the take's full 0..duration window regardless, so
  // this is the only way to tell "never touched" apart from "chose the
  // full clip on purpose." Gates whether handleKeepTake carries trim data
  // onto the finalized take at all (untouched -> upload.ts sends
  // trim_start_ms/trim_end_ms as null, not 0/full-duration). Reset to false
  // everywhere trimStartSeconds/trimEndSeconds are reset to their defaults,
  // so a retake or a different selected take never inherits a stale take's
  // adjustment.
  const [trimAdjusted, setTrimAdjusted] = useState(false);
  // Shown after "Keep this take" on any question except the last one -
  // DECISIONS.md's "post-keep prompt: next question / my videos / home".
  const [showPostKeepPrompt, setShowPostKeepPrompt] = useState(false);
  // Shown when the hardware back button is pressed during cameraCheck/
  // countdown/recording/reviewTrim - these phases have no on-screen back
  // affordance by design (DECISIONS.md's "no tap-to-advance, ever" during
  // recording), but a hardware back press is a deliberate enough signal
  // that it deserves a real way out, just gated behind a confirmation
  // rather than exiting silently or being blocked outright.
  const [pendingExitConfirm, setPendingExitConfirm] = useState(false);

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
  // Gates the actual upload effect below - the new Upload screen shows a
  // plain list + confirmation pop-up first (design 7a/7b), and nothing
  // actually goes out until that's confirmed. Reset to false every time
  // 'uploading' is entered fresh, from either Home or My Videos.
  const [uploadConfirmed, setUploadConfirmed] = useState(false);
  // question_index (0-based) of every video already confirmed uploaded in
  // the current batch - see session.ts. Lets the upload effect resume
  // after a force-quit mid-upload instead of re-sending everything, and is
  // reset to [] whenever 'uploading' is entered as a genuinely new batch
  // (not on retry - a retry should only redo what didn't finish).
  const [uploadedQuestionIndices, setUploadedQuestionIndices] = useState<number[]>([]);
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
  async function loadQuestions() {
    try {
      const fresh = await fetchQuestions();
      cacheQuestions(fresh);
      setQuestions(fresh);
      setQuestionsError(null);
      // Fire-and-forget, same tolerance as fetchDistributorProfile() above -
      // a failed download just leaves that question's VO on the remote URL,
      // it doesn't block anything else here.
      cacheQuestionAudio(fresh)
        .then(() => setVoCacheVersion((v) => v + 1))
        .catch(() => {});
    } catch (error) {
      setQuestions((current) => {
        if (current.length === 0) {
          setQuestionsError(
            error instanceof Error ? error.message : 'Could not load your questions.',
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
  useEffect(() => {
    restoreSession().then((auth) => {
      if (!auth) {
        setScreen('login');
        setSessionRestored(true);
        return;
      }
      setDistributorId(auth.distributorId);
      fetchDistributorProfile().then(setDistributorProfile).catch(() => {});

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
      loadQuestions();

      const stored = loadSession();
      if (!stored || !hasMeaningfulProgress(stored)) {
        setScreen('onboarding');
        setSessionRestored(true);
        return;
      }

      setMainTab(stored.mainTab);
      setQuestionIndex(stored.questionIndex);
      setRetakeQuestionIndex(stored.retakeQuestionIndex);
      setVideos(stored.videos);
      setTakesByQuestion(stored.takesByQuestion);
      setSelectedTakeId(stored.selectedTakeId);
      setTrimStartSeconds(stored.trimStartSeconds);
      setTrimEndSeconds(stored.trimEndSeconds);
      setTrimAdjusted(stored.trimAdjusted ?? false);
      setRemoveLastTwoSeconds(stored.removeLastTwoSeconds);
      setAutoStart(stored.autoStart);
      setHasSubmittedBatch(stored.hasSubmittedBatch);
      setUploadConfirmed(stored.uploadConfirmed);
      setUploadedQuestionIndices(stored.uploadedQuestionIndices);

      if (stored.phase === 'recording' || stored.phase === 'countdown') {
        // Force-quit landed mid-capture (or during the countdown right
        // before it) - that take was never added to takesByQuestion (only
        // handleRecordingFinished does that, and it never got to run), so
        // there's nothing of it to restore. Only its temp file might be
        // left behind; clean that up and land on 'brief' for the same
        // question, same as a deliberate "stop and go back" would.
        purgeOrphanedRecordingTempFiles();
      }

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
          setScreen('question');
        }
      } else if (stored.screen === 'uploading') {
        setScreen('uploading');
      } else {
        setScreen('main');
      }
      setSessionRestored(true);
    });
  }, []);

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

  // Persists the whole session as it changes - not only on screen
  // transitions - so any of the force-quit points above can be resumed.
  // File writes here are synchronous local JSON (session.ts), same
  // pattern already used for the My Videos sync cache (myVideos.ts).
  useEffect(() => {
    if (!sessionRestored) return;
    const persistedScreen: PersistedScreen =
      screen === 'question' || screen === 'uploading' ? screen : 'main';
    saveSession({
      screen: persistedScreen,
      mainTab,
      questionIndex,
      phase,
      retakeQuestionIndex,
      videos,
      takesByQuestion,
      selectedTakeId,
      trimStartSeconds,
      trimEndSeconds,
      trimAdjusted,
      removeLastTwoSeconds,
      autoStart,
      hasSubmittedBatch,
      uploadConfirmed,
      uploadedQuestionIndices,
    });
  }, [
    sessionRestored,
    screen,
    mainTab,
    questionIndex,
    phase,
    retakeQuestionIndex,
    videos,
    takesByQuestion,
    selectedTakeId,
    trimStartSeconds,
    trimEndSeconds,
    trimAdjusted,
    removeLastTwoSeconds,
    autoStart,
    hasSubmittedBatch,
    uploadConfirmed,
    uploadedQuestionIndices,
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
          setMainTab('home');
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
      if (
        screen === 'splash' ||
        screen === 'whatsappInvite' ||
        screen === 'identityConfirm' ||
        screen === 'onboarding'
      ) {
        setScreen('login');
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', handler);
    return () => sub.remove();
  }, [screen, phase, mainTab, playingVideo, uploadConfirmed]);

  // Uploads every recorded segment for this session, sequentially, once
  // confirmed - real presigned-URL upload + confirm per segment (see
  // upload.ts). Deliberately doesn't change `screen` on completion any
  // more (it's already 'uploading' throughout - see the Screen type and
  // its render block) - only `hasSubmittedBatch` flips, which is what the
  // render block reads to swap from "sending" to "sent" copy on the same
  // screen. `uploadAttempt` exists only to let the retry button re-run
  // this same effect without changing `screen`.
  //
  // Deliberately NOT gated on `screen` (and `screen` is deliberately not a
  // dependency below) - ConfirmationScreen's "Back to Home" button is
  // reachable while a batch is still genuinely sending, and tapping it
  // must not silently abandon whatever hasn't uploaded yet. Gating on
  // `screen` here would tear this effect down the moment `screen` left
  // 'uploading', stopping the loop before the next segment even starts.
  useEffect(() => {
    if (!uploadConfirmed) return;
    let cancelled = false;
    setUploadError(null);

    (async () => {
      for (let i = 0; i < videos.length; i++) {
        if (cancelled) return;
        const video = videos[i];
        // Already confirmed in a previous run of this effect, or in a
        // previous app session before a force-quit mid-upload - see
        // session.ts's uploadedQuestionIndices. Skipping it is what makes
        // resuming mid-upload not re-send everything from scratch.
        if (uploadedQuestionIndices.includes(video.questionIndex)) continue;
        try {
          await uploadSegment(video, questions);
        } catch (error) {
          if (!cancelled) {
            setUploadError(error instanceof Error ? error.message : 'Upload failed.');
          }
          return;
        }
        if (!cancelled) {
          setUploadedQuestionIndices((prev) =>
            prev.includes(video.questionIndex) ? prev : [...prev, video.questionIndex],
          );
        }
      }
      if (!cancelled) {
        setHasSubmittedBatch(true);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadConfirmed, uploadAttempt]);

  // Mirrors uploadedQuestionIndices into the Uploading screen's 0-1
  // progress bar - a separate derived effect (rather than computed inline
  // in the loop above) so a session resumed mid-upload shows the correct
  // progress immediately, before the loop has uploaded anything new this
  // launch.
  useEffect(() => {
    setUploadProgress(videos.length ? uploadedQuestionIndices.length / videos.length : 0);
  }, [uploadedQuestionIndices, videos.length]);

  // Fetches My Videos' data whenever that tab is opened while on 'main' -
  // not continuously polled (no push/notification system exists yet per
  // CLAUDE.md, so "reopen the tab" is the refresh mechanism for now).
  useEffect(() => {
    if (screen !== 'main' || mainTab !== 'myVideos') return;
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
        if (cancelled) return;

        // Merge of local `videos` (recorded, possibly not yet uploaded) and
        // server `segments` (confirmed-uploaded) - a take kept via Review &
        // Trim must show as recorded here immediately, not only once
        // upload.ts's confirm call has gone through (DECISIONS.md's
        // "not recorded / recorded / uploaded" three pre-upload states).
        // Built as a Map keyed by the app's own 0-based position so both
        // sources can independently contribute a row for the same question.
        const rowsByQuestionIndex = new Map<number, AnswerRow>();

        // Local recordings first - the only source of truth before upload,
        // and the only copy that exists at all for a question not yet sent.
        for (const video of videos) {
          const label = `Question ${video.questionIndex + 1}`;
          rowsByQuestionIndex.set(video.questionIndex, {
            questionIndex: video.questionIndex,
            label,
            play: { filePath: video.filePath, label },
          });
        }

        // Server segments refine that once uploaded: prefer the local file
        // only while it's still in sync with the server's updated_at
        // (local-first cache pattern, API_CONTRACT.md) - e.g. a re-login
        // on a different device with no local copy at all falls through to
        // playback_url. `segment.question_index` is the backend's real
        // index (see upload.ts), not this app's local position - resolved
        // back via `questions`, not a `- 1` assumption that only happened
        // to hold for 1-based-contiguous seed data.
        for (const segment of segments) {
          const qIndex = questions.findIndex((q) => q.index === segment.question_index);
          if (qIndex === -1) continue; // question no longer in the current set
          const label = `Question ${segment.question_index}`;
          const local = videos.find((v) => v.questionIndex === qIndex);
          const useLocal = !!local && checkAndSyncCache(qIndex, segment.updated_at);
          rowsByQuestionIndex.set(qIndex, {
            questionIndex: qIndex,
            label,
            play: useLocal
              ? { filePath: local!.filePath, label }
              : { filePath: segment.playback_url, label },
          });
        }

        const answers: AnswerRow[] = Array.from(rowsByQuestionIndex.values());

        // Same real-index resolution as the segments merge above - not a
        // `- 1` assumption.
        const branded: BrandedRow[] = renderedVideos
          .map((rv) => {
            const qIndex = questions.findIndex((q) => q.index === rv.question_index);
            const label = `Question ${rv.question_index}`;
            return {
              questionIndex: qIndex,
              label,
              status: renderedUserStatus(rv.status),
              play: rv.playback_url ? { filePath: rv.playback_url, label } : null,
            };
          })
          .filter((row) => row.questionIndex !== -1);

        setAnswerRows(answers);
        setBrandedRows(branded);
      } catch (error) {
        if (!cancelled) {
          setMyVideosError(
            error instanceof Error ? error.message : 'Could not load your videos.',
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
  }, [screen, mainTab, myVideosRefreshToken]);

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
      return;
    }
    if (countdownRemaining <= 0) {
      // Known sequencing gap, not fixed by the COUNTDOWN_SECONDS bump alone:
      // startRecording() fires here, in the same tick, BEFORE setPhase
      // below causes CameraCheckScreen to re-render with countingDown=false
      // - which is what actually triggers its player.pause() cleanup (see
      // that component). So if the read-aloud VO is still playing at the
      // instant the countdown hits zero, recording can start a render cycle
      // or two before the audio actually stops, not just up to whatever
      // COUNTDOWN_SECONDS is set to. A real fix would pause the VO player
      // here, synchronously, before calling startRecording() - not attempted
      // yet, this comment is a marker for when it is.
      recordingStartedAtRef.current = Date.now();
      cameraRef.current
        ?.startRecording()
        .catch((error) => console.error('[recording] start failed', error));
      setPhase('recording');
      return;
    }
    const timeout = setTimeout(() => setCountdownRemaining((r) => r - 1), 1000);
    return () => clearTimeout(timeout);
  }, [phase, countdownRemaining]);

  function enterCameraCheck() {
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
    const fileName = `question-${questionIndex + 1}-${Date.now()}.mp4`;
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
      id: `q${questionIndex}-${Date.now()}`,
      label: `Question ${questionIndex + 1}`,
      filePath: durablePath,
      questionIndex,
      durationSeconds,
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

    setTakesByQuestion((prev) => {
      const existing = prev[questionIndex] ?? [];
      const updated = [...existing, newTake];
      if (updated.length <= MAX_TAKES) {
        return { ...prev, [questionIndex]: updated };
      }
      const [oldest, ...rest] = updated;
      deleteRecording(oldest.filePath);
      return { ...prev, [questionIndex]: rest };
    });
    setSelectedTakeId(newTake.id);
    setTrimStartSeconds(0);
    setTrimEndSeconds(durationSeconds);
    setTrimAdjusted(false);
    setRemoveLastTwoSeconds(false);
    setPhase('reviewTrim');
  }

  // "Keep this take" - finalizes the selected take (with its trim
  // metadata) into `videos`, discards the question's other pending takes'
  // files, and routes onward: retakes go straight back to My Videos;
  // otherwise the last question goes to the existing 'complete' screen
  // unchanged, and every other question shows the post-keep prompt.
  function handleKeepTake() {
    const currentTakes = takesByQuestion[questionIndex] ?? [];
    const kept = currentTakes.find((t) => t.id === selectedTakeId) ?? currentTakes[currentTakes.length - 1];
    if (!kept) return;

    currentTakes.filter((t) => t.id !== kept.id).forEach((t) => deleteRecording(t.filePath));
    const finalized: RecordedVideo = {
      ...kept,
      // Only carry trim points onto the finalized take if the person
      // actually dragged a handle - trimStartSeconds/trimEndSeconds are
      // pre-seeded to the full 0..duration window otherwise, and sending
      // that would misrepresent "never touched" as "chose the full clip."
      // upload.ts sends trim_start_ms/trim_end_ms as null when these stay
      // undefined.
      ...(trimAdjusted && { trimStartSeconds, trimEndSeconds }),
      removeLastTwoSeconds,
    };

    setTakesByQuestion((prev) => {
      const next = { ...prev };
      delete next[questionIndex];
      return next;
    });

    if (retakeQuestionIndex !== null) {
      setVideos((prev) => {
        const previous = prev.find((v) => v.questionIndex === questionIndex);
        if (previous) deleteRecording(previous.filePath);
        return prev.map((v) => (v.questionIndex === questionIndex ? finalized : v));
      });
      setRetakeQuestionIndex(null);
      setMainTab('myVideos');
      setScreen('main');
      return;
    }

    setVideos((prev) => [...prev, finalized]);

    // Last question: land on Home, whose "all recorded" state (built in
    // Phase 4b) already carries the "Send all five" CTA - no separate
    // completion screen needed any more. Every other question: the
    // post-keep prompt.
    if (questionIndex + 1 >= questions.length) {
      setMainTab('home');
      setScreen('main');
    } else {
      setShowPostKeepPrompt(true);
    }
  }

  function handleRecordAnother() {
    enterCameraCheck();
  }

  // Confirmed exit from the hardware-back popup during cameraCheck/
  // countdown/recording/reviewTrim. Discards an in-progress recording if
  // there is one; a take already sitting in takesByQuestion (reviewTrim,
  // not yet kept) is deliberately left alone so it's still there if the
  // person comes back to this question.
  function confirmExitQuestionFlow() {
    setPendingExitConfirm(false);
    if (phase === 'recording') {
      cameraRef.current?.cancelRecording().catch((error) => console.error('[recording] cancel failed', error));
    }
    setChecksReady(false);
    setTakeAttempt(0);
    setPhase('brief');
  }

  function goToNextQuestion() {
    setShowPostKeepPrompt(false);
    setQuestionIndex((i) => i + 1);
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
    setQuestionIndex(videos.length);
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
    clearAllRecordings();
    clearSession();
    setVideos([]);
    setTakesByQuestion({});
    setQuestionIndex(0);
    setRetakeQuestionIndex(null);
    setChecksReady(false);
    setTakeAttempt(0);
    setAutoStart(true);
    setUploadedQuestionIndices([]);
    setHasSubmittedBatch(false);
    setPhase('brief');
    setScreen('question');
  }

  // Entered only via My Videos' retake confirmation. Mirrors question 1's
  // cold-start sequence (align first, full lock) rather than questions
  // 2-5's lighter recheck, since there's no continuous camera session
  // behind this entry to justify a lighter check.
  function startRetake(qIndex: number) {
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

  // Clears the stored auth token and returns to the login screen. Recorded
  // videos on disk are left alone - logging out is a session/auth action,
  // not a data wipe (unlike the testing-only clearAllRecordings() above).
  function handleLogout() {
    logout();
    setDistributorId(null);
    setDistributorProfile(null);
    setMainTab('home');
    setScreen('login');
  }

  // Shared by a fresh login and a fresh self-registration (auth.ts's
  // register() leaves the app in an identical state to login() - same
  // token shape, immediately usable) - so a successful registration
  // proceeds exactly like a normal login from here on, not a separate path
  // that could drift out of sync with it.
  function handleAuthenticated() {
    getCurrentAuth().then((auth) => auth && setDistributorId(auth.distributorId));
    fetchDistributorProfile().then(setDistributorProfile).catch(() => {});
    // Cache-first: show cached questions immediately if any exist for this
    // device, then refresh in the background.
    const cachedQuestions = getCachedQuestions();
    if (cachedQuestions && cachedQuestions.length > 0) {
      setQuestions(cachedQuestions);
    }
    loadQuestions();
    setScreen('onboarding');
  }

  if (playingVideo) {
    return (
      <VideoPlayerScreen
        video={playingVideo}
        onClose={() => setPlayingVideo(null)}
      />
    );
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
      <SelfRegisterScreen onRegistered={handleAuthenticated} onBack={() => setScreen('login')} />
    );
  }

  // Real WhatsApp deep-link routing isn't wired yet - "Splash" here just
  // simulates a returning-user cold start (splash -> login), reachable via
  // the dev entry menu above. See DECISIONS.md.
  if (screen === 'splash') {
    return <SplashScreen onContinue={() => setScreen('login')} />;
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
    return <OnboardingScreen onGetStarted={() => setScreen('consent')} />;
  }

  if (screen === 'consent') {
    return <ConsentScreen onAgree={() => setScreen('main')} />;
  }

  if (screen === 'permissions') {
    return (
      <PermissionsScreen
        onContinue={enterNextQuestion}
        onBack={() => setScreen('main')}
        questionNumber={videos.length + 1}
        totalQuestions={questions.length}
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
              Couldn't load your questions
            </Text>
            <Text style={[styles.questionsErrorSubtitle, { color: colors.textMuted }]}>
              {questionsError}
            </Text>
            <Button
              label="Try again"
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
            questionsAnswered={videos.length}
            hasSubmittedBatch={hasSubmittedBatch}
            renderedReadyCount={brandedRows.filter((b) => b.status === 'ready').length}
            nextQuestion={
              videos.length < questions.length
                ? {
                    index: videos.length + 1,
                    text: questions[videos.length]?.text ?? '',
                    estimate: '45–60 second answer · about 3 minutes',
                  }
                : null
            }
            readyReel={null}
            onStartNextQuestion={() => setScreen('permissions')}
            onSendAll={() => {
              setUploadConfirmed(false);
              setUploadedQuestionIndices([]);
              setScreen('uploading');
            }}
            onOpenMyVideos={() => setMainTab('myVideos')}
            onShareReadyReel={() => {}}
          />
        )}
        {mainTab === 'myVideos' && (
          <MyVideosScreen
            loading={myVideosLoading}
            error={myVideosError}
            onRetryLoad={() => setMyVideosRefreshToken((n) => n + 1)}
            totalQuestions={questions.length}
            answers={answerRows}
            branded={brandedRows}
            reelRenderingEnabled={ENABLE_REEL_RENDERING}
            onPressAnswer={(row) => setPlayingVideo(row.play)}
            onPressBranded={(row) => row.play && setPlayingVideo({ ...row.play, celebratory: true })}
            onRetake={(qIndex) => setPendingRetake(qIndex)}
            onUploadAll={() => {
              setUploadConfirmed(false);
              setUploadedQuestionIndices([]);
              setScreen('uploading');
            }}
          />
        )}
        {mainTab === 'help' && <HelpScreen />}
        {mainTab === 'profile' && (
          <ProfileScreen
            distributorId={distributorId}
            distributorName={distributorProfile?.name}
            distributorPhone={distributorProfile?.phone}
            onOpenConsent={() => setScreen('consent')}
            onLogout={handleLogout}
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
      return (
        <ConfirmationScreen
          // Not `!hasSubmittedBatch` - that flag means "submitted at
          // least once, ever" and never resets, so it stays true across a
          // retake's re-upload and would wrongly skip straight to "done"
          // on a batch that's actually still sending. This is the actual
          // per-run signal the upload effect below drives.
          uploading={uploadedQuestionIndices.length < videos.length}
          progress={uploadProgress}
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
        items={videos.map((v) => ({
          questionIndex: v.questionIndex,
          label: `Question ${v.questionIndex + 1}`,
          questionText: questions[v.questionIndex]?.text ?? '',
          durationSeconds: v.durationSeconds,
        }))}
        error={uploadError}
        onConfirm={() => setUploadConfirmed(true)}
        onRetry={() => setUploadAttempt((n) => n + 1)}
        onSendLater={() => {
          setMainTab('home');
          setScreen('main');
        }}
        onBack={() => {
          setMainTab('myVideos');
          setScreen('main');
        }}
        // "Tappable back to review," not a retake shortcut - DECISIONS.md
        // explicitly rejects a change-take control at this commitment
        // moment ("duplicates review-screen logic"). Every item here is
        // still local-only (nothing's uploaded yet), so play it straight
        // from disk, same shape My Videos uses for its own answer rows.
        onReviewItem={(qIndex) => {
          const video = videos.find((v) => v.questionIndex === qIndex);
          if (video) setPlayingVideo({ filePath: video.filePath, label: `Question ${qIndex + 1}` });
        }}
      />
    );
  }

  // screen === 'question'
  const currentQuestion = questions[questionIndex];
  const questionText = currentQuestion?.text ?? '';
  // See voSourceRef's own comment (near cameraRef) for why this is pinned
  // per question id instead of recomputed on every render/voCacheVersion
  // bump - resolving fresh only when the question itself actually changes
  // avoids swapping a mounted player's source out from under it mid-use.
  if (voSourceRef.current?.questionId !== currentQuestion?.id) {
    voSourceRef.current = currentQuestion
      ? { questionId: currentQuestion.id, url: getLocalVoUri(currentQuestion.id) ?? currentQuestion.vo_playback_url }
      : null;
  }
  const voPlaybackUrl = voSourceRef.current?.url;
  // Question Brief's "a good answer usually covers" and Recording's
  // on-screen prompts both read from the same backend-provided list
  // (questions.ts) - null (no talking points configured, or not translated
  // into the resolved language yet) degrades to an empty array, same as
  // before this field existed.
  const talkingPoints: string[] = currentQuestion?.talking_points ?? [];
  const prompts: string[] = talkingPoints;
  // Retake is always a cold entry (no continuous camera session behind
  // it) - full lock regardless of which question index it targets, same
  // as question 1's first-time entry.
  const lockMode = retakeQuestionIndex !== null || questionIndex === 0 ? 'initial' : 'recheck';
  const resetToken = `${questionIndex}-${takeAttempt}`;
  const currentTakes = takesByQuestion[questionIndex] ?? [];

  if (phase === 'brief') {
    return (
      <QuestionBriefScreen
        questionNumber={questionIndex + 1}
        totalQuestions={questions.length}
        voPlaybackUrl={voPlaybackUrl}
        questionText={questionText}
        talkingPoints={talkingPoints}
        onStartRecording={enterCameraCheck}
        onRehearse={() => setPhase('rehearse')}
        onBack={() => {
          setMainTab('home');
          setScreen('main');
        }}
      />
    );
  }

  if (phase === 'reviewTrim') {
    const activeTakeId = selectedTakeId ?? currentTakes[currentTakes.length - 1]?.id ?? '';
    return (
      <View style={{ flex: 1 }}>
        <ReviewTrimScreen
          questionNumber={questionIndex + 1}
          takes={currentTakes.map((t) => ({ id: t.id, filePath: t.filePath, durationSeconds: t.durationSeconds }))}
          selectedTakeId={activeTakeId}
          onSelectTake={(id) => {
            setSelectedTakeId(id);
            const take = currentTakes.find((t) => t.id === id);
            setTrimStartSeconds(0);
            setTrimEndSeconds(take?.durationSeconds ?? 0);
            setTrimAdjusted(false);
          }}
          removeLastTwoSeconds={removeLastTwoSeconds}
          onToggleRemoveLastTwoSeconds={setRemoveLastTwoSeconds}
          trimStartSeconds={trimStartSeconds}
          trimEndSeconds={trimEndSeconds}
          onChangeTrim={(s, e) => {
            setTrimStartSeconds(s);
            setTrimEndSeconds(e);
            setTrimAdjusted(true);
          }}
          onRecordAnother={handleRecordAnother}
          onKeep={handleKeepTake}
        />

        <PopupSheet visible={showPostKeepPrompt} onDismiss={() => setShowPostKeepPrompt(false)} dismissable={false}>
          <Text style={{ fontSize: 21, fontWeight: '700', color: colors.text, marginBottom: 8 }}>
            Saved on your phone
          </Text>
          <Text style={{ fontSize: 14.5, color: colors.textMuted, lineHeight: 21, marginBottom: 16 }}>
            Question {questionIndex + 1} is ready. Nothing is sent yet — all your videos go up together once
            you've recorded all five.
          </Text>
          <View style={{ gap: 9 }}>
            <Button label="Next question" onPress={goToNextQuestion} />
            <View style={{ flexDirection: 'row', gap: 9 }}>
              <Button
                label="My Videos"
                variant="secondary"
                style={{ flex: 1 }}
                onPress={() => {
                  setShowPostKeepPrompt(false);
                  setMainTab('myVideos');
                  setScreen('main');
                }}
              />
              <Button
                label="Home"
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
            Stop and go back?
          </Text>
          <Text style={{ fontSize: 14.5, color: colors.textMuted, lineHeight: 21, marginBottom: 16 }}>
            You'll return to the question.
          </Text>
          <View style={{ gap: 9 }}>
            <Button label="Stop and go back" onPress={confirmExitQuestionFlow} />
            <Button label="Keep going" variant="secondary" onPress={() => setPendingExitConfirm(false)} />
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
          setChecksReady(true);
          if (autoStart) setPhase('countdown');
        }}
        alignmentActive
        recordingActive={phase === 'recording'}
        onRecordingFinished={handleRecordingFinished}
        onRecordingError={(error) => console.error('[recording]', error)}
        onPermissionBlocked={() => setScreen('permissions')}
      />

      {phase === 'rehearse' && (
        <RehearseScreen
          questionText={questionText}
          onRecordForReal={enterCameraCheck}
          onBackToBrief={() => setPhase('brief')}
        />
      )}

      {(phase === 'cameraCheck' || phase === 'countdown') && (
        <CameraCheckScreen
          questionNumber={questionIndex + 1}
          totalQuestions={questions.length}
          autoStart={autoStart}
          onToggleAutoStart={setAutoStart}
          checksReady={checksReady}
          countingDown={phase === 'countdown'}
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
          Stop and go back?
        </Text>
        <Text style={{ fontSize: 14.5, color: colors.textMuted, lineHeight: 21, marginBottom: 16 }}>
          {phase === 'recording'
            ? "This take won't be saved. You'll return to the question."
            : "You'll return to the question."}
        </Text>
        <View style={{ gap: 9 }}>
          <Button label="Stop and go back" onPress={confirmExitQuestionFlow} />
          <Button label="Keep going" variant="secondary" onPress={() => setPendingExitConfirm(false)} />
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
