import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import type { PaletteColors } from '../theme/palettes';
import type { Spacing } from '../theme/spacing';
import type { Radius } from '../theme/radius';
import type { Typography } from '../theme/typography';
import { Button } from '../components/ui/Button';

interface Props {
  onAgree: () => void;
}

// Placeholder consent copy, modeled on HeyGen's approach per CLAUDE.md.
// This is a mandatory gate before any recording, shown once right after
// Onboarding - kept as its own screen, separate from Permissions (which is
// a plain pre-recording explainer shown before every session). Final
// wording needs a compliance review before shipping, this is a v1 UI
// scaffold only.
const CONSENT_POINTS = [
  'You will record a video of yourself answering 5 questions about your work.',
  'Your company may show this video on its website and to other distributors.',
  'Nothing is shared until you finish and press send. You can stop at any time.',
];

export function ConsentScreen({ onAgree }: Props) {
  const { colors, spacing, radius, typography } = useTheme();
  const styles = useMemo(() => makeStyles(colors, spacing, radius, typography), [colors, spacing, radius, typography]);
  const [agreed, setAgreed] = useState(false);

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.eyebrow}>Before you begin</Text>
        <Text style={styles.title}>Please read this — it's important</Text>
        <View style={styles.pointsGroup}>
          {CONSENT_POINTS.map((point) => (
            <View key={point} style={styles.pointRow}>
              <View style={styles.bullet} />
              <Text style={styles.pointText}>{point}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.link}>Read the full terms</Text>

        <Pressable style={styles.checkboxRow} onPress={() => setAgreed((v) => !v)}>
          <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>
            {agreed && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={styles.checkboxLabel}>I understand, and I agree to be recorded.</Text>
        </Pressable>

        <Button label="Agree & continue" onPress={onAgree} disabled={!agreed} />
        <Text style={styles.hint}>Tick the box above to continue</Text>
      </ScrollView>
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
    scrollView: { flex: 1 },
    // Everything (text, checkbox, button, hint) is one block now, so
    // centering it centers the whole page as a unit - not the earlier bug
    // where only the text half was centered while the button stayed
    // pinned to the screen edge, splitting the layout in two.
    scrollContent: { flexGrow: 1, justifyContent: 'center' },
    eyebrow: {
      fontSize: 12.5,
      fontWeight: '700',
      letterSpacing: 1.5,
      textTransform: 'uppercase',
      color: colors.accent,
      marginBottom: spacing.sm - 2,
    },
    title: {
      ...typography.title,
      fontSize: 26,
      color: colors.text,
      marginBottom: spacing.lg,
      lineHeight: 33,
    },
    pointsGroup: { gap: spacing.lg },
    pointRow: { flexDirection: 'row', gap: spacing.sm + 2 },
    bullet: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.accent, marginTop: 7 },
    pointText: { ...typography.body, color: colors.text, flex: 1, lineHeight: 24 },
    link: {
      ...typography.body,
      fontSize: 15,
      fontWeight: '600',
      color: colors.accent,
      marginTop: spacing.lg,
    },
    checkboxRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      marginTop: spacing.lg,
      marginBottom: spacing.md,
      padding: spacing.md,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
    },
    checkbox: { width: 30, height: 30, borderRadius: radius.sm, borderWidth: 2, borderColor: colors.textDisabled },
    checkboxChecked: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkmark: { color: colors.accentText, fontSize: 16, fontWeight: '700' },
    checkboxLabel: { ...typography.body, fontWeight: '600', color: colors.text, flex: 1, lineHeight: 22 },
    hint: {
      ...typography.caption,
      color: colors.textFaint,
      textAlign: 'center',
      marginTop: spacing.sm + 4,
    },
  });
}
