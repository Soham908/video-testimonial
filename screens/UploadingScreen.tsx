import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';

interface Props {
  // 0-1, or undefined for an indeterminate spinner (real progress will
  // come from the resumable/background upload client per CLAUDE.md -
  // react-native-background-upload or a tus-based client). Currently
  // driven by segment count (n of N uploaded), not upload bytes - plain
  // fetch doesn't expose byte-level progress, see upload.ts.
  progress?: number;
  // Present only when the upload sequence has failed - swaps the
  // progress/spinner view for an error message and a retry action.
  error?: string | null;
  onRetry?: () => void;
}

export function UploadingScreen({ progress, error, onRetry }: Props) {
  const percent =
    progress != null ? Math.round(Math.min(Math.max(progress, 0), 1) * 100) : null;

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Couldn't save your video</Text>
        <Text style={styles.subtitle}>{error}</Text>
        {onRetry && (
          <Pressable style={styles.retryButton} onPress={onRetry}>
            <Text style={styles.retryButtonText}>Try again</Text>
          </Pressable>
        )}
      </View>
    );
  }

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
  retryButton: {
    height: 58,
    borderWidth: 2,
    borderColor: colors.accent,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xl,
  },
  retryButtonText: {
    ...typography.button,
    fontSize: 17,
    color: colors.accent,
  },
});
