import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { radius, spacing, themeDark, typography } from '../theme';

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
  onFinishAnswer?: () => void;
}

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function RecordingDot() {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return <Animated.View style={[styles.recDot, { opacity }]} />;
}

export function RecordingScreen({
  children,
  questionNumber,
  totalQuestions,
  questionText,
  isRecording,
  elapsedSeconds,
  onFinishAnswer,
}: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.feed}>{children}</View>

      {isRecording && (
        <View style={styles.recIndicator}>
          <RecordingDot />
          <Text style={styles.recTimer}>{formatTime(elapsedSeconds)}</Text>
        </View>
      )}

      <View style={styles.progressBadge}>
        <Text style={styles.progressText}>
          {questionNumber} of {totalQuestions}
        </Text>
      </View>

      <View style={styles.questionBar}>
        <Text style={styles.questionText} numberOfLines={2}>
          {questionText}
        </Text>
        {isRecording && onFinishAnswer && (
          <Pressable style={styles.finishButton} onPress={onFinishAnswer}>
            <Text style={styles.finishButtonText}>I'm done answering</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: themeDark.background,
  },
  feed: {
    ...StyleSheet.absoluteFill,
  },
  recIndicator: {
    position: 'absolute',
    top: spacing.lg + spacing.sm,
    left: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: themeDark.chrome,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md - 1,
    paddingVertical: spacing.sm + 1,
  },
  recDot: {
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: '#E04F4F',
    marginRight: spacing.sm + 1,
  },
  recTimer: {
    ...typography.body,
    fontSize: 15,
    fontWeight: '700',
    color: themeDark.text,
    fontVariant: ['tabular-nums'],
  },
  progressBadge: {
    position: 'absolute',
    top: spacing.lg + spacing.sm,
    right: spacing.md,
    backgroundColor: themeDark.chrome,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md - 1,
    paddingVertical: spacing.sm + 1,
  },
  progressText: {
    ...typography.body,
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
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
    backgroundColor: themeDark.chromeStrong,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  questionText: {
    ...typography.body,
    fontSize: 19,
    fontWeight: '600',
    color: themeDark.text,
    lineHeight: 26,
  },
  finishButton: {
    marginTop: spacing.md + 2,
    height: 56,
    borderRadius: radius.lg - 1,
    backgroundColor: 'rgba(255,255,255,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  finishButtonText: {
    ...typography.button,
    fontSize: 17,
    color: '#1C2622',
  },
});
