export interface Spacing {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
  xxl: number;
  /** Bottom padding for a screen with a persistent button footer anchored
   * near the edge (e.g. Onboarding's nav row, Permissions' footer) - a bit
   * more than xxl alone so the button doesn't feel glued to the edge. Use
   * this instead of a one-off padding value on any new footer-style screen. */
  footerBottom: number;
  /** Extra visual space within a page (`spacing.xl + spacing.topExtra`).
   * ThemeProvider raises this when necessary to clear the top system band.
   * Camera overlays instead use the real inset directly. */
  topExtra: number;
  /** Spacing at screen edges and between content and the app's tab bar. */
  edgeGap: number;
  /** Clear space between footer controls and the colored system area. */
  footerGap: number;
}

export const spacing: Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  footerBottom: 64,
  topExtra: 16,
  edgeGap: 12,
  footerGap: 24,
};
