import { StatusBar } from 'expo-status-bar';
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

export default function App() {
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
    // Renders before ThemeProvider can supply anything - a neutral
    // hardcoded background here is fine, not part of the theme sweep.
    return <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />;
  }

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <ThemeProvider>
          <TooltipProvider>
            <AppFlow />
            <AnchoredTooltipOverlay />
          </TooltipProvider>
          <PaletteSwitcher />
          <NavigationBarSync />
          <StatusBar style="dark" />
        </ThemeProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
