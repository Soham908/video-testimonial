import { useEffect, useMemo, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import type { Spacing } from '../theme/spacing';
import type { Radius } from '../theme/radius';
import type { Typography } from '../theme/typography';
import { Chip } from '../components/ui/Chip';
import { containsDevanagari, devanagariFontFamily } from '../theme/fonts';
import { useStrings } from '../i18n/useStrings';

interface Props {
  questionNumber: number;
  totalQuestions: number;
  questionText: string;
  // The current question's talking_points (questions.ts), shown with equal
  // weight, never tap-to-advance (DECISIONS.md) - same source Question
  // Brief's "a good answer usually covers" section reads from, not a
  // separate paraphrased list.
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
// when swapping between check/recording chrome). Question text lives at the
// top (large/bold, needs to read at a glance and shouldn't get covered by
// the on-screen keyboard-height "I'm done answering" button); prompts +
// finish button stay stacked at the bottom as one wide, pressable-without-
// looking block. No "light" quality chip here (unlike the mockup) -
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
  const { t } = useStrings();
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
            <Text style={styles.nudgeText}>{t('recording.lengthNudge')}</Text>
          </View>
        )}
        <View style={styles.questionBubble}>
          <Text
            style={[styles.questionText, containsDevanagari(questionText) && { fontFamily: devanagariFontFamily('800') }]}
            numberOfLines={3}
          >
            {questionText}
          </Text>
        </View>
      </View>

      <View style={styles.bottomBlock} pointerEvents="box-none">
        {prompts.length > 0 && (
          <View style={styles.promptsRow}>
            {prompts.map((p) => (
              <Chip key={p} label={p} onDark emphasis />
            ))}
          </View>
        )}
        {isRecording && onFinishAnswer && (
          <Pressable style={styles.finishButton} onPress={onFinishAnswer}>
            <Text style={styles.finishButtonText}>{t('recording.finishAnswerButton')}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function makeStyles(spacing: Spacing, radius: Radius, typography: Typography) {
  return StyleSheet.create({
    container: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    topBar: { position: 'absolute', top: 18, left: spacing.md, right: spacing.md, gap: spacing.md },
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
    // More background + heavier weight than the recIndicator/progressBadge
    // pills above it - this is the thing being answered, not incidental
    // chrome, so it needs to read instantly against a live camera feed with
    // no dark bar behind it (unlike the old bottom-bar placement).
    questionBubble: {
      backgroundColor: 'rgba(0,0,0,0.45)',
      borderRadius: radius.lg,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
    },
    promptsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    questionText: {
      ...typography.title,
      fontSize: 22,
      fontWeight: '800',
      color: '#FFFFFF',
      lineHeight: 28,
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
