import { Pressable, Text, View, StyleSheet } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';

interface ListRowProps {
  title: string;
  subtitle?: string;
  onPress?: () => void;
  trailing?: React.ReactNode;
  leading?: React.ReactNode;
}

// Generic row used across My Videos' per-question list, Profile's settings
// rows, and similar "title, subtitle, optional trailing control" layouts.
export function ListRow({ title, subtitle, onPress, trailing, leading }: ListRowProps) {
  const { colors, radius, spacing, typography } = useTheme();
  const Wrapper = onPress ? Pressable : View;

  return (
    <Wrapper
      onPress={onPress}
      style={({ pressed }: any) => [
        styles.row,
        {
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
          padding: spacing.md,
          opacity: onPress && pressed ? 0.85 : 1,
        },
      ]}
    >
      {leading}
      <View style={styles.textCol}>
        <Text style={[typography.body, { fontWeight: '700', color: colors.text }]}>{title}</Text>
        {subtitle && (
          <Text style={[typography.caption, { color: colors.textFaint, marginTop: 3 }]}>{subtitle}</Text>
        )}
      </View>
      {trailing}
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  textCol: { flex: 1, gap: 2 },
});
