import { Pressable, StyleSheet, Text, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  // Opt-in override for call sites that need a smaller label (e.g. two
  // buttons sharing one row with a longer label) - typography.button's
  // fixed 18px is otherwise the same for every Button in the app.
  textStyle?: StyleProp<TextStyle>;
}

// Covers the app's three recurring CTA treatments: a solid accent primary
// action, a bordered secondary action (e.g. "Rehearse" beside "Start
// recording"), and a quiet text-only escape hatch (e.g. "Skip anyway" -
// present but deliberately not styled as an equal option, per DECISIONS.md).
export function Button({ label, onPress, variant = 'primary', disabled, style, textStyle }: ButtonProps) {
  const { colors, spacing, radius, typography } = useTheme();

  const variantStyle =
    variant === 'primary'
      ? { backgroundColor: disabled ? colors.textDisabled : colors.accent }
      : variant === 'secondary'
        ? { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.border }
        : { backgroundColor: 'transparent' };

  const textColor =
    variant === 'primary' ? colors.accentText : variant === 'secondary' ? colors.text : colors.textMuted;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        variant === 'quiet' ? styles.quiet : styles.padded,
        { borderRadius: radius.lg, opacity: pressed ? 0.85 : 1 },
        variantStyle,
        style,
      ]}
    >
      <Text
        style={[
          typography.button,
          { color: textColor },
          variant === 'quiet' && { fontSize: 14.5, fontWeight: '600' },
          textStyle,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  padded: { paddingVertical: 16, paddingHorizontal: 20 },
  quiet: { paddingVertical: 8, paddingHorizontal: 8 },
});
