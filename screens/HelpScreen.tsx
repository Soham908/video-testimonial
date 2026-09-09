import { useMemo, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import type { PaletteColors } from '../theme/palettes';
import type { Spacing } from '../theme/spacing';
import type { Radius } from '../theme/radius';
import type { Typography } from '../theme/typography';
import { Chip } from '../components/ui/Chip';
import { Carousel } from '../components/ui/Carousel';
import { Dropdown } from '../components/ui/Dropdown';
import { PopupSheet } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { useStrings, type UseStringsResult } from '../i18n/useStrings';

interface QuickTip {
  id: string;
  label: string;
  reason: string;
}

interface HowToVideo {
  title: string;
  duration: string;
}

// Durations are decorative mock data, not translatable copy - kept as
// plain literals; only the titles come from t().
function makeQuickTips(t: UseStringsResult['t']): QuickTip[] {
  return [
    { id: 'light', label: t('help.quickTipLightLabel'), reason: t('help.quickTipLightReason') },
    { id: 'quiet', label: t('help.quickTipQuietLabel'), reason: t('help.quickTipQuietReason') },
    { id: 'phone', label: t('help.quickTipPhoneLabel'), reason: t('help.quickTipPhoneReason') },
  ];
}

function makeHowToVideos(t: UseStringsResult['t']): HowToVideo[] {
  return [
    { title: t('help.howToVideo1Title'), duration: '1:10' },
    { title: t('help.howToVideo2Title'), duration: '0:48' },
    { title: t('help.howToVideo3Title'), duration: '0:55' },
    { title: t('help.howToVideo4Title'), duration: '0:42' },
    { title: t('help.howToVideo5Title'), duration: '0:45' },
    { title: t('help.howToVideo6Title'), duration: '0:38' },
  ];
}

function makeSampleVideos(t: UseStringsResult['t']) {
  return [
    { title: t('help.sampleVideo1Title'), duration: '0:48' },
    { title: t('help.sampleVideo2Title'), duration: '0:39' },
    { title: t('help.sampleVideo3Title'), duration: '0:52' },
  ];
}

function makeFaqs(t: UseStringsResult['t']) {
  return [
    { q: t('help.faq1Question'), a: t('help.faq1Answer') },
    { q: t('help.faq2Question'), a: t('help.faq2Answer') },
    { q: t('help.faq3Question'), a: t('help.faq3Answer') },
  ];
}

// Design 8D + 8E/8F pop-ups - fully new, no current screen. Quick-tip chips
// open a video pop-up, how-to videos show 2 with a "see all" expand,
// "talk to someone" opens a contact pop-up, plus a sample-videos carousel
// and FAQs.
export function HelpScreen() {
  const { colors, spacing, radius, typography } = useTheme();
  const styles = useMemo(() => makeStyles(colors, spacing, radius, typography), [colors, spacing, radius, typography]);
  const { t } = useStrings();

  const [openTip, setOpenTip] = useState<QuickTip | null>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [showAllVideos, setShowAllVideos] = useState(false);

  const quickTips = makeQuickTips(t);
  const howToVideos = makeHowToVideos(t);
  const sampleVideos = makeSampleVideos(t);
  const faqs = makeFaqs(t);
  const visibleVideos = showAllVideos ? howToVideos : howToVideos.slice(0, 2);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{t('help.title')}</Text>
      <Text style={styles.subtitle}>{t('help.subtitle')}</Text>

      <View style={styles.chipsRow}>
        {quickTips.map((tip) => (
          <Chip key={tip.id} label={tip.label} onPress={() => setOpenTip(tip)} />
        ))}
      </View>

      <SectionHeader
        title={t('help.howToSectionTitle')}
        onSeeAll={!showAllVideos ? () => setShowAllVideos(true) : undefined}
        seeAllLabel={t('help.howToSeeAll')}
        styles={styles}
      />
      <View style={styles.videoGrid}>
        {visibleVideos.map((v) => (
          <View key={v.title} style={styles.videoCard}>
            <View style={styles.videoThumb}>
              <PlayGlyph />
              <Text style={styles.videoDuration}>{v.duration}</Text>
            </View>
            <Text style={styles.videoTitle}>{v.title}</Text>
          </View>
        ))}
      </View>

      <View style={styles.contactCard} onTouchEnd={() => setContactOpen(true)}>
        <View>
          <Text style={styles.contactTitle}>{t('help.contactCardTitle')}</Text>
          <Text style={styles.contactSubtitle}>{t('help.contactCardSubtitle')}</Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </View>

      <SectionHeader
        title={t('help.sampleVideosSectionTitle')}
        subtitle={t('help.sampleVideosSectionSubtitle')}
        styles={styles}
      />
      <Carousel>
        {sampleVideos.map((v) => (
          <View key={v.title} style={styles.sampleThumb}>
            <Text style={styles.exampleTagText}>{t('help.exampleTag')}</Text>
            <Text style={styles.sampleTitle}>{v.title}</Text>
            <Text style={styles.sampleDuration}>{v.duration}</Text>
          </View>
        ))}
      </Carousel>

      <SectionHeader title={t('help.faqsSectionTitle')} styles={styles} />
      <View style={{ gap: spacing.sm }}>
        {faqs.map((faq) => (
          <Dropdown key={faq.q} title={faq.q}>
            <Text style={{ ...typography.caption, color: colors.textMuted, lineHeight: 20 }}>{faq.a}</Text>
          </Dropdown>
        ))}
      </View>

      <PopupSheet visible={!!openTip} onDismiss={() => setOpenTip(null)}>
        {openTip && (
          <>
            <Text style={{ fontSize: 19, fontWeight: '700', color: colors.text, marginBottom: 8 }}>
              {openTip.label}
            </Text>
            <Text style={{ fontSize: 14.5, color: colors.textMuted, lineHeight: 20, marginBottom: 16 }}>
              {openTip.reason}
            </Text>
            <View style={[styles.videoThumb, { height: 160 }]}>
              <PlayGlyph />
            </View>
          </>
        )}
      </PopupSheet>

      <PopupSheet visible={contactOpen} onDismiss={() => setContactOpen(false)}>
        <Text style={{ fontSize: 19, fontWeight: '700', color: colors.text, marginBottom: 4 }}>
          {t('help.contactPopupTitle')}
        </Text>
        <Text style={{ fontSize: 13, color: colors.textFaint, marginBottom: 18 }}>
          {t('help.contactPopupSubtitle')}
        </Text>
        <View style={{ gap: 10 }}>
          <Button
            label={t('help.contactPopupWhatsAppButton')}
            onPress={() => Linking.openURL('https://wa.me/910000000000')}
          />
          <Button
            label={t('help.contactPopupCallBackButton')}
            variant="secondary"
            onPress={() => setContactOpen(false)}
          />
        </View>
      </PopupSheet>
    </ScrollView>
  );
}

