import { useEffect, useMemo, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import type { Spacing } from '../theme/spacing';
import type { Radius } from '../theme/radius';
import type { Typography } from '../theme/typography';
import { Chip } from '../components/ui/Chip';

interface Props {
  questionNumber: number;
  totalQuestions: number;
  questionText: string;
  // 2-3 words each, shown with equal weight, never tap-to-advance
  // (DECISIONS.md) - a short paraphrase of Question Brief's talking points.
  prompts: string[];
  isRecording: boolean;
  elapsedSeconds: number;
  onFinishAnswer?: () => void;
}

const LENGTH_NUDGE_AT_SECONDS = 45;

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function RecordingDot({ style }: { style: object }) {
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

  return <Animated.View style={[style, { opacity }]} />;
}

// Chrome-only overlay, rendered as a SIBLING of <CameraAlignment/> (see
// CameraCheckScreen's comment for why - CameraAlignment must not remount
// when swapping between check/recording chrome). Everything stacked at the
// bottom (design 3D) - one wide button pressable without looking; question,
// prompts and button read as a single block, the timer/nudge stay out of
// the way at the top. No "light" quality chip here (unlike the mockup) -
// brightness detection was never built, and a fake indicator would be
// worse than none (see DECISIONS.md).
export function RecordingScreen({
  questionNumber,
  totalQuestions,
  questionText,
  prompts,
  isRecording,
  elapsedSeconds,
  onFinishAnswer,
}: Props) {
  const { spacing, radius, typography } = useTheme();
  const styles = useMemo(() => makeStyles(spacing, radius, typography), [spacing, radius, typography]);
  const showNudge = isRecording && elapsedSeconds >= LENGTH_NUDGE_AT_SECONDS;

  return (
    <View style={styles.container} pointerEvents="box-none">
      <View style={styles.topBar} pointerEvents="none">
        <View style={styles.topRow}>
          {isRecording && (
            <View style={styles.recIndicator}>
              <RecordingDot style={styles.recDot} />
              <Text style={styles.recTimer}>{formatTime(elapsedSeconds)}</Text>
            </View>
          )}
          <View style={styles.progressBadge}>
            <Text style={styles.progressText}>
              {questionNumber} of {totalQuestions}
            </Text>
          </View>
        </View>
        {showNudge && (
          <View style={styles.nudgePill}>
            <Text style={styles.nudgeText}>That's a good length — start wrapping up</Text>
          </View>
        )}
      </View>

      <View style={styles.bottomBlock} pointerEvents="box-none">
        <View style={styles.promptsRow}>
          {prompts.map((p) => (
            <Chip key={p} label={p} onDark />
          ))}
        </View>
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

function makeStyles(spacing: Spacing, radius: Radius, typography: Typography) {
  return StyleSheet.create({
    container: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    topBar: { position: 'absolute', top: 18, left: spacing.md, right: spacing.md, gap: spacing.sm },
    topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    recIndicator: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(0,0,0,0.4)',
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md - 1,
      paddingVertical: spacing.sm + 1,
    },
    recDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#D8674A', marginRight: spacing.sm },
    recTimer: { fontSize: 15, fontWeight: '700', color: '#FFFFFF', fontVariant: ['tabular-nums'] },
    progressBadge: {
      backgroundColor: 'rgba(255,255,255,0.14)',
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md - 1,
      paddingVertical: spacing.sm + 1,
    },
    progressText: { fontSize: 12.5, fontWeight: '600', color: 'rgba(255,255,255,0.9)' },
    nudgePill: {
      alignSelf: 'center',
      backgroundColor: 'rgba(255,255,255,0.92)',
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
    },
    nudgeText: { fontSize: 15, fontWeight: '600', color: '#241E1A' },
    bottomBlock: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      // Extra bottom padding approximates safe-area/gesture-nav clearance
      // without adding react-native-safe-area-context (a new native dep).
      paddingBottom: spacing.xl,
      gap: spacing.md,
    },
    promptsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    questionText: {
      ...typography.body,
      fontSize: 19,
      fontWeight: '600',
      color: '#FFFFFF',
      lineHeight: 26,
      textAlign: 'center',
    },
    finishButton: {
      height: 58,
      borderRadius: radius.xl - 4,
      backgroundColor: '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
    },
    finishButtonText: { ...typography.button, fontSize: 17, color: '#241E1A' },
  });
}
