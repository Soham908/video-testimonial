// Shared design tokens. Most screens use the warm/light "paper" palette;
// full-bleed camera screens (setup, recording, question intro) switch to
// the dark camera-mode palette instead - see `themeDark` below.
export const colors = {
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
  warning: '#B4832B',
  warningSoft: '#F6EEDD',
  processing: '#8A8474',
  processingSoft: '#F3F0E9',
  danger: '#E04F4F',
  dangerSoft: '#FBE9E9',
};

// Full-bleed camera screens (setup/recording/review) render over the live
// camera feed, so they need their own high-contrast-on-dark palette,
// independent of the light paper theme everywhere else.
export const themeDark = {
  background: '#1E211F',
  text: '#FFFFFF',
  textMuted: 'rgba(255,255,255,0.82)',
  textFaint: 'rgba(255,255,255,0.65)',
  chrome: 'rgba(0,0,0,0.55)',
  chromeStrong: 'rgba(0,0,0,0.78)',
  border: 'rgba(255,255,255,0.6)',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const radius = {
  sm: 8,
  md: 14,
  lg: 16,
  xl: 22,
  pill: 999,
};

export const typography = {
  title: { fontSize: 27, fontWeight: '700' as const, fontFamily: 'NotoSans_700Bold' },
  subtitle: { fontSize: 16, fontWeight: '400' as const, fontFamily: 'NotoSans_400Regular' },
  body: { fontSize: 16, fontWeight: '400' as const, fontFamily: 'NotoSans_400Regular' },
  button: { fontSize: 18, fontWeight: '700' as const, fontFamily: 'NotoSans_700Bold' },
  caption: { fontSize: 13, fontWeight: '400' as const, fontFamily: 'NotoSans_400Regular' },
  label: { fontSize: 12.5, fontWeight: '700' as const, fontFamily: 'NotoSans_700Bold', letterSpacing: 1.5 },
};
