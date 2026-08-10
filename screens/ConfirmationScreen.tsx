import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import type { PaletteColors } from '../theme/palettes';
import type { Spacing } from '../theme/spacing';
import type { Radius } from '../theme/radius';
import type { Typography } from '../theme/typography';
import { Button } from '../components/ui/Button';

interface Props {
  onDone: () => void;
}

// Released state's tail end (design 7c) - reached once the real upload
// sequence finishes successfully. "Record another" doesn't fit the locked
// product shape any more (5 fixed questions, one batch, no "another
// product" concept) - the only real exit is back to Home.
export function ConfirmationScreen({ onDone }: Props) {
  const { colors, spacing, radius, typography } = useTheme();
  const styles = useMemo(() => makeStyles(colors, spacing, radius, typography), [colors, spacing, radius, typography]);

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.checkCircle}>
          <Text style={styles.checkmark}>✓</Text>
        </View>
        <Text style={styles.title}>Your answers are on their way</Text>
        <Text style={styles.subtitle}>
          We'll let you know the moment your branded videos are ready.
        </Text>
        <View style={styles.reassuranceBox}>
          <Text style={styles.reassuranceRow}>✓ Keep your internet on until it finishes</Text>
          <Text style={styles.reassuranceRow}>✓ Please don't close the app while it is uploading</Text>
          <Text style={styles.reassuranceRow}>✓ We'll message you when your videos are ready</Text>
        </View>
      </View>
      <Button label="Back to Home" onPress={onDone} />
    </View>
  );
}

function makeStyles(colors: PaletteColors, spacing: Spacing, radius: Radius, typography: Typography) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      alignItems: 'center',
      padding: spacing.xl,
      paddingTop: spacing.xxl * 1.5,
      paddingBottom: spacing.xxl,
    },
    content: { flex: 1, alignItems: 'center' },
    checkCircle: {
      width: 104,
      height: 104,
      borderRadius: 52,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.xl,
    },
    checkmark: { fontSize: 40, fontWeight: '700', color: colors.accentText },
    title: { ...typography.title, fontSize: 26, color: colors.text, textAlign: 'center', marginBottom: spacing.sm },
    subtitle: { ...typography.body, color: colors.textMuted, textAlign: 'center', lineHeight: 24 },
    reassuranceBox: {
      marginTop: spacing.xl,
      alignSelf: 'stretch',
      gap: spacing.sm,
      backgroundColor: colors.canvas,
      borderRadius: radius.lg,
      padding: spacing.md,
    },
    reassuranceRow: { ...typography.caption, fontSize: 14, color: colors.text, lineHeight: 20 },
  });
}
