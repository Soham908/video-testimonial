import { useEffect, useMemo } from 'react';
import { Image, Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import type { PaletteColors } from '../theme/palettes';
import type { Spacing } from '../theme/spacing';
import type { Typography } from '../theme/typography';

interface Props {
  onContinue: () => void;
}

const AUTO_ADVANCE_MS = 1400;

// On screen briefly, carrying one idea only: this is [company], and it's
// about your voice. The app name sits above the company - the distributor
// is the subject here, not the brand (design screen 10). Company name is
// "Zeist Interactive" for now (placeholder, not the real client). Auto-
// advances; still tappable in case someone doesn't want to wait.
export function SplashScreen({ onContinue }: Props) {
  const { colors, spacing, typography } = useTheme();
  const styles = useMemo(() => makeStyles(colors, spacing, typography), [colors, spacing, typography]);

  useEffect(() => {
    const timer = setTimeout(onContinue, AUTO_ADVANCE_MS);
    return () => clearTimeout(timer);
  }, [onContinue]);

  return (
    <Pressable style={styles.container} onPress={onContinue}>
      <Image
        source={require('../assets/Zeist-logo-white.png')}
        style={styles.mark}
        resizeMode="contain"
      />
      <Text style={styles.appName}>Insight Scoop</Text>
      <Text style={styles.company}>Zeist Interactive</Text>
    </Pressable>
  );
}

function makeStyles(colors: PaletteColors, spacing: Spacing, typography: Typography) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.md,
    },
    // Real logo (245x288 source) - sized to keep its own aspect ratio
    // rather than forcing it into the old placeholder's square box.
    mark: {
      width: 56,
      height: 66,
      marginBottom: spacing.sm,
    },
    appName: { ...typography.title, fontSize: 22, color: colors.accentText },
    company: { ...typography.body, fontSize: 14, color: 'rgba(255,255,255,0.78)' },
  });
}
