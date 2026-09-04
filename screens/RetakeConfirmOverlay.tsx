import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import type { PaletteColors } from '../theme/palettes';
import type { Spacing } from '../theme/spacing';
import type { Radius } from '../theme/radius';
import type { Typography } from '../theme/typography';

interface Props {
  questionNumber: number;
  onConfirm: () => void;
  onCancel: () => void;
}

// Shown from My Videos before entering the camera flow at all - styled as
// a bottom-sheet, matching the app's other keep/redo-style confirmations.
export function RetakeConfirmOverlay({ questionNumber, onConfirm, onCancel }: Props) {
  const { colors, spacing, radius, typography } = useTheme();
  const styles = useMemo(() => makeStyles(colors, spacing, radius, typography), [colors, spacing, radius, typography]);

  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
        <Text style={styles.title}>Record again for Question {questionNumber}?</Text>
        <Text style={styles.body}>
          You'll get to choose which take to keep afterward - nothing is replaced until then.
        </Text>
        <Pressable style={styles.primaryButton} onPress={onConfirm}>
          <Text style={styles.primaryButtonText}>Yes, record again</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={onCancel}>
          <Text style={styles.secondaryButtonText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

function makeStyles(colors: PaletteColors, spacing: Spacing, radius: Radius, typography: Typography) {
  return StyleSheet.create({
    overlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.55)',
      alignItems: 'center',
      justifyContent: 'flex-end',
    },
    card: {
      width: '100%',
      backgroundColor: colors.background,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      padding: spacing.xl,
      paddingBottom: spacing.xxl,
    },
    title: { ...typography.title, fontSize: 22, color: colors.text, marginBottom: spacing.sm },
    body: { ...typography.body, color: colors.textMuted, lineHeight: 22, marginBottom: spacing.lg },
    primaryButton: {
      height: 60,
      backgroundColor: colors.accent,
      borderRadius: radius.lg,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.md - 4,
    },
    primaryButtonText: { ...typography.button, color: colors.accentText },
    secondaryButton: {
      height: 58,
      borderWidth: 2,
      borderColor: colors.accent,
      borderRadius: radius.lg,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
    },
    secondaryButtonText: { ...typography.button, fontSize: 17, color: colors.accent },
  });
}
