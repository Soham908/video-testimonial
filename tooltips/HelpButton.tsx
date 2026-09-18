import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { useTooltipContext } from './TooltipContext';
import { ENABLE_ANCHORED_TOOLTIPS } from '../config';

interface Props {
  // Registry ids (tooltips/tooltipRegistry.ts) this button re-opens, in
  // order, when pressed - bypasses the "already seen" check, so it works
  // even for tips this device dismissed before.
  tooltipIds: string[];
  style?: StyleProp<ViewStyle>;
}

// Small circular "?" affordance - drop it on any screen that has anchored
// tooltips, pointed at whichever ids belong to that screen, so someone who
// dismissed them (or just wants a refresher) can bring them back on
// purpose. Renders nothing when ENABLE_ANCHORED_TOOLTIPS is off or the id
// list is empty, so it's always safe to leave in place.
export function HelpButton({ tooltipIds, style }: Props) {
  const { colors } = useTheme();
  const { replay } = useTooltipContext();

  if (!ENABLE_ANCHORED_TOOLTIPS || tooltipIds.length === 0) return null;

  return (
    <Pressable
      style={[styles.button, { backgroundColor: colors.accent }, style]}
      onPress={() => replay(tooltipIds)}
      hitSlop={8}
    >
      <Text style={styles.icon}>?</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  icon: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
});
