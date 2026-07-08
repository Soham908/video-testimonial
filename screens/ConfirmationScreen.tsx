import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';

interface Props {
  onDone: () => void;
  onRecordAnother: () => void;
}

// Post-upload confirmation (design screen 1k) - distinct from
// CompletionScreen's pre-save "all done" moment (1i).
export function ConfirmationScreen({ onDone, onRecordAnother }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.checkCircle}>
          <Text style={styles.checkmark}>✓</Text>
        </View>
        <Text style={styles.title}>Your video has been sent</Text>
        <Text style={styles.subtitle}>
          Thank you! Your company will review it. There is nothing more you
          need to do.
        </Text>
      </View>
      <Pressable style={styles.button} onPress={onDone}>
        <Text style={styles.buttonText}>Done</Text>
      </Pressable>
      <Pressable style={styles.secondaryButton} onPress={onRecordAnother}>
        <Text style={styles.secondaryButtonText}>
          Record for another product
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    padding: spacing.xl,
    paddingTop: spacing.xxl * 1.5,
    paddingBottom: spacing.xxl,
  },
  content: {
    flex: 1,
    alignItems: 'center',
  },
  checkCircle: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  checkmark: {
    fontSize: 40,
    fontWeight: '700',
    color: colors.accentText,
  },
  title: {
    ...typography.title,
    fontSize: 27,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 24,
  },
  button: {
    width: '100%',
    height: 60,
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    ...typography.button,
    color: colors.accentText,
  },
  secondaryButton: {
    width: '100%',
    height: 58,
    borderWidth: 2,
    borderColor: colors.accent,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md - 4,
  },
  secondaryButtonText: {
    ...typography.button,
    fontSize: 17,
    color: colors.accent,
  },
});
