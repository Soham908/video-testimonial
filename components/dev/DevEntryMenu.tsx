import { Pressable, Text, View, StyleSheet } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';

interface DevEntryMenuProps {
  items: { label: string; onPress: () => void }[];
}

// Temporary dev-only stand-in for real WhatsApp-invite deep-linking, which
// isn't wired yet (see DECISIONS.md / the UI revamp plan). Lets the
// Splash / invite-open / identity-confirmation / onboarding screens stay
// reachable and reviewable on-device without faking a real deep link.
// __DEV__-gated at the call site - false, and this renders nothing, in any
// release build.
export function DevEntryMenu({ items }: DevEntryMenuProps) {
  const { colors, radius, spacing } = useTheme();
  return (
    <View style={[styles.wrap, { bottom: spacing.xl }]} pointerEvents="box-none">
      <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg }]}>
        <Text style={[styles.label, { color: colors.textFaint }]}>Dev entry (no deep-link wiring yet)</Text>
        {items.map((item) => (
          <Pressable key={item.label} onPress={item.onPress} style={styles.row}>
            <Text style={{ color: colors.accent, fontSize: 13, fontWeight: '700' }}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  panel: { borderWidth: 1, paddingVertical: 8, paddingHorizontal: 14, gap: 6 },
  label: { fontSize: 10, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 2 },
  row: { paddingVertical: 4 },
});
