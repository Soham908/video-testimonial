import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as NavigationBar from 'expo-navigation-bar';
// setHidden lives on the `NavigationBar` namespace-merged export itself,
// not as a standalone top-level export the way the deprecated `setStyle`
// const is - imported separately (under a different local name to avoid
// colliding with the `* as NavigationBar` import above) rather than reached
// via the confusing `NavigationBar.NavigationBar.setHidden` path.
import { NavigationBar as NavigationBarControls } from 'expo-navigation-bar';

// SystemBarFrame paints the dark safe-area background. The Expo config plugin
// disables Android's extra navigation contrast scrim so three-button and gesture
// navigation share that background. Keep system buttons light, including modals.
const NAV_BAR_STYLE = 'light';

export function NavigationBarSync() {
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    NavigationBar.setStyle(NAV_BAR_STYLE);
  }, []);

  return null;
}

// Re-applies the app's standing nav bar icon style. RN's <Modal>
// (PopupSheet) opens a separate native Dialog window on Android that
// doesn't inherit the Activity window's nav bar style, so the system
// quietly resets the icon contrast to its own default (and the bar's own
// translucent scrim can look like it "changed color") for as long as a
// modal is showing. Call this whenever a Modal-based popup becomes
// visible to correct that - see PopupSheet's own use of it.
export function reapplyNavigationBarStyle(): void {
  if (Platform.OS !== 'android') return;
  NavigationBar.setStyle(NAV_BAR_STYLE);
}

// Preserve the existing full-screen capture/playback visibility behavior.
export function useHideNavigationBarWhile(hidden: boolean): void {
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    NavigationBarControls.setHidden(hidden);
  }, [hidden]);
}
