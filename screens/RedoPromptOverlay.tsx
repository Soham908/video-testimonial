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
        <Text style={styles.title}>Happy with this answer?</Text>
        <Text style={styles.body}>
          It looked like you moved out of frame partway through. You can
          keep this take or record it again.
        </Text>
        <Pressable style={styles.primaryButton} onPress={onKeep}>
          <Text style={styles.primaryButtonText}>Keep it — next question</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={onRedo}>
          <Text style={styles.secondaryButtonText}>Record this one again</Text>
        </Pressable>
        <Text style={styles.hint}>
          You can record again as many times as you like.
        </Text>
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
  hint: {
    ...typography.caption,
    color: colors.textFaint,
    textAlign: 'center',
    marginTop: spacing.md - 2,
  },
});
