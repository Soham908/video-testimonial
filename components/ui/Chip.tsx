import { Pressable, Text, View, StyleSheet } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { containsDevanagari, devanagariFontFamily } from '../../theme/fonts';

interface ChipProps {
  label: string;
  onPress?: () => void;
  selected?: boolean;
  /** Dark, translucent treatment for use over the camera/dark surfaces. */
  onDark?: boolean;
  /** Stronger background contrast + heavier weight (RecordingScreen's prompts, which need to read clearly at a glance during a live take, not just be present). */
  emphasis?: boolean;
}

// The small pill used for Recording's on-screen prompts, Help's quick-tip
// chips, and similar "equal weight, glanceable" tag-style controls.
export function Chip({ label, onPress, selected, onDark, emphasis }: ChipProps) {
  const { colors, radius } = useTheme();

  const background = onDark
    ? emphasis
      ? 'rgba(0,0,0,0.55)'
      : 'rgba(255,255,255,0.16)'
    : selected
      ? colors.accentSoft
      : colors.canvas;
  const textColor = onDark ? '#FFFFFF' : selected ? colors.accent : colors.textMuted;

  const pillStyle = [
    styles.base,
    { backgroundColor: background, borderRadius: radius.pill },
    // A translucent-white fill (the plain onDark treatment) washes out
    // against a bright/plain background in the live camera feed - these
    // need to read reliably regardless of what's behind them, so pair the
    // darker fill (matches questionBubble/recIndicator's own dark-backing
    // treatment above) with a light border for definition on dark footage too.
    onDark && emphasis && styles.emphasisBorder,
  ];
  const content = (
    <Text
      style={[
        styles.label,
        { color: textColor },
        emphasis && styles.labelEmphasis,
        // Chip has no fontFamily of its own (relies on the platform default,
        // which doesn't reliably cover Devanagari either - see theme/fonts.ts).
        // Only RecordingScreen's talking-point prompts can actually be
        // Hindi/Marathi; Help's static English tips never match this.
        containsDevanagari(label) && { fontFamily: devanagariFontFamily(emphasis ? '800' : '600') },
      ]}
    >
      {label}
    </Text>
  );

  return onPress ? (
    <Pressable onPress={onPress} style={pillStyle}>
      {content}
    </Pressable>
  ) : (
    <View style={pillStyle}>{content}</View>
  );
}

const styles = StyleSheet.create({
  base: { paddingVertical: 10, paddingHorizontal: 15, alignSelf: 'flex-start' },
  label: { fontSize: 14.5, fontWeight: '600' },
  labelEmphasis: { fontWeight: '800' },
  emphasisBorder: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' },
});
