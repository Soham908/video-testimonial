import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
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

const FACTS = [
  { label: 'How many', value: '5 short questions' },
  { label: 'How long', value: 'About 10 minutes' },
  { label: 'What you get', value: 'Your own branded videos to keep and share' },
];

// A person invited you, not a system - the inviter's name is the first
// thing on the screen, company underneath. Three plain facts answer what
// people actually ask before tapping anything (design screen 11).
export function WhatsAppInviteScreen({
  inviterName = 'Rajesh',
  companyName = 'Vardaan Paints',
  onContinue,
}: Props) {
  const { colors, spacing, radius, typography } = useTheme();
  const styles = useMemo(() => makeStyles(colors, spacing, radius, typography), [colors, spacing, radius, typography]);

  return (
    <View style={styles.container}>
      <View style={{ flex: 1 }}>
        <Text style={styles.eyebrow}>You were invited by</Text>
        <Text style={styles.title}>{inviterName}</Text>
        <Text style={styles.subtitle}>{companyName}</Text>

        <View style={styles.factsGroup}>
          {FACTS.map((fact) => (
            <View key={fact.label} style={styles.factRow}>
              <Text style={styles.factLabel}>{fact.label}</Text>
              <Text style={styles.factValue}>{fact.value}</Text>
            </View>
          ))}
        </View>
      </View>

      <Button label="Continue" onPress={onContinue} />
    </View>
  );
}

function makeStyles(colors: PaletteColors, spacing: Spacing, radius: Radius, typography: Typography) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      padding: spacing.xl,
      paddingTop: spacing.xxl,
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
