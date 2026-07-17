import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';

interface Props {
  questionNumber: number;
  onConfirm: () => void;
  onCancel: () => void;
}

// Shown from My Videos before entering the camera flow at all - styled to
// match RedoPromptOverlay's bottom-sheet pattern for visual/interaction
// consistency with the other keep/redo-style decision in this app.
export function RetakeConfirmOverlay({ questionNumber, onConfirm, onCancel }: Props) {
  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
        <Text style={styles.title}>Record again for Question {questionNumber}?</Text>
        <Text style={styles.body}>
          Your current answer will be replaced.
        </Text>
        <Pressable style={styles.primaryButton} onPress={onConfirm}>
          <Text style={styles.primaryButtonText}>Yes, record again</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={onCancel}>
          <Text style={styles.secondaryButtonText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  card: {
    width: '100%',
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  title: {
    ...typography.title,
    fontSize: 22,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  body: {
    ...typography.body,
    color: colors.textMuted,
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  primaryButton: {
    height: 60,
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md - 4,
  },
  primaryButtonText: {
    ...typography.button,
    color: colors.accentText,
  },
  secondaryButton: {
    height: 58,
    borderWidth: 2,
    borderColor: colors.accent,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  secondaryButtonText: {
    ...typography.button,
    fontSize: 17,
    color: colors.accent,
  },
});
