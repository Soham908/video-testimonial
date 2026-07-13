import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { WelcomeScreen } from './screens/WelcomeScreen';
import { ConsentScreen } from './screens/ConsentScreen';
import { PermissionsScreen } from './screens/PermissionsScreen';
import { HomeScreen } from './screens/HomeScreen';
import { MyVideosScreen } from './screens/MyVideosScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { BottomTabBar, type MainTab } from './screens/BottomTabBar';
import { VideoPlayerScreen } from './screens/VideoPlayerScreen';
import { RecordingScreen } from './screens/RecordingScreen';
import { CameraAlignment, type CameraAlignmentHandle } from './CameraAlignment';
import { QuestionIntroOverlay } from './screens/QuestionIntroOverlay';
import { CountdownOverlay } from './screens/CountdownOverlay';
import { RedoPromptOverlay } from './screens/RedoPromptOverlay';
import { UploadingScreen } from './screens/UploadingScreen';
import { CompletionScreen } from './screens/CompletionScreen';
import { ConfirmationScreen } from './screens/ConfirmationScreen';
import {
  moveRecordingToDurableStorage,
  clearAllRecordings,
  type RecordedVideo,
} from './recordings';
import { colors } from './theme';

// Lightweight state-based flow - no navigation library added yet, so this
// doesn't require any new native dependencies/rebuild. Swap for
// React Navigation later if the flow grows more complex (e.g. back
// gestures, deep links).
type Screen =
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

const TOTAL_QUESTIONS = 5;
const PLACEHOLDER_QUESTIONS = [
  'What made you choose to work with us?',
  'What results have you seen so far?',
  'How has our support been for you?',
  'What would you say to someone considering us?',
  'Anything else you would like to share?',
];

// Not wired into App.tsx/index.ts yet - this is scaffolding for the
// surrounding app flow, built alongside (not on top of) the in-progress
// camera alignment feature so the two don't collide while both are being
// tested. TTS playback, real upload, and mid-answer alignment-break
// detection still don't exist for real - see the "Continue"/"Skip"
// buttons below and FRAME_PROCESSOR_PROGRESS.md for what's real vs.
// placeholder. Video recording + storage + playback are all real.
export function AppFlow() {
  const [screen, setScreen] = useState<Screen>('welcome');
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
  const [playingVideo, setPlayingVideo] = useState<RecordedVideo | null>(null);
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
    setVideos((prev) => [
      ...prev,
      { id: `q${questionIndex}-${Date.now()}`, label: `Question ${questionIndex + 1}`, filePath: durablePath },
    ]);
    goToNextQuestion();
  }

  // Testing convenience: clears prior recordings so My Videos doesn't grow
  // indefinitely across repeated test runs - see recordings.ts for the
  // caveat about revisiting this for the real product.
  function startNewSession() {
    clearAllRecordings();
    setVideos([]);
    setQuestionIndex(0);
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
            videos={videos}
            onPressVideo={(video) => setPlayingVideo(video)}
            onRetake={(video) =>
              console.log('[my-videos] retake tapped (placeholder)', video.id)
            }
          />
        )}
        {mainTab === 'profile' && <ProfileScreen />}
        <BottomTabBar activeTab={mainTab} onTabPress={setMainTab} />
      </View>
    );
  }

  if (screen === 'complete') {
    return <CompletionScreen onSave={() => setScreen('uploading')} />;
  }

  if (screen === 'uploading') {
    return (
      <View style={{ flex: 1 }}>
        <UploadingScreen />
        <SkipLink onPress={() => setScreen('confirmation')} />
      </View>
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
  const lockMode = questionIndex === 0 ? 'initial' : 'recheck';

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

function SkipLink({ onPress }: { onPress: () => void }) {
  return (
    <Pressable style={styles.skipLink} onPress={onPress}>
      <Text style={styles.skipLinkText}>Skip for now</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  skipLink: {
    position: 'absolute',
    bottom: 60,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  skipLinkText: {
    fontSize: 13,
    color: colors.textFaint,
    textDecorationLine: 'underline',
  },
});
