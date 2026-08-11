import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { LoginScreen } from './screens/LoginScreen';
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
import { CameraAlignment, type CameraAlignmentHandle } from './CameraAlignment';
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
import { restoreSession, logout } from './auth';
import { uploadSegment } from './upload';
import { fetchSegments, fetchRenderedVideos, checkAndSyncCache, renderedUserStatus } from './myVideos';

// Lightweight state-based flow - no navigation library added yet, so this
// doesn't require any new native dependencies/rebuild. Swap for
// React Navigation later if the flow grows more complex (e.g. back
// gestures, deep links).
type Screen =
  | 'sessionLoading'
  | 'login'
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
  | 'uploading'
  | 'confirmation';

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
const COUNTDOWN_SECONDS = 3;

// CLAUDE.md/DECISIONS.md's locked flow is 5 questions - was trimmed to 3
// during earlier manual testing (see git history); restored here per
// DECISIONS.md's "Question config narrowed to 1-5" build-order item. UI
// side is on mock data - the backend currently only accepts question
// indices 1-3 per API_CONTRACT.md, a known gap for Phase 7's real wiring,
// not this pass.
const TOTAL_QUESTIONS = 5;
const PLACEHOLDER_QUESTIONS = [
  'What made you choose to work with us?',
  'What results have you seen so far?',
  'How has our support been for you?',
  'What would you say to someone considering us?',
  'Anything else you would like to share?',
];
const PLACEHOLDER_TALKING_POINTS = [
  ['What you were looking for', 'Why we stood out', 'How the decision felt'],
  ['A specific result or number', 'How it changed day to day', 'What surprised you'],
  ['A time support helped', 'How quickly you got a reply', 'Why your trust has held'],
  ['What made you confident', 'What stood out most', 'Who it would suit'],
  ['Anything left unsaid', 'A moment worth mentioning', 'Advice for someone starting out'],
];
const PLACEHOLDER_PROMPTS = [
  ['What you needed', 'Why us', 'How it felt'],
  ['A result', 'Day to day', 'What surprised you'],
  ["Support's help", 'Reply speed', 'Your trust'],
  ['Your confidence', 'What stood out', 'Who it suits'],
  ['One more thing', 'A moment', 'Your advice'],
];

