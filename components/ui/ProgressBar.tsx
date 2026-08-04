import { View, StyleSheet } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';

interface ProgressBarProps {
  /** 0-1 */
  progress: number;
  /** Renders the fill inside a dark/accent-solid track, e.g. inside a primary button. */
  onSolid?: boolean;
}

export function ProgressBar({ progress, onSolid }: ProgressBarProps) {
  const { colors, radius } = useTheme();
  const clamped = Math.max(0, Math.min(1, progress));

  return (
    <View
      style={[
        styles.track,
        { backgroundColor: onSolid ? 'rgba(255,255,255,0.28)' : colors.canvas, borderRadius: radius.pill },
      ]}
    >
      <View
        style={[
          styles.fill,
          {
            width: `${clamped * 100}%`,
            backgroundColor: onSolid ? '#FFFFFF' : colors.accent,
            borderRadius: radius.pill,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 6, width: '100%', overflow: 'hidden' },
  fill: { height: '100%' },
});
