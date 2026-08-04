import { Pressable, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';

interface ChipProps {
  label: string;
  onPress?: () => void;
  selected?: boolean;
  /** Dark, translucent treatment for use over the camera/dark surfaces. */
  onDark?: boolean;
}

// The small pill used for Recording's on-screen prompts, Help's quick-tip
// chips, and similar "equal weight, glanceable" tag-style controls.
export function Chip({ label, onPress, selected, onDark }: ChipProps) {
  const { colors, radius } = useTheme();

  const background = onDark
    ? 'rgba(255,255,255,0.16)'
    : selected
      ? colors.accentSoft
      : colors.canvas;
  const textColor = onDark ? '#FFFFFF' : selected ? colors.accent : colors.textMuted;

  const Wrapper = onPress ? Pressable : Text;
  return (
    <Wrapper
      onPress={onPress}
      style={
        onPress
          ? [styles.base, { backgroundColor: background, borderRadius: radius.pill }]
          : undefined
      }
    >
      {onPress ? (
        <Text style={[styles.label, { color: textColor }]}>{label}</Text>
      ) : (
        label
      )}
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  base: { paddingVertical: 10, paddingHorizontal: 15, alignSelf: 'flex-start' },
  label: { fontSize: 14.5, fontWeight: '600' },
});
