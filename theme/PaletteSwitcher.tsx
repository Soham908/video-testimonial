import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from './ThemeContext';
import { PALETTES } from './palettes';
import { FONT_LABELS, type FontId } from './fonts';

// Dev-only, on-device A/B switcher for the palette and font, neither of
// which is locked yet (see DECISIONS.md). __DEV__ is already false in any
// release build, so this self-removes with no separate flag to maintain.
// Rendered once, above <AppFlow/>, so it's reachable from every screen
// (including full-bleed camera screens) without navigating anywhere.
export function PaletteSwitcher() {
  if (!__DEV__) return null;
  return <PaletteSwitcherInner />;
}

function PaletteSwitcherInner() {
  const { paletteId, fontId, colors, setPaletteId, setFontId } = useTheme();
  const [expanded, setExpanded] = useState(false);

  if (!expanded) {
    return (
      <Pressable
        style={[styles.collapsedButton, { backgroundColor: colors.accent }]}
        onPress={() => setExpanded(true)}
        hitSlop={8}
      >
        <Text style={styles.collapsedButtonText}>🎨</Text>
      </Pressable>
    );
  }

  return (
    <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.panelHeader}>
        <Text style={[styles.panelTitle, { color: colors.text }]}>Theme (dev)</Text>
        <Pressable onPress={() => setExpanded(false)} hitSlop={8}>
          <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700' }}>Close</Text>
        </Pressable>
      </View>

      <Text style={[styles.sectionLabel, { color: colors.textFaint }]}>Palette</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.row}>
        {Object.values(PALETTES).map((p) => (
          <Pressable
            key={p.id}
            onPress={() => setPaletteId(p.id)}
            style={[
              styles.swatch,
              { backgroundColor: p.colors.accent, borderColor: colors.background },
              paletteId === p.id && { borderColor: colors.text },
            ]}
          />
        ))}
      </ScrollView>

      <Text style={[styles.sectionLabel, { color: colors.textFaint }]}>Font</Text>
      <View>
        {(Object.keys(FONT_LABELS) as FontId[]).map((id) => (
          <Pressable
            key={id}
            onPress={() => setFontId(id)}
            style={[
              styles.fontOption,
              { borderColor: colors.border },
              fontId === id && { borderColor: colors.accent, backgroundColor: colors.accentSoft },
            ]}
          >
            <Text style={{ color: colors.text, fontSize: 12 }}>{FONT_LABELS[id]}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  collapsedButton: {
    position: 'absolute',
    top: 52,
    right: 14,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  collapsedButtonText: { fontSize: 18 },
  panel: {
    position: 'absolute',
    top: 52,
    right: 14,
    width: 224,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    zIndex: 9999,
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  panelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  panelTitle: { fontSize: 13, fontWeight: '700' },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 12,
    marginBottom: 8,
  },
  row: { flexDirection: 'row' },
  swatch: { width: 28, height: 28, borderRadius: 14, marginRight: 8, borderWidth: 2 },
  fontOption: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1.5, marginBottom: 6 },
});
