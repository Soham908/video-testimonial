import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import type { PaletteColors } from '../theme/palettes';
import type { Spacing } from '../theme/spacing';
import type { Radius } from '../theme/radius';
import type { Typography } from '../theme/typography';
import { useStrings } from '../i18n/useStrings';

interface Props {
  questionNumber: number;
  // False for a question with no takes yet (the plain "Record" entry
  // point on My Videos' unanswered row) - true only once there's an
  // existing take to actually record "again" over. Same overlay either
  // way (a second popup would just duplicate this layout/styling) - only
  // the copy changes, via the conditional below.
  isRetake: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// Shown from My Videos before entering the camera flow at all - styled as
// a bottom-sheet, matching the app's other keep/redo-style confirmations.
export function RetakeConfirmOverlay({ questionNumber, isRetake, onConfirm, onCancel }: Props) {
  const { colors, spacing, radius, typography } = useTheme();
  const styles = useMemo(() => makeStyles(colors, spacing, radius, typography), [colors, spacing, radius, typography]);
  const { t } = useStrings();

  return (
    <Pressable style={styles.overlay} onPress={onCancel}>
      <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
        {isRetake ? (
          <>
            <Text style={styles.title}>{t('retakeConfirm.retakeTitle', { questionNumber })}</Text>
            <Text style={styles.body}>{t('retakeConfirm.retakeBody')}</Text>
            <Pressable style={styles.primaryButton} onPress={onConfirm}>
              <Text style={styles.primaryButtonText}>{t('retakeConfirm.retakeConfirmButton')}</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.title}>{t('retakeConfirm.firstRecordTitle', { questionNumber })}</Text>
            <Text style={styles.body}>{t('retakeConfirm.firstRecordBody')}</Text>
            <Pressable style={styles.primaryButton} onPress={onConfirm}>
              <Text style={styles.primaryButtonText}>{t('retakeConfirm.firstRecordConfirmButton')}</Text>
            </Pressable>
          </>
        )}
        <Pressable style={styles.secondaryButton} onPress={onCancel}>
          <Text style={styles.secondaryButtonText}>{t('retakeConfirm.cancelButton')}</Text>
        </Pressable>
      </Pressable>
    </Pressable>
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
