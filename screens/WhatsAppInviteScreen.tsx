import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { useStrings } from '../i18n/useStrings';
import type { PaletteColors } from '../theme/palettes';
import type { Spacing } from '../theme/spacing';
import type { Radius } from '../theme/radius';
import type { Typography } from '../theme/typography';
import { Button } from '../components/ui/Button';

interface Props {
  /** Mocked for now - a real invite token isn't wired yet, see DECISIONS.md. */
  inviterName?: string;
  companyName?: string;
  onContinue: () => void;
}

// A person invited you, not a system - the inviter's name is the first
// thing on the screen, company underneath. Three plain facts answer what
// people actually ask before tapping anything (design screen 11).
export function WhatsAppInviteScreen({
  inviterName,
  companyName,
  onContinue,
}: Props) {
  const { colors, spacing, radius, typography } = useTheme();
  const styles = useMemo(() => makeStyles(colors, spacing, radius, typography), [colors, spacing, radius, typography]);
  const { t } = useStrings();

  const facts = [
    { key: 'howMany', label: t('whatsAppInvite.factHowManyLabel'), value: t('whatsAppInvite.factHowManyValue') },
    { key: 'howLong', label: t('whatsAppInvite.factHowLongLabel'), value: t('whatsAppInvite.factHowLongValue') },
    { key: 'whatYouGet', label: t('whatsAppInvite.factWhatYouGetLabel'), value: t('whatsAppInvite.factWhatYouGetValue') },
  ];

  return (
    <View style={styles.container}>
      <View>
        <Text style={styles.eyebrow}>{t('whatsAppInvite.invitedByEyebrow')}</Text>
        <Text style={styles.title}>{inviterName ?? t('whatsAppInvite.inviterNameDefault')}</Text>
        <Text style={styles.subtitle}>{companyName ?? t('whatsAppInvite.companyNameDefault')}</Text>

        <View style={styles.factsGroup}>
          {facts.map((fact) => (
            <View key={fact.key} style={styles.factRow}>
              <Text style={styles.factLabel}>{fact.label}</Text>
              <Text style={styles.factValue}>{fact.value}</Text>
            </View>
          ))}
        </View>

        <Button label={t('whatsAppInvite.continueButton')} onPress={onContinue} style={{ marginTop: spacing.xl }} />
      </View>
    </View>
  );
}

function makeStyles(colors: PaletteColors, spacing: Spacing, radius: Radius, typography: Typography) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      padding: spacing.xl,
      paddingTop: spacing.xxl + spacing.topExtra,
      paddingBottom: spacing.xxl,
    },
    eyebrow: {
      fontSize: 12.5,
      fontWeight: '700',
      letterSpacing: 1.5,
      textTransform: 'uppercase',
      color: colors.textFaint,
      marginBottom: spacing.sm,
    },
    title: { ...typography.title, fontSize: 34, color: colors.text, lineHeight: 40 },
    subtitle: { ...typography.body, fontSize: 16, color: colors.textMuted, marginTop: spacing.xs },
    factsGroup: { marginTop: spacing.xxl, gap: spacing.md },
    factRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: spacing.md,
      paddingVertical: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    factLabel: { ...typography.caption, color: colors.textFaint, width: 96 },
    factValue: { ...typography.body, fontWeight: '600', color: colors.text, flex: 1, textAlign: 'right' },
  });
}
