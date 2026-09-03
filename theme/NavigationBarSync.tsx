import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as NavigationBar from 'expo-navigation-bar';

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
export function NavigationBarSync() {
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    NavigationBar.setStyle('dark');
  }, []);

  return null;
}
