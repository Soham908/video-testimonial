import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';

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
      <Text style={styles.title}>Saving your video…</Text>
      {percent != null ? (
        <>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${percent}%` }]} />
          </View>
          <Text style={styles.progressLabel}>{percent}% saved</Text>
        </>
      ) : (
        <ActivityIndicator
          size="large"
          color={colors.accent}
          style={styles.spinner}
        />
      )}
      <Text style={styles.subtitle}>
        You can set your phone down or lock it — saving continues on its
        own. We'll let you know when it's done.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  title: {
    ...typography.title,
    fontSize: 27,
    color: colors.text,
  },
  progressTrack: {
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.canvas,
    overflow: 'hidden',
    marginTop: spacing.lg,
  },
  progressFill: {
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  progressLabel: {
    ...typography.body,
    fontSize: 15,
    fontWeight: '600',
    color: colors.textFaint,
    marginTop: spacing.sm + 4,
  },
  spinner: {
    marginTop: spacing.lg,
    alignSelf: 'flex-start',
  },
  subtitle: {
    ...typography.body,
    color: colors.textMuted,
    lineHeight: 26,
    marginTop: spacing.xl + spacing.xs,
  },
});
