import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import {
  useFonts,
  NotoSans_400Regular,
  NotoSans_500Medium,
  NotoSans_600SemiBold,
  NotoSans_700Bold,
} from '@expo-google-fonts/noto-sans';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from '@expo-google-fonts/plus-jakarta-sans';
import {
  NotoSansDevanagari_400Regular,
  NotoSansDevanagari_500Medium,
  NotoSansDevanagari_600SemiBold,
  NotoSansDevanagari_700Bold,
} from '@expo-google-fonts/noto-sans-devanagari';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppFlow } from './AppFlow';
import { ThemeProvider } from './theme/ThemeContext';
import { PaletteSwitcher } from './theme/PaletteSwitcher';
import { NavigationBarSync } from './theme/NavigationBarSync';
import { ErrorBoundary } from './ErrorBoundary';
import { TooltipProvider } from './tooltips/TooltipContext';
import { AnchoredTooltipOverlay } from './tooltips/AnchoredTooltipOverlay';
import { SystemBarFrame, SYSTEM_BAR_BACKGROUND } from './theme/SystemBarFrame';

export default function App() {
  const [immersive, setImmersive] = useState(false);
  // Both UI-chrome families load up front (not just the active one) so
  // switching fonts via the dev PaletteSwitcher is instant, no reload.
  // Noto Sans Devanagari is a separate family (neither of the two above
  // covers Hindi/Marathi - see theme/fonts.ts) - loaded unconditionally
  // since question text/talking points can be in any of the three
  // languages and there's no in-app language selector to gate this on yet.
  const [fontsLoaded] = useFonts({
    NotoSans_400Regular,
    NotoSans_500Medium,
    NotoSans_600SemiBold,
    NotoSans_700Bold,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    NotoSansDevanagari_400Regular,
    NotoSansDevanagari_500Medium,
    NotoSansDevanagari_600SemiBold,
    NotoSansDevanagari_700Bold,
  });

  if (!fontsLoaded) {
    // Keep startup consistent with the dark system bars while fonts load.
    return <View style={{ flex: 1, backgroundColor: SYSTEM_BAR_BACKGROUND }}><StatusBar style="light" /></View>;
  }

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <ThemeProvider>
          <TooltipProvider>
            <SystemBarFrame immersive={immersive}>
              <AppFlow onImmersiveChange={setImmersive} />
              <PaletteSwitcher />
            </SystemBarFrame>
            <AnchoredTooltipOverlay />
          </TooltipProvider>
          <NavigationBarSync />
          <StatusBar style="light" />
        </ThemeProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
