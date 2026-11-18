import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PALETTES, DEFAULT_PALETTE_ID, type Palette, type PaletteColors, type PaletteDarkColors } from './palettes';
import { DEFAULT_FONT_ID, type FontId } from './fonts';
import { makeTypography, type Typography } from './typography';
import { spacing, type Spacing } from './spacing';
import { radius, type Radius } from './radius';

// Same persistence mechanism auth.ts already uses for the JWT - no new
// dependency for saving the user's palette/font pick across launches.
const PALETTE_KEY = 'theme_palette_id';
const FONT_KEY = 'theme_font_id';

interface ThemeContextValue {
  paletteId: string;
  fontId: FontId;
  colors: PaletteColors;
  themeDark: PaletteDarkColors;
  typography: Typography;
  spacing: Spacing;
  radius: Radius;
  setPaletteId: (id: string) => void;
  setFontId: (id: FontId) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const pageSpacing = useMemo(() => ({
    ...spacing,
    // Existing screens use xl + topExtra; keep their content below the
    // status band even on a notched iPhone, without changing camera size.
    topExtra: Math.max(spacing.topExtra, insets.top + spacing.edgeGap + spacing.md - spacing.xl),
  }), [insets.top]);
  const [paletteId, setPaletteIdState] = useState(DEFAULT_PALETTE_ID);
  const [fontId, setFontIdState] = useState<FontId>(DEFAULT_FONT_ID);

  // Restore a previously chosen palette/font once on launch - silently
  // falls back to the defaults above if nothing was ever saved, or if a
  // stored id no longer matches a known palette (e.g. a placeholder that
  // got removed).
  useEffect(() => {
    (async () => {
      const [storedPalette, storedFont] = await Promise.all([
        SecureStore.getItemAsync(PALETTE_KEY),
        SecureStore.getItemAsync(FONT_KEY),
      ]);
      // Production always uses the approved green brand, including upgrades
      // from a development install that saved a different trial palette.
      if (__DEV__ && storedPalette && PALETTES[storedPalette]) setPaletteIdState(storedPalette);
      if (storedFont === 'notoSans' || storedFont === 'plusJakartaSans') {
        setFontIdState(storedFont);
      }
    })();
  }, []);

  function setPaletteId(id: string) {
    setPaletteIdState(id);
    SecureStore.setItemAsync(PALETTE_KEY, id).catch(() => {});
  }

  function setFontId(id: FontId) {
    setFontIdState(id);
    SecureStore.setItemAsync(FONT_KEY, id).catch(() => {});
  }

  const palette: Palette = PALETTES[paletteId] ?? PALETTES[DEFAULT_PALETTE_ID];
  const typography = useMemo(() => makeTypography(fontId), [fontId]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      paletteId,
      fontId,
      colors: palette.colors,
      themeDark: palette.dark,
      typography,
      spacing: pageSpacing,
      radius,
      setPaletteId,
      setFontId,
    }),
    [paletteId, fontId, palette, typography, pageSpacing],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme() must be used within a ThemeProvider');
  return ctx;
}
