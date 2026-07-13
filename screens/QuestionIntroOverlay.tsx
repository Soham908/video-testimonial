import { useVideoPlayer } from 'expo-video';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';

interface Props {
  questionNumber: number;
  totalQuestions: number;
  questionText: string;
  // Per CLAUDE.md: question VO plays fully -> countdown -> recording, no
  // simultaneous playback+record. This fires only from the "I'm ready"
  // button tap, not automatically when the VO finishes - the countdown
  // should never auto-start on playback end.
  onFinishedSpeaking: () => void;
}

// Pre-generated ElevenLabs VO, one static file per question - matches
// `questionNumber` (1-indexed). Static `require()` calls are required here
// so Metro can find and bundle each asset; a dynamic/templated require
// would not work.
const QUESTION_AUDIO: Record<number, number> = {
  1: require('../assets/audio/question1.mp3'),
  2: require('../assets/audio/question2.mp3'),
  3: require('../assets/audio/question3.mp3'),
  4: require('../assets/audio/question4.mp3'),
  5: require('../assets/audio/question5.mp3'),
};

// Solid-green "breather" screen between takes (design screen 1f) - a full,
// opaque interstitial rather than a camera-feed overlay.
export function QuestionIntroOverlay({
  questionNumber,
  totalQuestions,
  questionText,
  onFinishedSpeaking,
}: Props) {
  // This overlay is only ever mounted while `phase === 'intro'` (see
  // AppFlow.tsx) and unmounts as soon as the phase changes - so a fresh
  // player is created per question, autoplaying its matching VO once, and
  // is torn down (playback stops) the moment the user taps "I'm ready" or
  // otherwise leaves this phase. No visual output is needed for an
  // audio-only clip, so no `VideoView` is rendered.
  const player = useVideoPlayer(QUESTION_AUDIO[questionNumber], (p) => {
    p.play();
  });

  return (
    <View style={styles.overlay}>
      <Text style={styles.label}>
        QUESTION {questionNumber} OF {totalQuestions}
      </Text>
      <View style={styles.dots}>
        {Array.from({ length: totalQuestions }, (_, i) => (
          <View
            key={i}
            style={[styles.dot, i < questionNumber && styles.dotFilled]}
          />
        ))}
      </View>
      <Text style={styles.questionText}>{questionText}</Text>
      <Text style={styles.hint}>
        Speak naturally, like you're telling a friend. There are no wrong
        answers.
      </Text>
      <View style={styles.spacer} />
      <Pressable style={styles.button} onPress={onFinishedSpeaking}>
        <Text style={styles.buttonText}>I'm ready</Text>
      </Pressable>
      <Text style={styles.footer}>
        Recording starts after a 5-second countdown.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.accent,
    padding: spacing.xl,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xxl,
  },
  label: {
    ...typography.label,
    color: 'rgba(255,255,255,0.75)',
  },
  dots: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  dotFilled: {
    backgroundColor: '#FFFFFF',
  },
  questionText: {
    ...typography.title,
    fontSize: 30,
    color: '#FFFFFF',
    lineHeight: 38,
    marginTop: spacing.xxl + spacing.md,
  },
  hint: {
    ...typography.body,
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 24,
    marginTop: spacing.md,
  },
  spacer: {
    flex: 1,
  },
  button: {
    height: 60,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    ...typography.button,
    color: colors.accentStrong,
  },
  footer: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    marginTop: spacing.md,
  },
});
