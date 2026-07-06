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
// tested. Some pieces still stand in for logic that doesn't exist yet
// (TTS playback, real upload, mid-answer alignment-break detection) via
// clearly-labeled "(dev)" triggers - see FRAME_PROCESSOR_PROGRESS.md /
// commit messages for what's real vs. placeholder. Video recording itself
// is real (see CameraAlignment.tsx).
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
  function handleRecordingFinished(filePath: string) {
    setVideos((prev) => [
      ...prev,
      { id: `q${questionIndex}-${Date.now()}`, label: `Question ${questionIndex + 1}`, filePath },
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
          style={styles.devButton}
          onPress={() => setScreen('complete')}
        >
          <Text style={styles.devButtonText}>
            Skip (dev — stands in for real upload finishing)
          </Text>
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
            style={styles.devEndAnswerButton}
            onPress={() => setPhase('redo-prompt')}
          >
            <Text style={styles.devButtonText}>
              Finish answer (dev — stands in for real end-of-answer detection)
            </Text>
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
  devEndAnswerButton: {
    position: 'absolute',
    bottom: 120,
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  devButton: {
    position: 'absolute',
    bottom: 60,
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  devButtonText: {
    color: '#fff',
    fontSize: 13,
  },
});
