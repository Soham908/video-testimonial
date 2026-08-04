import { useState } from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';

interface DropdownProps {
  title: string;
  children: React.ReactNode;
  /** Optional subtitle shown under the title when collapsed. */
  subtitle?: string;
}

// The collapsible row style used for "Nervous on camera?" and similar
// tap-to-expand prep content on Question Brief.
export function Dropdown({ title, children, subtitle }: DropdownProps) {
  const { colors, radius, spacing, typography } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden' }}>
      <Pressable
        style={[styles.header, { padding: spacing.md }]}
        onPress={() => setOpen((v) => !v)}
      >
        <View style={{ flex: 1 }}>
          <Text style={[typography.body, { fontWeight: '700', color: colors.text }]}>{title}</Text>
          {subtitle && !open && (
            <Text style={[typography.caption, { color: colors.textFaint, marginTop: 2 }]}>{subtitle}</Text>
          )}
        </View>
        <Text style={{ color: colors.accent, fontSize: 16 }}>{open ? '⌃' : '⌄'}</Text>
      </Pressable>
      {open && (
        <View style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.md }}>{children}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
