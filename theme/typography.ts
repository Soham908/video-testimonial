import { FONT_FAMILIES, type FontId } from './fonts';

export interface Typography {
  title: { fontSize: number; fontWeight: '700'; fontFamily: string };
  subtitle: { fontSize: number; fontWeight: '400'; fontFamily: string };
  body: { fontSize: number; fontWeight: '400'; fontFamily: string };
  button: { fontSize: number; fontWeight: '700'; fontFamily: string };
  caption: { fontSize: number; fontWeight: '400'; fontFamily: string };
  label: { fontSize: number; fontWeight: '700'; fontFamily: string; letterSpacing: number };
}

// Sizes/weights are fixed; only fontFamily changes with the selected font.
export function makeTypography(fontId: FontId): Typography {
  const f = FONT_FAMILIES[fontId];
  return {
    title: { fontSize: 27, fontWeight: '700', fontFamily: f.bold },
    subtitle: { fontSize: 16, fontWeight: '400', fontFamily: f.regular },
    body: { fontSize: 16, fontWeight: '400', fontFamily: f.regular },
    button: { fontSize: 18, fontWeight: '700', fontFamily: f.bold },
    caption: { fontSize: 13, fontWeight: '400', fontFamily: f.regular },
    label: { fontSize: 12.5, fontWeight: '700', fontFamily: f.bold, letterSpacing: 1.5 },
  };
}
