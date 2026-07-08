import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';

interface Props {
  onSave: () => void;
}

// "All done" moment (design screen 1i) - shown right after the 5th answer
// is finished, before saving/uploading starts.
export function CompletionScreen({ onSave }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.checkCircle}>
          <Text style={styles.checkmark}>✓</Text>
        </View>
        <Text style={styles.title}>All 5 answers done!</Text>
        <Text style={styles.subtitle}>
          Thank you. The hard part is finished.
        </Text>
      </View>
      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          Next, the app will save your video and send it to your company.
          Keep the app open for a moment.
        </Text>
      </View>
      <Pressable style={styles.button} onPress={onSave}>
        <Text style={styles.buttonText}>Save my video</Text>
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
    fontSize: 28,
    color: colors.text,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.subtitle,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 24,
  },
  infoBox: {
    width: '100%',
    padding: spacing.md,
    backgroundColor: colors.processingSoft,
    borderRadius: radius.lg,
    marginBottom: spacing.md,
  },
  infoText: {
    ...typography.body,
    fontSize: 14.5,
    color: colors.textMuted,
    lineHeight: 21,
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
});
