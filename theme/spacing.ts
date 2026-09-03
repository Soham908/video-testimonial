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
  /** Extra top clearance layered onto a screen's existing top padding
   * (`paddingTop: spacing.xl + spacing.topExtra`, not standalone) - content
   * sat too close to the status bar by default. A flat add-on, not a real
   * device safe-area inset (unlike BottomTabBar's, which reads
   * useSafeAreaInsets() - this is a deliberately simpler fix, since unlike
   * the bottom nav bar this was never an overlap/functional bug, just
   * tight spacing). */
  topExtra: number;
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
};
