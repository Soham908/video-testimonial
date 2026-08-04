// Palette definitions for the on-device A/B switcher (theme/PaletteSwitcher.tsx).
// Per DECISIONS.md, the final accent colour is not locked - this is what
// makes trying a few live on a physical device possible without a rebuild.
//
// To add another swatch later: copy `paletteTerracotta` below, give it a new
// `id`/`label`, adjust the color values, and add it to `PALETTES`. No other
// file needs to change - the switcher and ThemeContext both read from
// `PALETTES`.

export interface PaletteColors {
  background: string;
  canvas: string;
  surface: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textFaint: string;
  textDisabled: string;
  accent: string;
  accentStrong: string;
  accentSoft: string;
  accentText: string;
  warning: string;
  warningSoft: string;
  processing: string;
  processingSoft: string;
  danger: string;
  dangerSoft: string;
}

// Full-bleed camera-mode palette (setup/recording/review render over the
// live camera feed, so they need a high-contrast-on-dark set independent of
// the light "paper" theme everywhere else).
export interface PaletteDarkColors {
  background: string;
  text: string;
  textMuted: string;
  textFaint: string;
  chrome: string;
  chromeStrong: string;
  border: string;
  accent: string;
}

export interface Palette {
  id: string;
  label: string;
  colors: PaletteColors;
  dark: PaletteDarkColors;
}

// Warning/processing/danger are semantic, not brand - kept constant across
// palettes so a swatch swap doesn't also silently redefine what "error"
// looks like.
const sharedSemantic = {
  warning: '#B4832B',
  warningSoft: '#F6EEDD',
  processing: '#8A8474',
  processingSoft: '#F3F0E9',
  danger: '#E04F4F',
  dangerSoft: '#FBE9E9',
};

const sharedDarkBase = {
  background: '#1E211F',
  text: '#FFFFFF',
  textMuted: 'rgba(255,255,255,0.82)',
  textFaint: 'rgba(255,255,255,0.65)',
  chrome: 'rgba(0,0,0,0.55)',
  chromeStrong: 'rgba(0,0,0,0.78)',
  border: 'rgba(255,255,255,0.6)',
};

// The original palette, kept as a real option rather than deleted outright.
export const paletteGreen: Palette = {
  id: 'green',
  label: 'Green (original)',
  colors: {
    background: '#FBF9F5',
    canvas: '#F0EEE9',
    surface: '#FFFFFF',
    border: '#E3DED4',
    borderStrong: '#E8E4DC',
    text: '#1C2622',
    textMuted: '#454F4A',
    textFaint: '#5C6963',
    textDisabled: '#8A9490',
    accent: '#1E7A5A',
    accentStrong: '#155C44',
    accentSoft: '#EDF5F1',
    accentText: '#FFFFFF',
    ...sharedSemantic,
  },
  dark: { ...sharedDarkBase, accent: '#1E7A5A' },
};

// Default - sourced from the "Testimonial App EN.dc.html" mockup export.
export const paletteTerracotta: Palette = {
  id: 'terracotta',
  label: 'Terracotta (new mockup)',
  colors: {
    background: '#EDE8E0',
    canvas: '#F8F5F0',
    surface: '#FFFFFF',
    border: '#E2DBD0',
    borderStrong: '#D8D0C4',
    text: '#241E1A',
    textMuted: '#5E544C',
    textFaint: '#8C837A',
    textDisabled: '#B5AB9F',
    accent: '#A85E3A',
    accentStrong: '#874929',
    accentSoft: '#F0E4D8',
    accentText: '#FFFFFF',
    ...sharedSemantic,
  },
  dark: { ...sharedDarkBase, accent: '#A85E3A' },
};

export const PALETTES: Record<string, Palette> = {
  [paletteGreen.id]: paletteGreen,
  [paletteTerracotta.id]: paletteTerracotta,
};

export const DEFAULT_PALETTE_ID = paletteTerracotta.id;
