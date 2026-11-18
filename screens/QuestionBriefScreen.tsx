import { useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useVideoPlayer } from 'expo-video';
import { useEvent } from 'expo';
import { useTheme } from '../theme/ThemeContext';
import type { PaletteColors } from '../theme/palettes';
import type { Spacing } from '../theme/spacing';
import type { Radius } from '../theme/radius';
import type { Typography } from '../theme/typography';
import { Button } from '../components/ui/Button';
import { PopupSheet } from '../components/ui/Modal';
import { hasSeenTip, markTipSeen } from '../firstRunTips';
import { containsDevanagari, devanagariFontFamily } from '../theme/fonts';
import { HelpButton } from '../tooltips/HelpButton';
import { TooltipTarget } from '../tooltips/TooltipTarget';
import { useGuidedTour } from '../tooltips/useGuidedTour';
import { QUESTION_TOUR, QUESTION_TOOLTIP_IDS } from '../tooltips/tooltipRegistry';
import { useStrings } from '../i18n/useStrings';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PromptSelector } from '../components/PromptSelector';
import type { PromptSelectionControl } from '../promptSelection';

interface Props {
  questionNumber: number;
  totalQuestions: number;
  // The current question's own vo_playback_url (API_CONTRACT.md) - a fresh
  // presigned S3 URL fetched from GET /distributors/me/questions, already
  // localized server-side. Not bundled/local and not cached beyond however
  // long the question list itself is cached - `undefined` while questions
  // are still loading, same "no audio" fallback as a question with no
  // clip.
  voPlaybackUrl?: string;
  questionText: string;
  promptSelection: PromptSelectionControl;
  onStartRecording: () => void;
  onRehearse: () => void;
  onBack?: () => void;
}

// Placeholder sample-answer clips (design 2D) - same convention as Home's
// hardcoded HOW_TO_VIDEOS/SAMPLE_VIDEOS, no playback wired yet, no backend
// source for these exists. Cycles across a few company-produced examples so
// it doesn't look identical on every question.
const SAMPLE_ANSWERS: { name: string; business: string; duration: string }[] = [
  { name: 'Suresh', business: 'Patil Enterprises, Kolhapur', duration: '0:38' },
  { name: 'Deepak', business: 'Bansal Hardware, Indore', duration: '0:44' },
  { name: 'Ritu', business: 'Sharma & Sons, Jaipur', duration: '0:41' },
  { name: 'Anil', business: 'Verma Traders, Lucknow', duration: '0:52' },
  { name: 'Kavita', business: 'Joshi Retail, Pune', duration: '0:36' },
];

