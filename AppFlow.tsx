import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { WelcomeScreen } from './screens/WelcomeScreen';
import { ConsentScreen } from './screens/ConsentScreen';
import { HomeScreen, type RecordedVideo } from './screens/HomeScreen';
import { VideoPlayerScreen } from './screens/VideoPlayerScreen';
import { RecordingScreen } from './screens/RecordingScreen';
import { CameraAlignment, type CameraAlignmentHandle } from './CameraAlignment';
import { QuestionIntroOverlay } from './screens/QuestionIntroOverlay';
import { CountdownOverlay } from './screens/CountdownOverlay';
import { RedoPromptOverlay } from './screens/RedoPromptOverlay';
import { UploadingScreen } from './screens/UploadingScreen';
import { CompletionScreen } from './screens/CompletionScreen';
import { moveRecordingToDurableStorage, clearAllRecordings } from './recordings';
import { colors, radius, spacing, typography } from './theme';

// Lightweight state-based flow - no navigation library added yet, so this
// doesn't require any new native dependencies/rebuild. Swap for
// React Navigation later if the flow grows more complex (e.g. back
// gestures, deep links).
type Screen =
  | 'welcome'
  | 'consent'
  | 'home'
  | 'question'
  | 'uploading'
  | 'complete';

// Per CLAUDE.md: full alignment lock (~15-20 frames) before question 1,
// lighter recheck (~5-8 frames) before questions 2-5, guide fades out once
// locked -> TTS question plays fully -> 5s countdown -> recording
// auto-starts -> redo prompt (recording stays active until keep/redo is
// chosen - "keep" finalizes the file, "redo" cancels+deletes it) -> next
// question.
type QuestionPhase =
  | 'aligning'
  | 'intro'
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
  const [questionIndex, setQuestionIndex] = useState(0);
  const [phase, setPhase] = useState<QuestionPhase>('aligning');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [videos, setVideos] = useState<RecordedVideo[]>([]);
  const [playingVideo, setPlayingVideo] = useState<RecordedVideo | null>(null);
  const cameraRef = useRef<CameraAlignmentHandle>(null);

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
      setScreen('uploading');
      return;
    }
    setQuestionIndex((i) => i + 1);
    setPhase('aligning');
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
    return <ConsentScreen onAgree={() => setScreen('home')} />;
  }

  if (screen === 'home') {
    return (
      <HomeScreen
        videos={videos}
        onPressVideo={(video) => setPlayingVideo(video)}
        onCreateNew={() => {
          // Testing convenience: clears prior recordings so this list
          // doesn't grow indefinitely across repeated test runs - see
          // recordings.ts for the caveat about revisiting this for the
          // real product.
          clearAllRecordings();
          setVideos([]);
          setQuestionIndex(0);
          setPhase('aligning');
          setScreen('question');
        }}
      />
    );
  }

  if (screen === 'uploading') {
    return (
      <View style={{ flex: 1 }}>
        <UploadingScreen />
        <Pressable
          style={styles.skipLink}
          onPress={() => setScreen('complete')}
        >
          <Text style={styles.skipLinkText}>Skip for now</Text>
        </Pressable>
      </View>
    );
  }

  if (screen === 'complete') {
    return <CompletionScreen onDone={() => setScreen('home')} />;
  }

  // screen === 'question'
  const questionText = PLACEHOLDER_QUESTIONS[questionIndex] ?? '';
  const lockMode = questionIndex === 0 ? 'initial' : 'recheck';

  return (
    <View style={styles.questionScreenRoot}>
      <RecordingScreen
        questionNumber={questionIndex + 1}
        totalQuestions={TOTAL_QUESTIONS}
        questionText={questionText}
        isRecording={phase === 'recording'}
        elapsedSeconds={elapsedSeconds}
      >
        <CameraAlignment
          ref={cameraRef}
          lockMode={lockMode}
          resetToken={questionIndex}
          onLocked={() => setPhase('intro')}
          recordingActive={phase === 'recording' || phase === 'redo-prompt'}
          onRecordingFinished={handleRecordingFinished}
          onRecordingError={(error) => console.error('[recording]', error)}
        />

        {phase === 'intro' && (
          <QuestionIntroOverlay
            questionText={questionText}
            onFinishedSpeaking={() => setPhase('countdown')}
          />
        )}
        {phase === 'countdown' && (
          <CountdownOverlay
            onComplete={() => {
              cameraRef.current
                ?.startRecording()
                .catch((error) => console.error('[recording] start failed', error));
              setPhase('recording');
            }}
          />
        )}
        {phase === 'recording' && (
          <Pressable
            style={styles.finishAnswerButton}
            onPress={() => setPhase('redo-prompt')}
          >
            <Text style={styles.finishAnswerButtonText}>Finish Answer</Text>
          </Pressable>
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
  questionScreenRoot: {
    flex: 1,
  },
  finishAnswerButton: {
    position: 'absolute',
    bottom: 130,
    alignSelf: 'center',
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
  },
  finishAnswerButtonText: {
    ...typography.button,
    fontSize: 14,
    color: colors.accentText,
  },
  skipLink: {
    position: 'absolute',
    bottom: 60,
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  skipLinkText: {
    ...typography.caption,
    color: colors.textMuted,
    textDecorationLine: 'underline',
  },
});
