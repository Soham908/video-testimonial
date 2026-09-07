import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import type { PaletteColors } from '../theme/palettes';
import type { Spacing } from '../theme/spacing';
import type { Radius } from '../theme/radius';
import type { Typography } from '../theme/typography';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Carousel } from '../components/ui/Carousel';
import { useStrings } from '../i18n/useStrings';

interface NextQuestion {
  index: number;
  text: string;
  estimate: string;
}

interface ReadyReel {
  label: string;
}

interface Props {
  // No real source for any of these three exists yet - GET /me only
  // returns auth-scoped ids, not a display name (see auth.ts). Optional so
  // the greeting can fall back to something honest instead of inventing a
  // name/business/city (see the greeting/avatar logic below).
  distributorName?: string;
  businessName?: string;
  city?: string;
  totalQuestions: number;
  /** Recorded locally so far this cycle - not necessarily submitted yet. */
  questionsAnswered: number;
  /** True once "Send all five" has actually been pressed. */
  hasSubmittedBatch: boolean;
  /** How many branded reels have come back for the current batch. */
  renderedReadyCount: number;
  nextQuestion: NextQuestion | null;
  /** The one exception to "Home doesn't show your own reels" - a single ready reel worth a banner. */
  readyReel: ReadyReel | null;
  onStartNextQuestion: () => void;
  onSendAll: () => void;
  onOpenMyVideos: () => void;
  onShareReadyReel: () => void;
}

const HOW_TO_VIDEO_DURATIONS = ['1:10', '0:48'];
const SAMPLE_VIDEO_DURATIONS = ['0:48', '0:39', '0:52'];