// Replaces the old QuestionIntroOverlay breather - a real prep screen
// (design 2D) shown before every take, always requiring an explicit tap to
// proceed (either Start recording or Rehearse), never auto-advancing.
export function QuestionBriefScreen({
  questionNumber,
  totalQuestions,
  voPlaybackUrl,
  questionText,
  promptSelection,
  onStartRecording,
  onRehearse,
  onBack,
}: Props) {
  const { colors, spacing, radius, typography } = useTheme();
  const styles = useMemo(() => makeStyles(colors, spacing, radius, typography), [colors, spacing, radius, typography]);
  const { t } = useStrings();
  const insets = useSafeAreaInsets();

  // undefined (not a missing key in a map) while questions are still
  // loading or a question genuinely has no VO - useVideoPlayer accepts a
  // null/undefined source and stays inert, so that falls back to plain
  // text rather than crashing or blocking anything (CLAUDE.md).
  const audioSource = voPlaybackUrl ?? null;
  const player = useVideoPlayer(audioSource);
  // Reflects the player's actual playing state, not a separately-tracked
  // boolean - the previous version set a local `readToMe` flag on tap and
  // only ever cleared it on another tap, so "Reading..." stayed stuck once
  // the clip finished on its own (nothing was listening for that). Reading
  // it straight from the player via useEvent means there's only one source
  // of truth, so this can't drift out of sync with reality again.
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const [showPrepTips, setShowPrepTips] = useState(false);
  const [editingPrompts, setEditingPrompts] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const scrollOffset = useRef(0);
  const hasAudio = audioSource != null;
  // Even a question without backend prompts can accept a custom reminder.
  const tourIds = useMemo(() => QUESTION_TOOLTIP_IDS.filter(id => id !== 'question.audio' || hasAudio), [hasAudio]);
  useGuidedTour(QUESTION_TOUR, tourIds, questionText.length > 0);
  const sampleAnswer = SAMPLE_ANSWERS[(questionNumber - 1) % SAMPLE_ANSWERS.length];

  // Same "shared object already released" risk as CameraCheckScreen.tsx's
  // safePause() (see that file's comment for the mechanism) - lower odds
  // here since this fires from a direct tap rather than an unmount
  // cleanup, but the native call can still throw synchronously if the
  // player was torn down (e.g. navigating away right as this fires).
  function toggleReadToMe() {
    if (audioSource == null) return;
    try {
      if (isPlaying) {
        player.pause();
      } else {
        player.currentTime = 0;
        player.play();
      }
    } catch (error) {
      console.warn('[question-brief] VO toggle failed', error);
    }
  }

  function pauseQuestion() {
    try { player.pause(); }
    catch (error) { console.warn('[question-brief] VO pause failed', error); }
  }

  function requestRecording() {
    pauseQuestion();
    if (hasSeenTip('questionRecordingPrep')) onStartRecording();
    else setShowPrepTips(true);
  }

  function leavePrepTips(next: () => void) {
    try { markTipSeen('questionRecordingPrep'); }
    catch (error) { console.warn('[question-brief] could not save tips preference', error); }
    setShowPrepTips(false);
    next();
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.topRow}>
        {onBack && (
          <Pressable style={styles.backRow} onPress={onBack} hitSlop={8}>
            <Text style={styles.backChevron}>‹</Text>
            <Text style={styles.backText}>{t('questionBrief.backButton')}</Text>
          </Pressable>
        )}
        <HelpButton tourId={QUESTION_TOUR} tooltipIds={tourIds} onReplay={pauseQuestion} />
      </View>

      <ScrollView ref={scrollRef} onScroll={event => { scrollOffset.current = event.nativeEvent.contentOffset.y; }} scrollEventThrottle={16} removeClippedSubviews={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" style={{ flex: 1 }} contentContainerStyle={styles.scrollContent}>
        <View style={styles.questionHeaderRow}>
          <Text style={styles.questionNumberLabel}>{t('questionBrief.questionNumberLabel', { number: questionNumber })}</Text>
        </View>
        <TooltipTarget id="question.text" scrollRef={scrollRef} scrollOffset={scrollOffset}>
        <Text
          style={[styles.title, containsDevanagari(questionText) && { fontFamily: devanagariFontFamily('700') }]}
        >
          {questionText}
        </Text>
        </TooltipTarget>
        {audioSource != null && (
          <TooltipTarget id="question.audio" scrollRef={scrollRef} scrollOffset={scrollOffset} style={{ alignSelf: 'flex-start' }}>
            <Pressable
              accessibilityRole="button"
              style={[styles.readToMe, isPlaying && styles.readToMeActive]}
              onPress={toggleReadToMe}
            >
              <MicIcon color={isPlaying ? colors.accentText : colors.accent} />
              <Text style={[styles.readToMeText, isPlaying && styles.readToMeTextActive]}>
                {isPlaying ? t('questionBrief.readToMeActive') : t('questionBrief.readToMeIdle')}
              </Text>
            </Pressable>
          </TooltipTarget>
        )}

        <TooltipTarget id="question.points" scrollRef={scrollRef} scrollOffset={scrollOffset}>
            <PromptSelector {...promptSelection} onBeginAdd={() => { pauseQuestion(); setEditingPrompts(true); }} onEndAdd={() => setEditingPrompts(false)} />
        </TooltipTarget>

        {__DEV__ && <>
        <View style={styles.sampleRow}>
          <View style={styles.sampleThumb}>
            <View style={styles.sampleThumbPlay}>
              <Text style={styles.sampleThumbPlayGlyph}>▶</Text>
            </View>
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.sampleTitle}>{t('questionBrief.sampleAnswerTitle', { name: sampleAnswer.name })}</Text>
            <Text style={styles.sampleSubtitle}>
              {sampleAnswer.business} · {sampleAnswer.duration}
            </Text>
          </View>
        </View>

        </>}

        <Button label={t('questionBrief.recordingTipsLink')} onPress={() => setShowPrepTips(true)} variant="quiet" />
      </ScrollView>

      {!editingPrompts && <TooltipTarget id="question.actions" style={[styles.actions, { paddingBottom: insets.bottom + spacing.edgeGap + spacing.footerGap }]}>
        <Button label={t('questionBrief.startRecordingButton')} onPress={requestRecording} />
        <Button label={t('questionBrief.rehearseButton')} onPress={onRehearse} variant="secondary" />
      </TooltipTarget>}
      <PopupSheet visible={showPrepTips} onDismiss={() => setShowPrepTips(false)}>
        <Text style={styles.prepTitle}>{t('questionBrief.prepTitle')}</Text>
        <ScrollView style={styles.prepPoints}>
          {[1, 2, 3, 4].map((number) => (
            <View key={number} style={styles.prepPoint}>
              <Text style={styles.pointNumber}>{number}</Text>
              <Text style={styles.prepText}>{t(`questionBrief.prepPoint${number}`)}</Text>
            </View>
          ))}
        </ScrollView>
        <View style={{ gap: spacing.sm }}>
          <Button label={t('questionBrief.prepContinue')} onPress={() => leavePrepTips(onStartRecording)} />
          <Button label={t('questionBrief.rehearseButton')} onPress={() => leavePrepTips(onRehearse)} variant="secondary" />
        </View>
      </PopupSheet>
    </KeyboardAvoidingView>
  );
}

