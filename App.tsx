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
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppFlow } from './AppFlow';
import { ThemeProvider } from './theme/ThemeContext';
import { PaletteSwitcher } from './theme/PaletteSwitcher';

export default function App() {
  // Both families load up front (not just the active one) so switching
  // fonts via the dev PaletteSwitcher is instant, no reload.
  const [fontsLoaded] = useFonts({
    NotoSans_400Regular,
    NotoSans_500Medium,
    NotoSans_600SemiBold,
    NotoSans_700Bold,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });

  if (!fontsLoaded) {
    // Renders before ThemeProvider can supply anything - a neutral
    // hardcoded background here is fine, not part of the theme sweep.
    return <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />;
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppFlow />
        <PaletteSwitcher />
        <StatusBar style="dark" />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
