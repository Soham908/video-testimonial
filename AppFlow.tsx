import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { LoginScreen } from './screens/LoginScreen';
import { WelcomeScreen } from './screens/WelcomeScreen';
import { ConsentScreen } from './screens/ConsentScreen';
import { PermissionsScreen } from './screens/PermissionsScreen';
import { HomeScreen } from './screens/HomeScreen';
import { MyVideosScreen, type AnswerRow, type BrandedRow } from './screens/MyVideosScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { BottomTabBar, type MainTab } from './screens/BottomTabBar';
import { VideoPlayerScreen, type PlayableVideo } from './screens/VideoPlayerScreen';
import { RecordingScreen } from './screens/RecordingScreen';
import { CameraAlignment, type CameraAlignmentHandle } from './CameraAlignment';
import { QuestionIntroOverlay } from './screens/QuestionIntroOverlay';
import { CountdownOverlay } from './screens/CountdownOverlay';
import { RedoPromptOverlay } from './screens/RedoPromptOverlay';
import { RetakeConfirmOverlay } from './screens/RetakeConfirmOverlay';
import { UploadingScreen } from './screens/UploadingScreen';
import { CompletionScreen } from './screens/CompletionScreen';
import { ConfirmationScreen } from './screens/ConfirmationScreen';
import {
  moveRecordingToDurableStorage,
  clearAllRecordings,
  deleteRecording,
  type RecordedVideo,
} from './recordings';
import { colors } from './theme';
import { restoreSession } from './auth';
import { uploadSegment } from './upload';
import { fetchSegments, fetchRenderedVideos, checkAndSyncCache, renderedUserStatus } from './myVideos';

// Lightweight state-based flow - no navigation library added yet, so this
// doesn't require any new native dependencies/rebuild. Swap for
// React Navigation later if the flow grows more complex (e.g. back
// gestures, deep links).
type Screen =
  | 'sessionLoading'
  | 'login'
  | 'welcome'
  | 'consent'
  | 'main'
  | 'permissions'
  | 'question'
  | 'complete'
  | 'uploading'
  | 'confirmation';

// Question VO plays first (full-screen intro, camera not visible) while
// alignment detection runs silently underneath the whole time - so a
// person who's already positioned (recheck case, questions 2-5 especially)
// is often already locked by the time they tap "I'm ready." Tapping ready
// either jumps straight to the countdown (already locked) or drops into
// 'aligning' to show the guide until lock completes, then auto-continues -
// no extra manual step. Per CLAUDE.md: full alignment lock (~15-20 frames)
// before question 1, lighter recheck (~5-8 frames) before questions 2-5,
// guide fades out once locked -> countdown -> recording auto-starts ->
// redo prompt (recording stays active until keep/redo is chosen - "keep"
// finalizes the file, "redo" cancels+deletes it) -> next question.
type QuestionPhase =
  | 'intro'
  | 'aligning'
  | 'countdown'
  | 'recording'
  | 'redo-prompt';

// TEMPORARY (testing convenience only): CLAUDE.md's locked flow is 5
// questions - trimmed to 3 here just to make manual test runs faster,
// not a real product decision. Revert to 5 (and restore the other two
// PLACEHOLDER_QUESTIONS entries below) once done testing.
const TOTAL_QUESTIONS = 3;
const PLACEHOLDER_QUESTIONS = [
  'What made you choose to work with us?',
  'What results have you seen so far?',
  'How has our support been for you?',
  // 'What would you say to someone considering us?',
  // 'Anything else you would like to share?',
];

