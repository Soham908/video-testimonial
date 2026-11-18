import { Animated, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { useStrings } from '../i18n/useStrings';
import { containsDevanagari, devanagariFontFamily } from '../theme/fonts';
import { useMilestoneMotion } from '../useMilestoneMotion';
import type { SavedFeedback } from '../completionFeedback';

function Checkmark({ motion, size, backgroundColor, color, style }: { motion: Animated.Value; size: number; backgroundColor: string; color: string; style?: StyleProp<ViewStyle> }) {
  return <Animated.View accessible={false} pointerEvents="none" style={[{
    width: size, height: size, borderRadius: size / 2, backgroundColor, alignItems: 'center', justifyContent: 'center',
    opacity: motion.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1] }),
    transform: [{ scale: motion.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }],
  }, style]}><Text style={{ color, fontSize: size * 0.43, fontWeight: '700' }}>✓</Text></Animated.View>;
}

export function CompletionCheckmark({ eventId, size = 104, style }: { eventId?: number; size?: number; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const motion = useMilestoneMotion(eventId);
  return <Checkmark motion={motion} size={size} color={colors.accentText} backgroundColor={colors.accent} style={style} />;
}

interface Props {
  feedback?: SavedFeedback;
  completed: number;
  total: number;
  allSaved?: boolean;
  dark?: boolean;
  card?: boolean;
  onDismiss?: () => void;
  compact?: boolean;
}

export function CompletionFeedback({ feedback, completed, total, allSaved = false, dark = false, card = false, onDismiss, compact = false }: Props) {
  const { colors, radius, typography } = useTheme();
  const { t } = useStrings();
  const motion = useMilestoneMotion(feedback?.id, feedback?.animation);
  const kind = allSaved ? 'allSaved' : feedback?.kind ?? 'saved';
  const title = t(`feedback.${kind}Title`);
  const body = t(kind === 'allSaved' ? 'feedback.allSavedBody' : 'feedback.savedBody');
  const count = Math.max(0, Math.min(completed, total));
  const label = t(total === 1 ? 'feedback.savedCountSingular' : 'feedback.savedCount', { completed: count, total });
  const from = total > 0 ? Math.max(0, Math.min(feedback?.previousCompleted ?? count, count)) / total : 0;
  const to = total > 0 ? count / total : 0;
  const fill = Animated.add(from, Animated.multiply(motion, to - from));
  const text = dark ? '#FFFFFF' : colors.text;
  const muted = dark ? 'rgba(255,255,255,0.78)' : colors.textMuted;
  const accent = dark ? '#C9A184' : colors.success;
  const font = (value: string, weight = '400') => containsDevanagari(value) ? { fontFamily: devanagariFontFamily(weight) } : undefined;
  return <View style={[styles.content, card && { alignSelf: 'stretch', padding: 16, borderRadius: radius.lg, backgroundColor: colors.successSoft }]}>
    <View style={styles.heading}>
      <Checkmark motion={motion} size={compact ? 26 : 40} color={accent} backgroundColor={dark ? 'rgba(255,255,255,0.12)' : colors.successSoft} />
      <Text accessibilityRole="header" style={[typography.title, { color: text, fontSize: compact ? 16 : 22, flex: 1 }, font(title, '700')]}>{title}</Text>
      {onDismiss && <Pressable accessibilityRole="button" accessibilityLabel={t('feedback.dismiss')} onPress={onDismiss} style={styles.dismiss}><Text style={{ color: muted, fontSize: 24 }}>×</Text></Pressable>}
    </View>
    <Text style={[typography.body, { color: muted, fontSize: compact ? 12.5 : typography.body.fontSize, lineHeight: compact ? 18 : 23 }, font(body)]}>{body}</Text>
    <Text accessibilityLiveRegion="polite" style={[typography.caption, { color: text, fontSize: compact ? 12 : 14, fontWeight: '600' }, font(label, '600')]}>{label}</Text>
    <View accessible accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: total, now: count, text: label }} style={[styles.track, { backgroundColor: dark ? 'rgba(255,255,255,0.16)' : colors.borderStrong }]}>
      <Animated.View style={[styles.fill, { backgroundColor: accent, transform: [{ scaleX: fill }], transformOrigin: 'left center' }]} />
    </View>
  </View>;
}
const styles = StyleSheet.create({
  content: { gap: 12 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dismiss: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  track: { height: 6, width: '100%', borderRadius: 3, overflow: 'hidden' },
  fill: { position: 'absolute', top: 0, bottom: 0, left: 0, width: '100%', borderRadius: 3 },
});
