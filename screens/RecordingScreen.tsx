import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../theme';

interface Props {
  // The live camera feed (+ alignment guide overlay) slots in here once
  // wired up - kept as children so this layout doesn't depend on the
  // camera/CV integration files directly.
  children?: ReactNode;
  questionNumber: number;
  totalQuestions: number;
  questionText: string;
  isRecording: boolean;
  elapsedSeconds: number;
}

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function RecordingScreen({
  children,
  questionNumber,
  totalQuestions,
  questionText,
  isRecording,
  elapsedSeconds,
}: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.feed}>{children}</View>

      {isRecording && (
        <View style={styles.recIndicator}>
          <View style={styles.recDot} />
          <Text style={styles.recTimer}>{formatTime(elapsedSeconds)}</Text>
        </View>
      )}

      <View style={styles.progressBadge}>
        <Text style={styles.progressText}>
          Question {questionNumber} of {totalQuestions}
        </Text>
      </View>

      <View style={styles.questionBar}>
        <Text style={styles.questionText} numberOfLines={2}>
          {questionText}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  feed: {
    ...StyleSheet.absoluteFill,
  },
  recIndicator: {
    position: 'absolute',
    top: spacing.lg,
    left: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 20,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
  },
  recDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.danger,
    marginRight: spacing.xs,
  },
  recTimer: {
    ...typography.caption,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  progressBadge: {
    position: 'absolute',
    top: spacing.lg,
    right: spacing.lg,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 20,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
  },
  progressText: {
    ...typography.caption,
    color: colors.text,
  },
  questionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    // Fixed-height bar - questionText needs a hard character cap upstream
    // (unresolved in CLAUDE.md's open items) so it never wraps past 2 lines.
    // Extra bottom padding approximates safe-area/gesture-nav clearance
    // without adding react-native-safe-area-context (a new native dep) -
    // revisit with real safe-area insets if this doesn't hold up across
    // devices.
    minHeight: 96,
    backgroundColor: 'rgba(0,0,0,0.78)',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  questionText: {
    ...typography.subtitle,
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    lineHeight: 24,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
