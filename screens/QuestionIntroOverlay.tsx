import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';

interface Props {
  questionText: string;
  // Real version calls this automatically when TTS playback finishes (per
  // CLAUDE.md: question plays fully -> countdown -> recording, no
  // simultaneous playback+record). TTS isn't wired up yet, so this overlay
  // exposes a manual "Continue" button as a dev-only stand-in.
  onFinishedSpeaking: () => void;
}

export function QuestionIntroOverlay({
  questionText,
  onFinishedSpeaking,
}: Props) {
  return (
    <View style={styles.overlay}>
      <View style={styles.speakerBadge}>
        <Text style={styles.speakerIcon}>🔊</Text>
      </View>
      <Text style={styles.questionText}>{questionText}</Text>
      <Pressable style={styles.continueButton} onPress={onFinishedSpeaking}>
        <Text style={styles.continueButtonText}>Continue</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(11,11,15,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  speakerBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  speakerIcon: {
    fontSize: 24,
  },
  questionText: {
    ...typography.title,
    fontSize: 22,
    color: colors.text,
    textAlign: 'center',
    lineHeight: 30,
    marginBottom: spacing.xl,
  },
  continueButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  continueButtonText: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
