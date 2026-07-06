import { useState } from 'react';
import { View } from 'react-native';
import { WelcomeScreen } from './screens/WelcomeScreen';
import { ConsentScreen } from './screens/ConsentScreen';
import { RecordingScreen } from './screens/RecordingScreen';
import { CompletionScreen } from './screens/CompletionScreen';
import { colors } from './theme';

// Lightweight state-based flow - no navigation library added yet, so this
// doesn't require any new native dependencies/rebuild. Swap for
// React Navigation later if the flow grows more complex (e.g. back
// gestures, deep links).
type Screen = 'welcome' | 'consent' | 'recording' | 'complete';

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
// tested. Wiring RecordingScreen up to the real <Camera> + alignment
// overlay is the next integration step once that feature branch lands.
export function AppFlow() {
  const [screen, setScreen] = useState<Screen>('welcome');
  const [questionIndex, setQuestionIndex] = useState(0);

  if (screen === 'welcome') {
    return <WelcomeScreen onGetStarted={() => setScreen('consent')} />;
  }

  if (screen === 'consent') {
    return <ConsentScreen onAgree={() => setScreen('recording')} />;
  }

  if (screen === 'recording') {
    // Advancing questions/finishing isn't wired to any real action yet -
    // no TTS/countdown/recording logic exists here, this is layout only.
    return (
      <RecordingScreen
        questionNumber={questionIndex + 1}
        totalQuestions={TOTAL_QUESTIONS}
        questionText={PLACEHOLDER_QUESTIONS[questionIndex] ?? ''}
        isRecording={false}
        elapsedSeconds={0}
      >
        <View style={{ flex: 1, backgroundColor: colors.background }} />
      </RecordingScreen>
    );
  }

  return <CompletionScreen onDone={() => setScreen('welcome')} />;
}
