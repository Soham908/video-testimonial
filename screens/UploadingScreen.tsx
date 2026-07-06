import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../theme';

interface Props {
  // 0-1, or undefined for an indeterminate spinner (real progress will
  // come from the resumable/background upload client per CLAUDE.md -
  // react-native-background-upload or a tus-based client).
  progress?: number;
}

export function UploadingScreen({ progress }: Props) {
  const percent =
    progress != null ? Math.round(Math.min(Math.max(progress, 0), 1) * 100) : null;

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.accent} />
      <Text style={styles.title}>Uploading your video…</Text>
      {percent != null && <Text style={styles.percent}>{percent}%</Text>}
      <Text style={styles.subtitle}>
        You can leave the app running in the background — this will resume
        automatically if your connection drops.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  title: {
    ...typography.subtitle,
    color: colors.text,
    marginTop: spacing.lg,
  },
  percent: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.lg,
    lineHeight: 19,
  },
});
