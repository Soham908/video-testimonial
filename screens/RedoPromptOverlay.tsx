import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';

interface Props {
  onKeep: () => void;
  onRedo: () => void;
}

// Per CLAUDE.md: if alignment breaks badly mid-answer, flag that segment
// for a post-answer "redo this one?" prompt rather than interrupting live.
export function RedoPromptOverlay({ onKeep, onRedo }: Props) {
  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
        <Text style={styles.title}>Redo this answer?</Text>
        <Text style={styles.body}>
          It looked like you moved out of frame partway through. You can
          keep this take or record it again.
        </Text>
        <Pressable style={styles.primaryButton} onPress={onRedo}>
          <Text style={styles.primaryButtonText}>Redo answer</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={onKeep}>
          <Text style={styles.secondaryButtonText}>Keep this take</Text>
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
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  title: {
    ...typography.title,
    fontSize: 20,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  body: {
    ...typography.body,
    color: colors.textMuted,
    lineHeight: 21,
    marginBottom: spacing.lg,
  },
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  primaryButtonText: {
    ...typography.button,
    color: colors.accentText,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  secondaryButtonText: {
    ...typography.button,
    color: colors.text,
  },
});