// Real upload is real (see upload.ts); mid-answer alignment-break detection
// during a live take still doesn't exist. Question VO, alignment guidance
// (incl. ambient noise check), and video recording/storage/playback are
// all real.
export function AppFlow() {
  const { colors } = useTheme();
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

  // Whether the Camera Check screen's toggle auto-starts the countdown once
  // checks pass, or waits for an explicit "Start recording" tap - no
  // backing state existed for this before (countdown-after-lock was
  // unconditional); this is genuinely new, not a reskin. Not reset
  // per-question - it's a standing preference the person sets once.
  const [autoStart, setAutoStart] = useState(true);
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
  // Shown after "Keep this take" on any question except the last one -
  // DECISIONS.md's "post-keep prompt: next question / my videos / home".
  const [showPostKeepPrompt, setShowPostKeepPrompt] = useState(false);

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
  // True once a batch has been sent successfully at least once - drives
  // Home's "submitted, being prepared" state. Deliberately does NOT hide
  // the upload entry point in My Videos afterward - a retake after
  // submitting still needs a way to send the updated video (this is the
  // fix for the retake-never-reuploads gap: My Videos' Upload button
  // always re-sends whatever is currently in `videos`, retaken or not).
  const [hasSubmittedBatch, setHasSubmittedBatch] = useState(false);

  // Runs once on launch - a stored token merely being present doesn't mean
  // it's still valid, so restoreSession() confirms it against GET /me
  // before skipping the login screen. No dependency on `screen` - this
  // must only ever run once per app launch, not on every re-render.
  useEffect(() => {
    restoreSession().then((valid) => {
      setScreen(valid ? 'onboarding' : 'login');
    });
  }, []);

  // Uploads every recorded segment for this session, sequentially, when
  // the 'uploading' screen is entered - real presigned-URL upload +
  // confirm per segment (see upload.ts). `uploadAttempt` exists only to
  // let the retry button re-run this same effect without changing `screen`.
  useEffect(() => {
    if (screen !== 'uploading' || !uploadConfirmed) return;
    let cancelled = false;
    setUploadError(null);
    setUploadProgress(0);

    (async () => {
      for (let i = 0; i < videos.length; i++) {
        if (cancelled) return;
        try {
          await uploadSegment(videos[i]);
        } catch (error) {
          if (!cancelled) {
            setUploadError(error instanceof Error ? error.message : 'Upload failed.');
          }
          return;
        }
        if (!cancelled) setUploadProgress((i + 1) / videos.length);
      }
      if (!cancelled) {
        setHasSubmittedBatch(true);
        setScreen('confirmation');
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, uploadConfirmed, uploadAttempt]);

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
        const [segments, renderedVideos] = await Promise.all([
          fetchSegments(),
          fetchRenderedVideos(),
        ]);
        if (cancelled) return;

        const answers: AnswerRow[] = segments.map((segment) => {
          const qIndex = segment.question_index - 1;
          const label = `Question ${segment.question_index}`;
          const local = videos.find((v) => v.questionIndex === qIndex);
          const useLocal = !!local && checkAndSyncCache(qIndex, segment.updated_at);
          return {
            questionIndex: qIndex,
            label,
            play: useLocal
              ? { filePath: local!.filePath, label }
              : { filePath: segment.playback_url, label },
          };
        });

        const branded: BrandedRow[] = renderedVideos.map((rv) => {
          const label = `Question ${rv.question_index}`;
          return {
            questionIndex: rv.question_index - 1,
            label,
            status: renderedUserStatus(rv.status),
            play: rv.playback_url ? { filePath: rv.playback_url, label } : null,
          };
        });

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
  function handleRecordingFinished(tempFilePath: string) {
    const fileName = `question-${questionIndex + 1}-${Date.now()}.mp4`;
    const durablePath = moveRecordingToDurableStorage(tempFilePath, fileName);
    const durationSeconds = recordingStartedAtRef.current
      ? (Date.now() - recordingStartedAtRef.current) / 1000
      : 0;
    const newTake: RecordedVideo = {
      id: `q${questionIndex}-${Date.now()}`,
      label: `Question ${questionIndex + 1}`,
      filePath: durablePath,
      questionIndex,
      durationSeconds,
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
      trimStartSeconds,
      trimEndSeconds,
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
    if (questionIndex + 1 >= TOTAL_QUESTIONS) {
      setMainTab('home');
      setScreen('main');
    } else {
      setShowPostKeepPrompt(true);
    }
  }

  function handleRecordAnother() {
    enterCameraCheck();
  }

  function goToNextQuestion() {
    setShowPostKeepPrompt(false);
    setQuestionIndex((i) => i + 1);
    setChecksReady(false);
    setTakeAttempt(0);
    setPhase('brief');
  }

  // Testing convenience: clears prior recordings so My Videos doesn't grow
  // indefinitely across repeated test runs - see recordings.ts for the
  // caveat about revisiting this for the real product.
  function startNewSession() {
    clearAllRecordings();
    setVideos([]);
    setTakesByQuestion({});
    setQuestionIndex(0);
    setRetakeQuestionIndex(null);
    setChecksReady(false);
    setTakeAttempt(0);
    setAutoStart(true);
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
    setMainTab('home');
    setScreen('login');
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
        <LoginScreen onLoggedIn={() => setScreen('onboarding')} />
        {__DEV__ && (
          <DevEntryMenu
            items={[
              { label: 'Splash', onPress: () => setScreen('splash') },
              { label: 'WhatsApp invite → identity → onboarding', onPress: () => setScreen('whatsappInvite') },
              { label: 'Onboarding only', onPress: () => setScreen('onboarding') },
            ]}
          />
        )}
      </View>
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
        onContinue={startNewSession}
        onBack={() => setScreen('main')}
        questionNumber={questionIndex + 1}
        totalQuestions={TOTAL_QUESTIONS}
      />
    );
  }

  if (screen === 'main') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {mainTab === 'home' && (
          <HomeScreen
            // Mock identity - no real account backend wired yet (Phase
            // 4f/7), matches the identity-confirmation mock default.
            // Full name: HomeScreen splits it (first name for the greeting,
            // initials for the avatar monogram - design 1C/15).
            distributorName="Mahesh Agrawal"
            businessName="Agrawal Traders"
            city="Nagpur"
            totalQuestions={TOTAL_QUESTIONS}
            questionsAnswered={videos.length}
            hasSubmittedBatch={hasSubmittedBatch}
            renderedReadyCount={brandedRows.filter((b) => b.status === 'ready').length}
            nextQuestion={
              videos.length < TOTAL_QUESTIONS
                ? {
                    index: videos.length + 1,
                    text: PLACEHOLDER_QUESTIONS[videos.length] ?? '',
                    estimate: '45–60 second answer · about 3 minutes',
                  }
                : null
            }
            readyReel={null}
            onStartNextQuestion={() => setScreen('permissions')}
            onSendAll={() => {
              setUploadConfirmed(false);
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
            totalQuestions={TOTAL_QUESTIONS}
            answers={answerRows}
            branded={brandedRows}
            onPressAnswer={(row) => setPlayingVideo(row.play)}
            onPressBranded={(row) => row.play && setPlayingVideo({ ...row.play, celebratory: true })}
            onRetake={(qIndex) => setPendingRetake(qIndex)}
            onUploadAll={() => {
              setUploadConfirmed(false);
              setScreen('uploading');
            }}
          />
        )}
        {mainTab === 'help' && <HelpScreen />}
        {mainTab === 'profile' && (
          <ProfileScreen onOpenConsent={() => setScreen('consent')} onLogout={handleLogout} />
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
    return (
      <UploadingScreen
        items={videos.map((v) => ({
          questionIndex: v.questionIndex,
          label: `Question ${v.questionIndex + 1}`,
          questionText: PLACEHOLDER_QUESTIONS[v.questionIndex],
          durationSeconds: v.durationSeconds,
        }))}
        uploading={uploadConfirmed}
        progress={uploadProgress}
        error={uploadError}
        onConfirm={() => setUploadConfirmed(true)}
        onRetry={() => setUploadAttempt((n) => n + 1)}
        onGoHome={() => {
          setMainTab('home');
          setScreen('main');
        }}
        onSendLater={() => {
          setMainTab('home');
          setScreen('main');
        }}
        onBack={() => {
          setMainTab('myVideos');
          setScreen('main');
        }}
      />
    );
  }

  if (screen === 'confirmation') {
    return (
      <ConfirmationScreen
        onDone={() => {
          setMainTab('home');
          setScreen('main');
        }}
      />
    );
  }

  // screen === 'question'
  const questionText = PLACEHOLDER_QUESTIONS[questionIndex] ?? '';
  const talkingPoints = PLACEHOLDER_TALKING_POINTS[questionIndex] ?? [];
  const prompts = PLACEHOLDER_PROMPTS[questionIndex] ?? [];
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
        totalQuestions={TOTAL_QUESTIONS}
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
          }}
          removeLastTwoSeconds={removeLastTwoSeconds}
          onToggleRemoveLastTwoSeconds={setRemoveLastTwoSeconds}
          trimStartSeconds={trimStartSeconds}
          trimEndSeconds={trimEndSeconds}
          onChangeTrim={(s, e) => {
            setTrimStartSeconds(s);
            setTrimEndSeconds(e);
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
          totalQuestions={TOTAL_QUESTIONS}
          autoStart={autoStart}
          onToggleAutoStart={setAutoStart}
          checksReady={checksReady}
          countingDown={phase === 'countdown'}
          countdownSeconds={countdownRemaining}
          onStartRecording={() => setPhase('countdown')}
        />
      )}

      {phase === 'recording' && (
        <RecordingScreen
          questionNumber={questionIndex + 1}
          totalQuestions={TOTAL_QUESTIONS}
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
    </View>
  );
}

const styles = StyleSheet.create({
  sessionLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
