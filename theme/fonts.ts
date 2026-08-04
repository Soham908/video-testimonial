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