// Home's job is prompting the next action - the distributor's own content
// lives in My Videos, not here (DECISIONS.md). Five states derived from
// progress, not passed in directly, so real data can drive this the same
// way once wired in Phase 7: first-time, in-progress, all-recorded (not
// submitted), submitted (being prepared), reels-ready. The last of these is
// still an open design decision - kept to a light placeholder rather than
// over-built.
export function HomeScreen({
  distributorName,
  businessName,
  city,
  totalQuestions,
  questionsAnswered,
  hasSubmittedBatch,
  renderedReadyCount,
  nextQuestion,
  readyReel,
  onStartNextQuestion,
  onSendAll,
  onOpenMyVideos,
  onShareReadyReel,
}: Props) {
  const { colors, spacing, radius, typography } = useTheme();
  const styles = useMemo(() => makeStyles(colors, spacing, radius, typography), [colors, spacing, radius, typography]);
  const { t } = useStrings();

  const allRecorded = questionsAnswered >= totalQuestions;
  const allRendered = renderedReadyCount >= totalQuestions;
  // Greeting uses the first name only (design 1C/15); the avatar monogram
  // below uses the full name's initials - both derived from one prop so
  // callers don't have to pass the name twice. No real name source exists
  // yet (see Props) - falls back to a plain, non-personalized greeting and
  // a generic avatar mark rather than showing a blank/invented name.
  const firstName = distributorName?.trim().split(/\s+/)[0];
  const subGreeting = [businessName, city].filter(Boolean).join(' · ');
  const initials = distributorName
    ?.split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  // The JSON strings always include ", {{name}}" - when there's no real
  // name yet (see Props), interpolate an empty string and trim the
  // trailing separator rather than needing a second no-name key per
  // language for what's just a loading-state fallback.
  const greetingRaw = t(questionsAnswered === 0 ? 'home.greetingFirstTime' : 'home.greetingReturning', {
    name: firstName ?? '',
  });
  const greeting = firstName ? greetingRaw : greetingRaw.replace(/[,،]\s*$/, '');
  const howToVideos = [
    { title: t('home.howToVideo1Title'), duration: HOW_TO_VIDEO_DURATIONS[0] },
    { title: t('home.howToVideo2Title'), duration: HOW_TO_VIDEO_DURATIONS[1] },
  ];
  const sampleVideos = [
    { title: t('home.sampleVideo1Title'), duration: SAMPLE_VIDEO_DURATIONS[0] },
    { title: t('home.sampleVideo2Title'), duration: SAMPLE_VIDEO_DURATIONS[1] },
    { title: t('home.sampleVideo3Title'), duration: SAMPLE_VIDEO_DURATIONS[2] },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{greeting}</Text>
          {subGreeting.length > 0 && <Text style={styles.subGreeting}>{subGreeting}</Text>}
        </View>
        <View style={styles.avatar}>
          {initials ? <Text style={styles.avatarText}>{initials}</Text> : <GenericAvatarGlyph />}
        </View>
      </View>

      {readyReel && (
        <View style={styles.readyBanner}>
          <View style={styles.readyBannerThumb} />
          <Text style={styles.readyBannerText}>{t('home.readyBannerText', { label: readyReel.label })}</Text>
          <Button label={t('home.readyBannerShareButton')} onPress={onShareReadyReel} variant="quiet" style={styles.readyBannerButton} />
        </View>
      )}

      {allRendered ? (
        <Card style={styles.stateCard}>
          <Text style={styles.stateEyebrow}>{t('home.allRenderedEyebrow')}</Text>
          <Text style={styles.stateTitle}>{t('home.allRenderedTitle')}</Text>
          <Text style={styles.stateBody}>{t('home.allRenderedBody')}</Text>
          <Button label={t('home.allRenderedButton')} onPress={onOpenMyVideos} style={{ marginTop: spacing.md }} />
        </Card>
      ) : hasSubmittedBatch && allRecorded ? (
        // Only the fully-recorded-and-sent case shows "being made" - a
        // partial send from My Videos' own independent upload button
        // (reachable before all questions are answered) also flips
        // hasSubmittedBatch, but that must never hide the "record the rest"
        // prompt below while questions are still pending.
        <Card style={[styles.stateCard, styles.stateCardDark]}>
          <Text style={[styles.stateEyebrow, { color: '#C9A184' }]}>{t('home.submittedEyebrow')}</Text>
          <Text style={[styles.stateTitle, { color: '#FFFFFF' }]}>
            {t('home.submittedTitle')}
          </Text>
          <Text style={[styles.stateBody, { color: 'rgba(255,255,255,0.72)' }]}>
            {t('home.submittedBody')}
          </Text>
        </Card>
      ) : allRecorded ? (
        <Card style={[styles.stateCard, styles.stateCardDark]}>
          <View style={styles.progressRow}>
            <Text style={[styles.stateEyebrow, { color: '#C9A184' }]}>{t('home.allRecordedEyebrow')}</Text>
            <ProgressDots done={totalQuestions} total={totalQuestions} accent="#C9A184" />
          </View>
          <Text style={[styles.stateTitle, { color: '#FFFFFF' }]}>
            {t('home.allRecordedTitle')}
          </Text>
          <Text style={[styles.stateBody, { color: 'rgba(255,255,255,0.72)' }]}>
            {t('home.allRecordedBody')}
          </Text>
          <Button label={t('home.allRecordedButton')} onPress={onSendAll} style={{ marginTop: spacing.md }} />
        </Card>
      ) : (
        nextQuestion && (
          <Card emphasized style={styles.stateCard}>
            <View style={styles.progressRow}>
              <Text style={styles.stateEyebrow}>
                {t('home.nextQuestionEyebrow', { index: nextQuestion.index, total: totalQuestions })}
              </Text>
              <ProgressDots done={questionsAnswered} total={totalQuestions} accent={colors.accent} />
            </View>
            <Text style={styles.stateTitle}>{nextQuestion.text}</Text>
            <Text style={styles.stateBody}>{nextQuestion.estimate}</Text>
            <Button
              label={questionsAnswered === 0 ? t('home.nextQuestionButtonFirst') : t('home.nextQuestionButtonLater')}
              onPress={onStartNextQuestion}
              style={{ marginTop: spacing.md }}
            />
          </Card>
        )
      )}

      {questionsAnswered === 0 && (
        <View style={styles.emptyVideosHint}>
          <Text style={styles.emptyVideosHintText}>
            {t('home.emptyVideosHint')}
          </Text>
        </View>
      )}

      <SectionHeader title={t('home.howToSectionTitle')} onSeeAll={() => {}} styles={styles} />
      <View style={styles.howToRow}>
        {howToVideos.map((v) => (
          <View key={v.title} style={styles.howToItem}>
            <View style={styles.howToThumb}>
              <PlayGlyph size={32} />
              <Text style={styles.thumbDuration}>{v.duration}</Text>
            </View>
            <Text style={styles.howToTitle}>{v.title}</Text>
          </View>
        ))}
      </View>

      <View style={styles.statLine}>
        <View style={styles.statAvatars}>
          <View style={[styles.statAvatarDot, { backgroundColor: '#C9A184' }]} />
          <View style={[styles.statAvatarDot, { backgroundColor: '#A9846A', marginLeft: -9 }]} />
          <View style={[styles.statAvatarDot, { backgroundColor: '#7E6B5C', marginLeft: -9 }]} />
        </View>
        <Text style={styles.statText}>{t('home.statLine', { count: 41 })}</Text>
      </View>

      <SectionHeader title={t('home.sampleVideosSectionTitle')} subtitle={t('home.sampleVideosSectionSubtitle')} styles={styles} />
      <Carousel>
        {sampleVideos.map((v) => (
          <View key={v.title} style={styles.sampleThumb}>
            <View style={styles.exampleTag}>
              <Text style={styles.exampleTagText}>{t('home.exampleTag')}</Text>
            </View>
            <Text style={styles.sampleTitle}>{v.title}</Text>
            <Text style={styles.sampleDuration}>{v.duration}</Text>
          </View>
        ))}
      </Carousel>
    </ScrollView>
  );
}

function ProgressDots({ done, total, accent }: { done: number; total: number; accent: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={{
            width: 14,
            height: 4,
            borderRadius: 2,
            backgroundColor: i < done ? accent : 'rgba(140,131,122,0.35)',
          }}
        />
      ))}
    </View>
  );
}

