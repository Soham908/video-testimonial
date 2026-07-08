import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';

interface Props {
  questionNumber: number;
  totalQuestions: number;
  questionText: string;
  // Real version calls this automatically when TTS playback finishes (per
  // CLAUDE.md: question plays fully -> countdown -> recording, no
  // simultaneous playback+record). TTS isn't wired up yet, so this overlay
  // exposes a manual "I'm ready" button as a dev-only stand-in.
  onFinishedSpeaking: () => void;
}

// Solid-green "breather" screen between takes (design screen 1f) - a full,
// opaque interstitial rather than a camera-feed overlay.
export function QuestionIntroOverlay({
  questionNumber,
  totalQuestions,
  questionText,
  onFinishedSpeaking,
}: Props) {
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
