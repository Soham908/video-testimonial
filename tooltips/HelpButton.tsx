import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { useStrings } from '../i18n/useStrings';
import { useTooltipContext } from './TooltipContext';
import { ENABLE_ANCHORED_TOOLTIPS } from '../config';
interface Props { tourId: string; tooltipIds: readonly string[]; style?: StyleProp<ViewStyle>; onReplay?: () => void; }
export function HelpButton({ tourId, tooltipIds, style, onReplay }: Props) {
  const { colors } = useTheme();
  const { t } = useStrings();
  const { startTour } = useTooltipContext();
  if (!ENABLE_ANCHORED_TOOLTIPS || !tooltipIds.length) return null;
  return (
    <Pressable hitSlop={6} accessibilityRole="button" accessibilityLabel={t('tooltips.replayButton')} style={[styles.button, { backgroundColor: colors.accentSoft }, style]} onPress={() => { onReplay?.(); startTour(tourId, tooltipIds, true); }}>
      <Text style={[styles.icon, { color: colors.accent }]}>?</Text>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  button: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  icon: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
});
