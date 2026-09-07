import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as NavigationBar from 'expo-navigation-bar';
// setHidden lives on the `NavigationBar` namespace-merged export itself,
// not as a standalone top-level export the way the deprecated `setStyle`
// const is - imported separately (under a different local name to avoid
// colliding with the `* as NavigationBar` import above) rather than reached
// via the confusing `NavigationBar.NavigationBar.setHidden` path.
import { NavigationBar as NavigationBarControls } from 'expo-navigation-bar';

// expo-navigation-bar (SDK 57) no longer exposes a background-color API at
// all - setBackgroundColorAsync/setButtonStyleAsync were removed, since
// Android itself deprecated app-set nav bar background colors in favor of
// enforced edge-to-edge (the gray bar visible in the app today is Android's
// own contrast scrim under the buttons, not a fill color this library can
// repaint). All that's left to control is icon contrast via `style`. Making
// the bar's fill actually match the app would mean opting the whole app
// into edge-to-edge (content drawing behind a transparent nav bar) - a
// bigger structural change than this, not attempted here.
//
// Rendered once, alongside PaletteSwitcher. iOS has no equivalent concept
// (the home-indicator area is just safe-area padding, not a colored system
// chrome bar - see App.tsx's SafeAreaProvider), so this is a no-op there.
const NAV_BAR_STYLE = 'dark';

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

// setStyle() only controls icon contrast, not the bar's own fill (see this
// file's top comment) - Android draws its own translucent contrast scrim
// behind the buttons regardless, with no exposed API left to disable just
// that. setHidden() is the one thing that actually removes it, so the
// full-bleed recording screen hides the bar outright rather than trying to
// recolor something this API no longer exposes. iOS has no equivalent
// system bar - no-op there, same as NavigationBarSync above.
export function useHideNavigationBarWhile(hidden: boolean): void {
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    NavigationBarControls.setHidden(hidden);
  }, [hidden]);
}