// Shown in the avatar circle in place of initials when no real distributor
// name exists yet (Props) - a generic head-and-shoulders mark, the same
// "nothing set yet" convention most apps use for a missing profile photo,
// rather than leaving the circle empty or guessing at initials.
function GenericAvatarGlyph() {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: colors.accent, marginBottom: 2 }} />
      <View style={{ width: 24, height: 13, borderTopLeftRadius: 12, borderTopRightRadius: 12, backgroundColor: colors.accent }} />
    </View>
  );
}

function PlayGlyph({ size }: { size: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: 'rgba(255,255,255,0.94)',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: 0,
          height: 0,
          borderTopWidth: size * 0.2,
          borderBottomWidth: size * 0.2,
          borderLeftWidth: size * 0.3,
          borderTopColor: 'transparent',
          borderBottomColor: 'transparent',
          borderLeftColor: '#241E1A',
          marginLeft: 3,
        }}
      />
    </View>
  );
}

function SectionHeader({
  title,
  subtitle,
  onSeeAll,
  styles,
}: {
  title: string;
  subtitle?: string;
  onSeeAll?: () => void;
  styles: ReturnType<typeof makeStyles>;
}) {
  const { t } = useStrings();
  return (
    <View>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {onSeeAll && (
          <Text style={styles.sectionSeeAll} onPress={onSeeAll}>
            {t('home.seeAll')}
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
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    greeting: { ...typography.title, fontSize: 22, color: colors.text },
    subGreeting: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: { fontSize: 14, fontWeight: '700', color: colors.accent },
    readyBanner: {
      backgroundColor: colors.text,
      borderRadius: radius.lg,
      padding: spacing.sm + 4,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm + 2,
    },
    readyBannerThumb: { width: 26, height: 34, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.2)' },
    readyBannerText: { flex: 1, color: '#FFFFFF', fontSize: 13.5, fontWeight: '600', lineHeight: 18 },
    readyBannerButton: { backgroundColor: '#FFFFFF', paddingVertical: 7, paddingHorizontal: 14 },
    stateCard: { gap: 4 },
    stateCardDark: { backgroundColor: colors.text, borderColor: colors.text },
    progressRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    stateEyebrow: {
      fontSize: 11.5,
      letterSpacing: 1.8,
      textTransform: 'uppercase',
      color: colors.accent,
      fontWeight: '700',
    },
    stateTitle: {
      ...typography.body,
      fontSize: 20.5,
      fontWeight: '600',
      color: colors.text,
      marginTop: 4,
      lineHeight: 27,
    },
    stateBody: { ...typography.caption, color: colors.textFaint, marginTop: 4 },
    emptyVideosHint: {
      borderWidth: 1.5,
      borderColor: colors.borderStrong,
      borderStyle: 'dashed',
      borderRadius: radius.lg,
      padding: spacing.md,
    },
    emptyVideosHintText: { ...typography.caption, color: colors.textFaint, lineHeight: 20 },
    sectionHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      marginTop: spacing.sm,
    },
    sectionTitle: {
      fontSize: 11.5,
      letterSpacing: 1.8,
      textTransform: 'uppercase',
      color: colors.textFaint,
      fontWeight: '700',
    },
    sectionSeeAll: { fontSize: 13, fontWeight: '700', color: colors.accent },
    sectionSubtitle: { ...typography.caption, color: colors.textFaint, marginTop: 4, lineHeight: 18 },
    howToRow: { flexDirection: 'row', gap: spacing.sm + 3 },
    howToItem: { flex: 1, gap: spacing.sm - 1 },
    howToThumb: {
      height: 74,
      borderRadius: radius.md - 1,
      backgroundColor: '#2B2521',
      alignItems: 'center',
      justifyContent: 'center',
    },
    thumbDuration: { position: 'absolute', right: 8, bottom: 7, color: 'rgba(255,255,255,0.75)', fontSize: 10.5 },
    howToTitle: { ...typography.caption, fontSize: 13.5, fontWeight: '600', color: colors.text, lineHeight: 18 },
    statLine: {
      backgroundColor: colors.canvas,
      borderRadius: radius.lg,
      padding: spacing.sm + 4,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm + 2,
    },
    statAvatars: { flexDirection: 'row' },
    statAvatarDot: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.canvas },
    statText: { ...typography.caption, fontSize: 13.5, color: colors.textMuted, flex: 1, lineHeight: 19 },
    sampleThumb: {
      width: 104,
      height: 116,
      borderRadius: radius.md,
      backgroundColor: '#2B2521',
      padding: spacing.sm,
      justifyContent: 'flex-end',
    },
    exampleTag: {
      position: 'absolute',
      top: 8,
      left: 8,
      backgroundColor: 'rgba(255,255,255,0.18)',
      borderRadius: 999,
      paddingVertical: 3,
      paddingHorizontal: 7,
    },
    exampleTagText: { color: '#FFFFFF', fontSize: 9, fontWeight: '700', letterSpacing: 1 },
    sampleTitle: { color: '#FFFFFF', fontSize: 12.5, fontWeight: '700', lineHeight: 16 },
    sampleDuration: { color: 'rgba(255,255,255,0.62)', fontSize: 11 },
  });
}
