// Font is deliberately decoupled from palette - per DECISIONS.md it isn't a
// hard requirement, just another thing worth A/B-ing on-device.

export type FontId = 'notoSans' | 'plusJakartaSans';

interface FontFamilies {
  regular: string;
  medium: string;
  semiBold: string;
  bold: string;
}

// Family strings must match the weights loaded via useFonts() in App.tsx.
export const FONT_FAMILIES: Record<FontId, FontFamilies> = {
  notoSans: {
    regular: 'NotoSans_400Regular',
    medium: 'NotoSans_500Medium',
    semiBold: 'NotoSans_600SemiBold',
    bold: 'NotoSans_700Bold',
  },
  plusJakartaSans: {
    regular: 'PlusJakartaSans_400Regular',
    medium: 'PlusJakartaSans_500Medium',
    semiBold: 'PlusJakartaSans_600SemiBold',
    bold: 'PlusJakartaSans_700Bold',
  },
};

export const FONT_LABELS: Record<FontId, string> = {
  notoSans: 'Noto Sans (original)',
  plusJakartaSans: 'Plus Jakarta Sans (new mockup)',
};

export const DEFAULT_FONT_ID: FontId = 'plusJakartaSans';

// Neither UI-chrome family above covers Devanagari script (Hindi/Marathi) -
// "Noto Sans" and "Plus Jakarta Sans" are both Latin/Cyrillic/Greek-only
// Google Fonts families; "Noto Sans Devanagari" is a wholly separate
// package (@expo-google-fonts/noto-sans-devanagari, loaded in App.tsx).
// Only question text and talking points can actually contain this script -
// everything else in the app is static English UI copy (i18n/strings.en.json)
// - so this is applied per-Text at the handful of call sites that render
// that backend-localized content, not swapped in globally.
const DEVANAGARI_FONT_FAMILY: FontFamilies = {
  regular: 'NotoSansDevanagari_400Regular',
  medium: 'NotoSansDevanagari_500Medium',
  semiBold: 'NotoSansDevanagari_600SemiBold',
  bold: 'NotoSansDevanagari_700Bold',
};

// U+0900-U+097F is the core Unicode Devanagari block, covering Hindi and
// Marathi (both use this script).
const DEVANAGARI_PATTERN = /[ऀ-ॿ]/;

export function containsDevanagari(text: string): boolean {
  return DEVANAGARI_PATTERN.test(text);
}

// Maps a call site's existing fontWeight to the matching Devanagari weight,
// so switched-script text still looks visually consistent with whatever
// style role (title/body/Chip label/etc.) it's replacing.
export function devanagariFontFamily(fontWeight: string): string {
  switch (fontWeight) {
    case '700':
    case '800':
      return DEVANAGARI_FONT_FAMILY.bold;
    case '600':
      return DEVANAGARI_FONT_FAMILY.semiBold;
    case '500':
      return DEVANAGARI_FONT_FAMILY.medium;
    default:
      return DEVANAGARI_FONT_FAMILY.regular;
  }
}