// Real upload and mid-answer alignment-break detection still don't exist -
// see the "Skip for now" link below. Question VO, alignment guidance
// (incl. ambient noise check), and video recording/storage/playback are
// all real.
export function AppFlow() {
  const [screen, setScreen] = useState<Screen>('sessionLoading');
  const [mainTab, setMainTab] = useState<MainTab>('home');
  // Question 1 is align-first (nothing to settle into yet, so check
  // alignment before ever showing a question) - questions 2-5 are
  // question-first (person's likely still roughly positioned from the
  // previous take, so let them hear the question while resettling, then
  // check). `startNewSession` starts question 1 in 'aligning'; every
  // subsequent question starts in 'intro' via `goToNextQuestion`.
  const [questionIndex, setQuestionIndex] = useState(0);
  const [phase, setPhase] = useState<QuestionPhase>('aligning');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [videos, setVideos] = useState<RecordedVideo[]>([]);
  const [playingVideo, setPlayingVideo] = useState<PlayableVideo | null>(null);
  // Non-null while retaking a single already-answered question from My
  // Videos - overrides lockMode to a full lock (this is a cold entry, not
  // a continuous session) and makes handleRecordingFinished replace that
  // question's existing entry instead of appending/advancing.
  const [retakeQuestionIndex, setRetakeQuestionIndex] = useState<number | null>(null);
  // The question index pending the "record again?" confirmation, shown
  // from My Videos before entering the camera flow at all. Just the
  // index, not a full RecordedVideo - My Videos rows are backend-driven
  // now (see the myVideos fetch effect below), and retake only ever needs
  // to know *which* question, not any of that row's other data.
  const [pendingRetake, setPendingRetake] = useState<number | null>(null);
  const [myVideosLoading, setMyVideosLoading] = useState(false);
  const [myVideosError, setMyVideosError] = useState<string | null>(null);
  const [answerRows, setAnswerRows] = useState<AnswerRow[]>([]);
  const [brandedRows, setBrandedRows] = useState<BrandedRow[]>([]);
  const [myVideosRefreshToken, setMyVideosRefreshToken] = useState(0);
  const cameraRef = useRef<CameraAlignmentHandle>(null);
  // Tracks whether alignment has already locked for the *current* question -
  // read once, synchronously, whenever 'aligning' would otherwise need to
  // be (re-)entered, so a ref (not state) is enough, no re-render needed.
  // Reset whenever a new question starts.
  const lockedForQuestion = useRef(false);
  // Tracks whether the question intro/VO has already been shown for the
  // *current* question - distinguishes "this is question 1's align-first
  // lock, about to show the intro for the first time" from "this is a
  // question 2-5 lock happening after the intro was already shown and
  // 'I'm ready' was tapped," since both look identical from inside
  // `onLocked` (phase === 'aligning') otherwise. Reset alongside
  // `lockedForQuestion`.
  const introShownForQuestion = useRef(false);
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

  // Runs once on launch - a stored token merely being present doesn't mean
  // it's still valid, so restoreSession() confirms it against GET /me
  // before skipping the login screen. No dependency on `screen` - this
  // must only ever run once per app launch, not on every re-render.
  useEffect(() => {
    restoreSession().then((valid) => {
      setScreen(valid ? 'welcome' : 'login');
    });
  }, []);

  // Uploads every recorded segment for this session, sequentially, when
  // the 'uploading' screen is entered - real presigned-URL upload +
  // confirm per segment (see upload.ts), replacing the old SkipLink mock.
  // `uploadAttempt` exists only to let the retry button re-run this same
  // effect without changing `screen`.
  useEffect(() => {
    if (screen !== 'uploading') return;
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
      if (!cancelled) setScreen('confirmation');
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, uploadAttempt]);

  // Fetches My Videos' data whenever that tab is opened while on 'main' -
  // not continuously polled (no push/notification system exists yet per
  // CLAUDE.md, so "reopen the tab" is the refresh mechanism for now).
  // `myVideosRefreshToken` lets the error state's retry button re-run this
  // without needing to leave and re-enter the tab.
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
          const questionIndex = segment.question_index - 1;
          const label = `Question ${segment.question_index}`;
          const local = videos.find((v) => v.questionIndex === questionIndex);
          // checkAndSyncCache also updates the cache as a side effect - see
          // myVideos.ts. Only trust the local file if the server's copy of
          // this segment hasn't changed since we last synced against it.
          const useLocal = !!local && checkAndSyncCache(questionIndex, segment.updated_at);
          return {
            questionIndex,
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

  function goToNextQuestion() {
    if (questionIndex + 1 >= TOTAL_QUESTIONS) {
      setScreen('complete');
      return;
    }
    setQuestionIndex((i) => i + 1);
    lockedForQuestion.current = false;
    introShownForQuestion.current = false;
    setPhase('intro');
  }

  // Only ever fires as a result of "Keep this take" (stopRecording()) -
  // "Redo answer" uses cancelRecording() instead, which doesn't finalize
  // a file, so this is unambiguous.
  function handleRecordingFinished(tempFilePath: string) {
    const fileName = `question-${questionIndex + 1}-${Date.now()}.mp4`;
    const durablePath = moveRecordingToDurableStorage(tempFilePath, fileName);
    const durationSeconds = recordingStartedAtRef.current
      ? (Date.now() - recordingStartedAtRef.current) / 1000
      : 0;
    const newVideo: RecordedVideo = {
      id: `q${questionIndex}-${Date.now()}`,
      label: `Question ${questionIndex + 1}`,
      filePath: durablePath,
      questionIndex,
      durationSeconds,
    };

    if (retakeQuestionIndex !== null) {
      // Replace in place - same list position in My Videos, not a new
      // entry appended alongside the old one.
      setVideos((prev) => {
        const previous = prev.find((v) => v.questionIndex === questionIndex);
        if (previous) deleteRecording(previous.filePath);
        return prev.map((v) => (v.questionIndex === questionIndex ? newVideo : v));
      });
      setRetakeQuestionIndex(null);
      setMainTab('myVideos');
      setScreen('main');
      return;
    }

    setVideos((prev) => [...prev, newVideo]);
    goToNextQuestion();
  }

  // Testing convenience: clears prior recordings so My Videos doesn't grow
  // indefinitely across repeated test runs - see recordings.ts for the
  // caveat about revisiting this for the real product.
  function startNewSession() {
    clearAllRecordings();
    setVideos([]);
    setQuestionIndex(0);
    setRetakeQuestionIndex(null);
    lockedForQuestion.current = false;
    introShownForQuestion.current = false;
    setPhase('aligning');
    setScreen('question');
  }

  // Entered only via My Videos' retake confirmation. Mirrors question 1's
  // cold-start sequence (align first, full lock) rather than questions
  // 2-5's lighter recheck, since there's no continuous camera session
  // behind this entry to justify a lighter check.
  function startRetake(questionIndex: number) {
    setQuestionIndex(questionIndex);
    setRetakeQuestionIndex(questionIndex);
    lockedForQuestion.current = false;
    introShownForQuestion.current = false;
    setPhase('aligning');
    setScreen('question');
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
      <View style={styles.sessionLoading}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (screen === 'login') {
    return <LoginScreen onLoggedIn={() => setScreen('welcome')} />;
  }

  if (screen === 'welcome') {
    return <WelcomeScreen onGetStarted={() => setScreen('consent')} />;
  }

  if (screen === 'consent') {
    return <ConsentScreen onAgree={() => setScreen('main')} />;
  }

  if (screen === 'permissions') {
    return <PermissionsScreen onContinue={startNewSession} />;
  }

  if (screen === 'main') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {mainTab === 'home' && <HomeScreen onCreateNew={() => setScreen('permissions')} />}
        {mainTab === 'myVideos' && (
          <MyVideosScreen
            loading={myVideosLoading}
            error={myVideosError}
            onRetryLoad={() => setMyVideosRefreshToken((n) => n + 1)}
            answers={answerRows}
            branded={brandedRows}
            onPressAnswer={(row) => setPlayingVideo(row.play)}
            onPressBranded={(row) => row.play && setPlayingVideo(row.play)}
            onRetake={(questionIndex) => setPendingRetake(questionIndex)}
          />
        )}
        {mainTab === 'profile' && <ProfileScreen />}
        <BottomTabBar activeTab={mainTab} onTabPress={setMainTab} />

        {pendingRetake !== null && (
          <RetakeConfirmOverlay
            questionNumber={pendingRetake + 1}
            onCancel={() => setPendingRetake(null)}
            onConfirm={() => {
              const questionIndex = pendingRetake;
              setPendingRetake(null);
              startRetake(questionIndex);
            }}
          />
        )}
      </View>
    );
  }

  if (screen === 'complete') {
    return <CompletionScreen onSave={() => setScreen('uploading')} />;
  }

  if (screen === 'uploading') {
    return (
      <UploadingScreen
        progress={uploadError ? undefined : uploadProgress}
        error={uploadError}
        onRetry={() => setUploadAttempt((n) => n + 1)}
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
        onRecordAnother={() => setScreen('permissions')}
      />
    );
  }

  // screen === 'question'
  const questionText = PLACEHOLDER_QUESTIONS[questionIndex] ?? '';
  // Retake is always a cold entry (no continuous camera session behind
  // it) - full lock regardless of which question index it targets, same
  // as question 1's first-time entry.
  const lockMode =
    retakeQuestionIndex !== null || questionIndex === 0 ? 'initial' : 'recheck';

  return (
    <View style={{ flex: 1 }}>
      <RecordingScreen
        questionNumber={questionIndex + 1}
        totalQuestions={TOTAL_QUESTIONS}
        questionText={questionText}
        isRecording={phase === 'recording'}
        elapsedSeconds={elapsedSeconds}
        onFinishAnswer={() => setPhase('redo-prompt')}
      >
        <CameraAlignment
          ref={cameraRef}
          lockMode={lockMode}
          resetToken={questionIndex}
          onLocked={() => {
            // Only ever fires while phase === 'aligning' now, since
            // detection is fully off otherwise (alignmentActive below).
            // Two cases look identical here (phase === 'aligning') but
            // need different destinations: question 1's align-first lock
            // (intro not shown yet) should reveal the intro; a
            // post-"I'm ready" lock (intro already shown) should go
            // straight to the countdown.
            lockedForQuestion.current = true;
            setPhase((current) => {
              if (current !== 'aligning') return current;
              return introShownForQuestion.current ? 'countdown' : 'intro';
            });
          }}
          // Detection must not run at all while the question intro/VO is
          // showing - only once the user has actually tapped "I'm ready"
          // (or, for question 1, from the very start).
          alignmentActive={phase !== 'intro'}
          recordingActive={phase === 'recording' || phase === 'redo-prompt'}
          onRecordingFinished={handleRecordingFinished}
          onRecordingError={(error) => console.error('[recording]', error)}
        />

        {phase === 'intro' && (
          <QuestionIntroOverlay
            questionNumber={questionIndex + 1}
            totalQuestions={TOTAL_QUESTIONS}
            questionText={questionText}
            onFinishedSpeaking={() => {
              introShownForQuestion.current = true;
              setPhase(lockedForQuestion.current ? 'countdown' : 'aligning');
            }}
          />
        )}
        {phase === 'countdown' && (
          <CountdownOverlay
            seconds={3}
            onComplete={() => {
              recordingStartedAtRef.current = Date.now();
              cameraRef.current
                ?.startRecording()
                .catch((error) => console.error('[recording] start failed', error));
              setPhase('recording');
            }}
          />
        )}
      </RecordingScreen>

      {/* Rendered outside RecordingScreen (not in its children) so it
          always paints above the question bar / rec indicator / progress
          badge - those are RecordingScreen's own chrome, layered after its
          children, and would otherwise sit on top of and block this. */}
      {phase === 'redo-prompt' && (
        <RedoPromptOverlay
          onKeep={() => {
            cameraRef.current
              ?.stopRecording()
              .catch((error) => console.error('[recording] stop failed', error));
          }}
          onRedo={() => {
            cameraRef.current
              ?.cancelRecording()
              .catch((error) => console.error('[recording] cancel failed', error));
            setPhase('countdown');
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sessionLoading: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
