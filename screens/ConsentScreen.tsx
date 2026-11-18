import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStrings } from '../i18n/useStrings';
import type { PaletteColors } from '../theme/palettes';
import type { Spacing } from '../theme/spacing';
import type { Radius } from '../theme/radius';
import type { Typography } from '../theme/typography';
import { Button } from '../components/ui/Button';
import { LegalDocumentViewer } from '../components/LegalDocumentViewer';
import type { LegalDocumentId } from '../legalDocuments';

interface Props {
  onAgree: () => void;
  onDecline: () => void;
  campaignNotice?: string;
}

// Concise, localized disclosure with optional full-document reading. Consent
// is an explicit choice, independent of scrolling or OS permission dialogs.
export function ConsentScreen({ onAgree, onDecline, campaignNotice }: Props) {
  const { colors, spacing, radius, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors, spacing, radius, typography), [colors, spacing, radius, typography]);
  const { t } = useStrings();
  const [agreed, setAgreed] = useState(false);
  const [processingAgreed, setProcessingAgreed] = useState(false);
  const [document, setDocument] = useState<LegalDocumentId | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);

  const consentPoints = [
    t('consent.point2'),
    t('consent.point3'),
  ];

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom + spacing.edgeGap + spacing.footerGap }]}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.eyebrow}>{t('consent.eyebrow')}</Text>
        <Text style={styles.title}>{t('consent.title')}</Text>
        {campaignNotice && <Text style={[styles.pointText, { marginBottom: 16, color: colors.textMuted }]}>{campaignNotice}</Text>}
        <View style={styles.pointsGroup}>
          {consentPoints.map((point, i) => (
            <View key={i} style={styles.pointRow}>
              <View style={styles.bullet} />
              <Text style={[styles.pointText, { flex: 1 }]}>{point}</Text>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
          {(['privacy', 'terms'] as const).map(id => <Pressable key={id} accessibilityRole="link" onPress={() => setDocument(id)}><Text style={styles.link}>{t(`legal.${id}`)}</Text></Pressable>)}
        </View>

        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: agreed }} accessibilityLabel={t('consent.checkboxLabel')} style={styles.checkboxRow} onPress={() => setAgreed((v) => !v)}>
          <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>
            {agreed && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={styles.checkboxLabel}>{t('consent.checkboxLabel')}</Text>
        </Pressable>

        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: processingAgreed }} accessibilityLabel={t('consent.processingCheckbox')} style={[styles.checkboxRow, { marginTop: 0 }]} onPress={() => setProcessingAgreed(v => !v)}>
          <View style={[styles.checkbox, processingAgreed && styles.checkboxChecked]}>{processingAgreed && <Text style={styles.checkmark}>✓</Text>}</View>
          <Text style={styles.checkboxLabel}>{t('consent.processingCheckbox')}</Text>
        </Pressable>
        {saveFailed && <Text accessibilityRole="alert" style={{ color: colors.danger, marginBottom: 12 }}>{t('legal.saveFailed')}</Text>}
        <Button label={t('consent.agreeButton')} onPress={() => { try { onAgree(); } catch { setSaveFailed(true); } }} disabled={!agreed || !processingAgreed} />
        <Text style={styles.hint}>{t('consent.hint')}</Text>
        <Pressable accessibilityRole="button" onPress={onDecline} style={{ paddingVertical: 18 }}><Text style={[styles.hint, { color: colors.accent }]}>{t('consent.notNow')}</Text></Pressable>
      </ScrollView>
      <LegalDocumentViewer document={document} onClose={() => setDocument(null)} />
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
    scrollContent: { flexGrow: 1 },
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
      fontSize: 22,
      color: colors.text,
      marginBottom: spacing.lg,
      lineHeight: 28,
    },
    pointsGroup: { gap: spacing.md },
    pointRow: { flexDirection: 'row', gap: spacing.sm + 2 },
    bullet: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.accent, marginTop: 7 },
    pointText: { ...typography.body, fontSize: 13, color: colors.text, lineHeight: 19 },
    link: {
      ...typography.body,
      fontSize: 13,
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
      padding: spacing.sm + 4,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
    },
    checkbox: { width: 24, height: 24, borderRadius: radius.sm, borderWidth: 2, borderColor: colors.textDisabled },
    checkboxChecked: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkmark: { color: colors.accentText, fontSize: 16, fontWeight: '700' },
    checkboxLabel: { ...typography.body, fontSize: 12.5, fontWeight: '600', color: colors.text, flex: 1, lineHeight: 18 },
    hint: {
      ...typography.caption,
      color: colors.textFaint,
      textAlign: 'center',
      marginTop: spacing.sm + 4,
    },
  });
}
