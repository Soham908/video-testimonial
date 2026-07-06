import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { WelcomeScreen } from './screens/WelcomeScreen';
import { ConsentScreen } from './screens/ConsentScreen';
import { HomeScreen, type RecordedVideo } from './screens/HomeScreen';
import { RecordingScreen } from './screens/RecordingScreen';
import { CameraAlignment } from './CameraAlignment';
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
// auto-starts -> (if alignment broke mid-answer) redo prompt -> next question.
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
// tested. Several pieces stand in for logic that doesn't exist yet (TTS
// playback, real recording, alignment-break detection, real upload) via
// clearly-labeled "(dev)" triggers - see FRAME_PROCESSOR_PROGRESS.md /
// commit messages for what's real vs. placeholder.
export function AppFlow() {
  const [screen, setScreen] = useState<Screen>('welcome');
  const [questionIndex, setQuestionIndex] = useState(0);
  const [phase, setPhase] = useState<QuestionPhase>('aligning');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  // Empty until real recording + storage exists - see HomeScreen.tsx.
  const [videos] = useState<RecordedVideo[]>([]);

  // Fake elapsed-time ticker while "recording" - stands in for real
  // recording duration until actual capture exists.
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
          lockMode={lockMode}
          resetToken={questionIndex}
          onLocked={() => setPhase('intro')}
        />

        {phase === 'intro' && (
          <QuestionIntroOverlay
            questionText={questionText}
            onFinishedSpeaking={() => setPhase('countdown')}
          />
        )}
        {phase === 'countdown' && (
          <CountdownOverlay onComplete={() => setPhase('recording')} />
        )}
        {phase === 'recording' && (
          <Pressable
            style={styles.devEndAnswerButton}
            onPress={() => setPhase('redo-prompt')}
          >
            <Text style={styles.devButtonText}>
              End answer (dev — stands in for real recording stop)
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
          onKeep={goToNextQuestion}
          onRedo={() => setPhase('countdown')}
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
