// Palette definitions for the on-device A/B switcher (theme/PaletteSwitcher.tsx).
// Per DECISIONS.md, the final accent colour is not locked - this is what
// makes trying a few live on a physical device possible without a rebuild.
//
// To add another swatch later: copy `paletteEmber` below, give it a new
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
  success: string;
  successSoft: string;
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
  // Reassurance/safety messaging (e.g. "nothing is recorded yet", "your
  // takes are safe") - a recurring green accent in the design mockup,
  // distinct from the brand accent and from the other semantic colors.
  success: '#4A7A5C',
  successSoft: '#EAF1EC',
};

// Neutral scales shared across the "Four new accents" set (design canvas,
// 2026-08-11 - "All four saturated, two cool two warm"). Only the accent
// hex was given per swatch; these neutrals are the same cool/warm families
// already proven out in Ember, reused rather than re-derived so a cool
// accent always sits on cool neutrals and vice versa.
const coolNeutrals = {
  background: '#FAF8F7',
  canvas: '#FCFBFA',
  surface: '#FFFFFF',
  border: '#F3F6F5',
  borderStrong: '#EDF0EF',
  text: '#1A2422',
  textMuted: '#4C5B58',
  textFaint: '#6B7876',
  textDisabled: '#8A9694',
};

const warmNeutrals = {
  background: '#FAF7F4',
  canvas: '#FCFAF7',
  surface: '#FFFFFF',
  border: '#F7F3EF',
  borderStrong: '#F5F1EC',
  text: '#221C18',
  textMuted: '#5C5049',
  textFaint: '#8A7A6E',
  textDisabled: '#C3B3A2',
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

// Sourced from "Screen Variants.dc.html" - the Hindi-led variant's accent,
// more saturated/warmer than terracotta. Brighter/bolder option.
export const paletteEmber: Palette = {
  id: 'ember',
  label: 'Ember (brighter, bolder)',
  colors: {
    ...warmNeutrals,
    accent: '#C25A34',
    accentStrong: '#9E421F',
    accentSoft: '#F3DECC',
    accentText: '#FFFFFF',
    ...sharedSemantic,
  },
  dark: { ...sharedDarkBase, accent: '#C25A34' },
};

// Bold · cool. "A true, saturated blue against warm cream - the strongest
// contrast in the set. Reads instantly as 'tap this' without any glare."
export const paletteCobalt: Palette = {
  id: 'cobalt',
  label: 'Cobalt (bold, cool)',
  colors: {
    ...coolNeutrals,
    accent: '#1F4FC4',
    accentStrong: '#183E99',
    accentSoft: '#E0E6F7',
    accentText: '#FFFFFF',
    ...sharedSemantic,
  },
  dark: { ...sharedDarkBase, accent: '#1F4FC4' },
};

// Bold · warm. "Clay pushed to full strength. Still an earth pigment, not a
// neon - carries the same warmth with three times the presence."
export const palettePaprika: Palette = {
  id: 'paprika',
  label: 'Paprika (bold, warm)',
  colors: {
    ...warmNeutrals,
    accent: '#B04424',
    accentStrong: '#89351C',
    accentSoft: '#F4E5E0',
    accentText: '#FFFFFF',
    ...sharedSemantic,
  },
  dark: { ...sharedDarkBase, accent: '#B04424' },
};

// Bold · cool. "A live, saturated green - nothing sage about it. Carries
// the 'recording/go' meaning the app already needs, at full strength."
export const paletteEmerald: Palette = {
  id: 'emerald',
  label: 'Emerald (bold, cool)',
  colors: {
    ...coolNeutrals,
    accent: '#0F7A5A',
    accentStrong: '#0C5F46',
    accentSoft: '#DDECE8',
    accentText: '#FFFFFF',
    ...sharedSemantic,
  },
  dark: { ...sharedDarkBase, accent: '#0F7A5A' },
};

// Bold · warm. "Full-strength berry. The most distinctive of the four and
// still deep enough to be comfortable on a phone at arm's length."
export const paletteRaspberry: Palette = {
  id: 'raspberry',
  label: 'Raspberry (bold, warm)',
  colors: {
    ...warmNeutrals,
    accent: '#B32B5E',
    accentStrong: '#8C2249',
    accentSoft: '#F4E1E8',
    accentText: '#FFFFFF',
    ...sharedSemantic,
  },
  dark: { ...sharedDarkBase, accent: '#B32B5E' },
};

export const PALETTES: Record<string, Palette> = {
  [paletteGreen.id]: paletteGreen,
  [paletteEmber.id]: paletteEmber,
  [paletteCobalt.id]: paletteCobalt,
  [palettePaprika.id]: palettePaprika,
  [paletteEmerald.id]: paletteEmerald,
  [paletteRaspberry.id]: paletteRaspberry,
};

export const DEFAULT_PALETTE_ID = paletteEmber.id;