function PlayGlyph() {
  return (
    <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.94)', alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 0, height: 0, borderTopWidth: 7, borderBottomWidth: 7, borderLeftWidth: 11, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: '#241E1A', marginLeft: 3 }} />
    </View>
  );
}

function SectionHeader({
  title,
  subtitle,
  onSeeAll,
  seeAllLabel,
  styles,
}: {
  title: string;
  subtitle?: string;
  onSeeAll?: () => void;
  seeAllLabel?: string;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {onSeeAll && (
          <Text style={styles.sectionSeeAll} onPress={onSeeAll}>
            {seeAllLabel}
          </Text>
        )}
      </View>
      {subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}
    </View>
  );
}

function makeStyles(colors: PaletteColors, spacing: Spacing, radius: Radius, typography: Typography) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: {
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.xl + spacing.topExtra,
      paddingBottom: spacing.xxl,
      gap: spacing.md,
    },
    title: { ...typography.title, fontSize: 24, color: colors.text },
    subtitle: { ...typography.caption, fontSize: 13.5, color: colors.textMuted, marginTop: -4 },
    chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
    sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: spacing.sm },
    sectionTitle: { fontSize: 11.5, letterSpacing: 1.8, textTransform: 'uppercase', color: colors.textFaint, fontWeight: '700' },
    sectionSeeAll: { fontSize: 13, fontWeight: '700', color: colors.accent },
    sectionSubtitle: { ...typography.caption, color: colors.textFaint, marginTop: 4, lineHeight: 18 },
    videoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm + 3 },
    videoCard: { width: '47%', gap: spacing.sm - 1 },
    videoThumb: { height: 90, borderRadius: radius.md - 1, backgroundColor: '#2B2521', alignItems: 'center', justifyContent: 'center' },
    videoDuration: { position: 'absolute', right: 8, bottom: 7, color: 'rgba(255,255,255,0.75)', fontSize: 10.5 },
    videoTitle: { ...typography.caption, fontSize: 13.5, fontWeight: '600', color: colors.text, lineHeight: 18 },
    contactCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      padding: spacing.md,
    },
    contactTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
    contactSubtitle: { ...typography.caption, color: colors.textFaint, marginTop: 2 },
    chevron: { fontSize: 22, color: colors.textFaint },
    sampleThumb: { width: 104, height: 116, borderRadius: radius.md, backgroundColor: '#2B2521', padding: spacing.sm, justifyContent: 'flex-end' },
    exampleTagText: {
      position: 'absolute',
      top: 8,
      left: 8,
      color: '#FFFFFF',
      fontSize: 9,
      fontWeight: '700',
      letterSpacing: 1,
      backgroundColor: 'rgba(255,255,255,0.18)',
      borderRadius: 999,
      paddingVertical: 3,
      paddingHorizontal: 7,
      overflow: 'hidden',
    },
    sampleTitle: { color: '#FFFFFF', fontSize: 12.5, fontWeight: '700', lineHeight: 16 },
    sampleDuration: { color: 'rgba(255,255,255,0.62)', fontSize: 11 },
  });
}
