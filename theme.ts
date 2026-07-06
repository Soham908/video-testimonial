// Shared design tokens for a modern, minimal dark UI - consistent with the
// full-bleed camera screens, which are black-background by necessity.
export const colors = {
  background: '#0B0B0F',
  surface: '#17171D',
  border: 'rgba(255,255,255,0.12)',
  text: '#FFFFFF',
  textMuted: 'rgba(255,255,255,0.65)',
  accent: '#4ADE80',
  accentText: '#06210F',
  danger: '#F87171',
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
  lg: 24,
  pill: 999,
};

export const typography = {
  title: { fontSize: 28, fontWeight: '700' as const },
  subtitle: { fontSize: 16, fontWeight: '400' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  button: { fontSize: 16, fontWeight: '600' as const },
  caption: { fontSize: 13, fontWeight: '400' as const },
};
