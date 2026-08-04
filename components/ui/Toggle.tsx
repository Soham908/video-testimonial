import { Pressable, View, StyleSheet } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';

interface ToggleProps {
  value: boolean;
  onValueChange: (next: boolean) => void;
  /** Dark, translucent treatment for use over the camera/dark surfaces. */
  onDark?: boolean;
  disabled?: boolean;
}

// Matches the oval track + sliding knob toggle in the Camera Check mockup
// (used there for "Auto start", and reused for Review & Trim's
// remove-last-2-seconds toggle).
export function Toggle({ value, onValueChange, onDark, disabled }: ToggleProps) {
  const { colors } = useTheme();

  const trackColor = value
    ? colors.accent
    : onDark
      ? 'rgba(255,255,255,0.2)'
      : colors.border;
  const knobColor = onDark && !value ? 'rgba(255,255,255,0.7)' : onDark ? '#FFFFFF' : colors.surface;

  return (
    <Pressable
      onPress={() => !disabled && onValueChange(!value)}
      disabled={disabled}
      style={[styles.track, { backgroundColor: trackColor, opacity: disabled ? 0.5 : 1 }]}
    >
      <View style={[styles.knob, { backgroundColor: knobColor }, value && styles.knobOn]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: 44,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  knob: { width: 20, height: 20, borderRadius: 10 },
  knobOn: { alignSelf: 'flex-end' },
});