// Small mic silhouette (capsule + stem + base) for the "Read to me" chip -
// same shape convention PermissionsScreen's mic icon already uses, just
// scaled down to sit inline in a pill instead of its own icon tile.
function MicIcon({ color }: { color: string }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ width: 8, height: 12, borderRadius: 4, backgroundColor: color }} />
      <View style={{ width: 1.5, height: 3, backgroundColor: color, marginTop: 1 }} />
      <View style={{ width: 8, height: 1.5, borderRadius: 1, backgroundColor: color, marginTop: 1 }} />
    </View>
  );
}

function makeStyles(colors: PaletteColors, spacing: Spacing, radius: Radius, typography: Typography) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, paddingTop: spacing.xl + spacing.topExtra },
    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.xl,
    },
    // One tappable row (arrow + label together) instead of a lone
    // arrow-only hit target beside inert "Getting ready" text - the label
    // now says what the tap does.
    backRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
    // Explicit matching lineHeight on both so alignItems:'center' has
    // identical boxes to center - without it the two default line-heights
    // (tied to each Text's own fontSize) disagree and the row centers them
    // against different heights. The glyph itself still sits low within
    // its own box regardless (a `‹` character's natural vertical metrics,
    // not a layout bug), so a small negative marginTop nudges it the rest
    // of the way to actually look centered next to the label text.
    backChevron: { fontSize: 22, fontWeight: '700', color: colors.text, lineHeight: 22, marginTop: -2 },
    backText: { fontSize: 15, fontWeight: '600', color: colors.text, lineHeight: 22 },
    questionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    // Always accent-tinted, not just while playing - the old muted-grey
    // idle state read as inert label text, not a control worth tapping.
    readToMe: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: 999,
      borderWidth: 1.5,
      borderColor: colors.accent,
      backgroundColor: colors.accentSoft,
      paddingVertical: 7,
      paddingHorizontal: 13,
    },
    readToMeActive: { backgroundColor: colors.accent },
    readToMeText: { fontSize: 13, fontWeight: '700', color: colors.accent },
    readToMeTextActive: { color: colors.accentText },
    scrollContent: { padding: spacing.xl, paddingTop: spacing.lg, gap: spacing.md },
    questionNumberLabel: {
      fontSize: 11.5,
      letterSpacing: 1.8,
      textTransform: 'uppercase',
      color: colors.accent,
      fontWeight: '700',
    },
    title: {
      ...typography.title,
      fontSize: 26,
      color: colors.text,
      lineHeight: 33,
      marginTop: -4,
    },
    sectionLabel: {
      fontSize: 11.5,
      letterSpacing: 1.8,
      textTransform: 'uppercase',
      color: colors.textFaint,
      fontWeight: '700',
      marginTop: spacing.sm,
      marginBottom: spacing.sm,
    },
    pointNumber: { fontSize: 13.5, fontWeight: '700', color: colors.accent, width: 16 },
    sampleRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
    sampleThumb: {
      width: 58,
      height: 76,
      borderRadius: radius.md,
      backgroundColor: '#2B2521',
      alignItems: 'center',
      justifyContent: 'center',
    },
    sampleThumbPlay: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: 'rgba(255,255,255,0.94)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    sampleThumbPlayGlyph: { fontSize: 11, color: '#241E1A', marginLeft: 2 },
    sampleTitle: { ...typography.body, fontSize: 15.5, fontWeight: '600', color: colors.text },
    sampleSubtitle: { ...typography.caption, fontSize: 13, color: colors.textFaint },
    prepTitle: { ...typography.title, fontSize: 22, color: colors.text, marginBottom: spacing.md },
    prepPoints: { maxHeight: 300, marginBottom: spacing.lg },
    prepPoint: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
    prepText: { ...typography.body, color: colors.text, flex: 1, lineHeight: 24 },
    actions: { padding: spacing.xl, paddingTop: spacing.md, gap: spacing.sm },
  });
}
