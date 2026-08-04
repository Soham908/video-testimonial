import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Draws the accent-colored border used for the "active" question card. */
  emphasized?: boolean;
}

export function Card({ children, style, emphasized }: CardProps) {
  const { colors, radius, spacing } = useTheme();
  return (
    <View
      style={[
        styles.base,
        {
          backgroundColor: colors.surface,
          borderRadius: radius.xl,
          borderColor: emphasized ? colors.accent : colors.border,
          borderWidth: emphasized ? 1.5 : 1,
          padding: spacing.lg,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { flexDirection: 'column' },
});
