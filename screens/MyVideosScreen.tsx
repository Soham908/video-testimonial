import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { PlayableVideo } from './VideoPlayerScreen';
import type { UserFacingStatus } from '../myVideos';
import { useTheme } from '../theme/ThemeContext';
import type { PaletteColors } from '../theme/palettes';
import type { Spacing } from '../theme/spacing';
import type { Radius } from '../theme/radius';
import type { Typography } from '../theme/typography';
import { Button } from '../components/ui/Button';
import { Carousel } from '../components/ui/Carousel';
import { containsDevanagari, devanagariFontFamily } from '../theme/fonts';
import { useStrings } from '../i18n/useStrings';

export interface AnswerRow {
  questionIndex: number;
  label: string;
  questionText: string;
  play: PlayableVideo;
  // 1 or 2 entries pre-upload (a primary plus a runner-up kept alongside
  // it - AppFlow.tsx's take-keeping flow), always exactly 1 once a segment
  // has superseded local (the runner-up's file is deleted right after a
  // successful upload - there's nothing left to choose between at that
  // point). `play` always mirrors whichever entry here is primary.
  takes: { id: string; play: PlayableVideo; durationSeconds: number }[];
  // True once this question's row was built from a server-confirmed
  // segment (AppFlow.tsx's segments merge), not just a local recording -
  // the source of truth for "has this actually been sent," not a local
  // session flag. Retake isn't offered once true, since re-upload after an
  // already-confirmed segment isn't supported yet.
  uploaded: boolean;
}

export interface BrandedRow {
  questionIndex: number;
  label: string;
  status: UserFacingStatus;
  play: PlayableVideo | null;
}

interface Props {
  loading: boolean;
  error: string | null;
  onRetryLoad: () => void;
  // One entry per question, in order - replaces the old plain
  // totalQuestions count now that each row shows the real question text,
  // not just its number. Length is the count.
  questionTexts: string[];
  answers: AnswerRow[];
  branded: BrandedRow[];
  // When false (this build's default - see config.ts), no render job is
  // ever created server-side, so `branded` is always empty. Hides the
  // branded section entirely rather than showing its normal empty state,
  // which promises reels "will appear here" - not true for this build.
  reelRenderingEnabled: boolean;
  onPressAnswer: (row: AnswerRow) => void;
  onPressBranded: (row: BrandedRow) => void;
  // Caller shows a confirmation prompt before entering the camera flow -
  // this just reports the tap. Used both for "record this one" (not yet
  // answered) and "record another take" (already answered, from the
  // expanded panel).
  onRetake: (questionIndex: number) => void;
  // Jumps straight into Review & Trim for this question's already-saved
  // takes - no camera, no re-recording. Only offered pre-upload (see the
  // `!answer.uploaded` gate below) - there's nothing left to edit once a
  // segment is already confirmed server-side.
  onEditTakes: (questionIndex: number) => void;
  // Purely local - switches which of a question's up to 2 kept takes is
  // primary (no camera, no network). Only meaningful while a row has more
  // than one entry in `takes`.
  onSwitchPrimary: (questionIndex: number, takeId: string) => void;
  onUploadAll: () => void;
}

// Design screens 6C (branded reels as a carousel) + 6E (no take
// thumbnails - a recorded row just says which take is chosen and offers
// Change; a missing row carries the only button that looks like a
// button). Post-render, the branded section moves above the answers
// (DECISIONS.md: "flips post-render, reels on top, questions below").
// Backed by GET /distributors/me/segments + GET
// /distributors/me/rendered-videos per API_CONTRACT.md.
export function MyVideosScreen({
  loading,
  error,
  onRetryLoad,
  questionTexts,
  answers,
  branded,
  reelRenderingEnabled,
  onPressAnswer,
  onPressBranded,
  onRetake,
  onEditTakes,
  onSwitchPrimary,
  onUploadAll,
}: Props) {
  const { colors, spacing, radius, typography } = useTheme();
  const styles = useMemo(() => makeStyles(colors, spacing, radius, typography), [colors, spacing, radius, typography]);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const { t } = useStrings();

  const STATUS_LABEL: Record<UserFacingStatus, string> = {
    processing: t('myVideos.statusProcessing'),
    ready: t('myVideos.statusReady'),
    failed: t('myVideos.statusFailed'),
  };

  if (error) {
    return (
      <View style={styles.centeredContainer}>
        <Text style={styles.errorTitle}>{t('myVideos.errorTitle')}</Text>
        <Text style={styles.errorSubtitle}>{error}</Text>
        <Button label={t('myVideos.tryAgainButton')} onPress={onRetryLoad} variant="secondary" style={{ marginTop: spacing.lg }} />
      </View>
    );
  }

  if (loading && answers.length === 0 && branded.length === 0) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  const hasAnyReady = reelRenderingEnabled && branded.some((b) => b.status === 'ready');

  const answersSection = (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{t('myVideos.answersSectionTitle')}</Text>
      <View style={styles.rowsCard}>
        {questionTexts.map((questionText, questionIndex) => {
          const answer = answers.find((a) => a.questionIndex === questionIndex);
          return (
            <AnswerRowCard
              key={questionIndex}
              questionIndex={questionIndex}
              questionText={questionText}
              answer={answer}
              expanded={expandedIndex === questionIndex}
              onToggleExpand={() => setExpandedIndex((prev) => (prev === questionIndex ? null : questionIndex))}
              onPressAnswer={onPressAnswer}
              onRetake={onRetake}
              onEditTakes={onEditTakes}
              onSwitchPrimary={onSwitchPrimary}
              styles={styles}
              colors={colors}
            />
          );
        })}
      </View>
    </View>
  );

  const brandedSection = (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{t('myVideos.brandedSectionTitle')}</Text>
      {branded.length === 0 ? (
        <View style={styles.emptyBrandedCard}>
          <View style={styles.emptyBrandedThumb} />
          <Text style={styles.emptyBrandedText}>
            {t('myVideos.emptyBrandedText')}
          </Text>
        </View>
      ) : (
        <Carousel>
          {branded.map((row) => (
            <View
              key={row.questionIndex}
              onTouchEnd={() => row.status === 'ready' && onPressBranded(row)}
              style={styles.brandedCard}
            >
              <View style={styles.brandedThumb}>
                {row.status === 'ready' && <View style={styles.playCircle}><View style={styles.playTriangle} /></View>}
              </View>
              <Text style={styles.brandedLabel}>{row.label}</Text>
              <View
                style={[
                  styles.statusPill,
                  row.status === 'processing' && { backgroundColor: colors.processingSoft },
                  row.status === 'failed' && { backgroundColor: colors.dangerSoft },
                ]}
              >
                <Text
                  style={[
                    styles.statusPillText,
                    row.status === 'failed' && { color: colors.danger },
                  ]}
                >
                  {STATUS_LABEL[row.status]}
                </Text>
              </View>
            </View>
          ))}
        </Carousel>
      )}
    </View>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{t('myVideos.title')}</Text>
          <Text style={styles.headerSubtitle}>{t('myVideos.headerSubtitle')}</Text>
        </View>
        <Button label={t('myVideos.uploadButton')} onPress={onUploadAll} />
      </View>

      {hasAnyReady ? (
        <>
          {brandedSection}
          {answersSection}
        </>
      ) : (
        <>
          {answersSection}
          {reelRenderingEnabled && brandedSection}
        </>
      )}
    </ScrollView>
  );
}

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Collapsed: index, question clipped to 2 lines, a play button (plays the
// primary take directly - separate tap target from the row itself, via
// its own Pressable so it doesn't also toggle expand), a chevron. Tapping
// the row anywhere else expands it in place - same accordion mechanism
// Question Brief's Dropdown already uses, not a new pattern for the app to
// carry. Expanded: full question text, a take picker (only when there are
// 2 kept takes - AppFlow.tsx's take-keeping flow), and Retake/Record
// another take.
function AnswerRowCard({
  questionIndex,
  questionText,
  answer,
  expanded,
  onToggleExpand,
  onPressAnswer,
  onRetake,
  onEditTakes,
  onSwitchPrimary,
  styles,
  colors,
}: {
  questionIndex: number;
  questionText: string;
  answer: AnswerRow | undefined;
  expanded: boolean;
  onToggleExpand: () => void;
  onPressAnswer: (row: AnswerRow) => void;
  onRetake: (questionIndex: number) => void;
  onEditTakes: (questionIndex: number) => void;
  onSwitchPrimary: (questionIndex: number, takeId: string) => void;
  styles: ReturnType<typeof makeStyles>;
  colors: PaletteColors;
}) {
  const devanagariStyle = containsDevanagari(questionText) ? { fontFamily: devanagariFontFamily('600') } : undefined;
  const { t } = useStrings();

  if (!answer) {
    return (
      <View style={styles.row}>
        <View style={styles.rowTop}>
          <View style={[styles.rowIndex, styles.rowIndexMuted]}>
            <Text style={[styles.rowIndexText, styles.rowIndexTextMuted]}>{questionIndex + 1}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowQuestionText, devanagariStyle]} numberOfLines={1}>
              {questionText}
            </Text>
            <Text style={styles.rowMeta}>{t('myVideos.notRecordedYet')}</Text>
          </View>
          <Button label={t('myVideos.recordButton')} onPress={() => onRetake(questionIndex)} variant="quiet" />
        </View>
      </View>
    );
  }

  // Primary is always index 0 by construction (AppFlow.tsx sorts it there
  // when building `takes`).
  const primaryTake = answer.takes[0];
  const hasTwoTakes = answer.takes.length > 1;

  return (
    <View style={styles.row}>
      <Pressable style={styles.rowTop} onPress={onToggleExpand}>
        <View style={styles.rowIndex}>
          <Text style={styles.rowIndexText}>{questionIndex + 1}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowQuestionText, devanagariStyle]} numberOfLines={expanded ? undefined : 1}>
            {questionText}
          </Text>
          {!expanded && (
            <Text style={styles.rowMeta}>
              {formatTime(primaryTake?.durationSeconds ?? 0)}{' '}
              {answer.uploaded
                ? t('myVideos.metaUploaded')
                : hasTwoTakes
                  ? t('myVideos.metaTakesSaved', { count: answer.takes.length })
                  : t('myVideos.metaRecorded')}
            </Text>
          )}
        </View>
        <Pressable
          style={styles.playButton}
          onPress={(e) => {
            e.stopPropagation();
            onPressAnswer(answer);
          }}
        >
          <View style={styles.playTriangleSmall} />
        </Pressable>
        <Text style={styles.rowChevron}>{expanded ? '⌃' : '⌄'}</Text>
      </Pressable>

      {expanded && (
        <View style={styles.expandPanel}>
          {answer.uploaded ? (
            <Text style={styles.uploadedNote}>
              {t('myVideos.uploadedNote')}
            </Text>
          ) : (
            <>
              {hasTwoTakes && (
                <>
                  <Text style={styles.takesLabel}>{t('myVideos.chooseTakeLabel')}</Text>
                  <Carousel style={{ flexGrow: 0 }}>
                    {answer.takes.map((take, i) => {
                      const isPrimary = i === 0;
                      return (
                        <Pressable
                          key={take.id}
                          onPress={() => onSwitchPrimary(questionIndex, take.id)}
                          style={[styles.takeCard, { borderColor: isPrimary ? colors.accent : colors.border }]}
                        >
                          <View style={styles.takeCardPlay}>
                            <View style={styles.playTriangleTiny} />
                          </View>
                          <Text style={styles.takeCardDuration}>{formatTime(take.durationSeconds)}</Text>
                          {isPrimary && (
                            <View style={styles.takeCardCheck}>
                              <Text style={styles.takeCardCheckGlyph}>✓</Text>
                            </View>
                          )}
                        </Pressable>
                      );
                    })}
                  </Carousel>
                </>
              )}
              <View style={styles.actionLinkRow}>
                <Text style={styles.retakeText} onPress={() => onEditTakes(questionIndex)}>
                  {hasTwoTakes ? t('myVideos.editTakesLink') : t('myVideos.editTakeLink')}
                </Text>
                <Text style={styles.retakeText} onPress={() => onRetake(questionIndex)}>
                  {hasTwoTakes ? t('myVideos.recordAnotherTakeLink') : t('myVideos.retakeLink')}
                </Text>
              </View>
            </>
          )}
        </View>
      )}
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
      gap: spacing.lg,
    },
    centeredContainer: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
    errorTitle: { ...typography.title, fontSize: 22, color: colors.text, textAlign: 'center', marginBottom: spacing.sm },
    errorSubtitle: { ...typography.body, color: colors.textMuted, textAlign: 'center', lineHeight: 22 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    title: { ...typography.title, fontSize: 24, color: colors.text },
    headerSubtitle: { ...typography.caption, color: colors.textFaint, marginTop: 2 },
    section: { gap: spacing.sm },
    sectionLabel: {
      fontSize: 11.5,
      letterSpacing: 1.8,
      textTransform: 'uppercase',
      color: colors.textFaint,
      fontWeight: '700',
    },
    // Each question is its own bordered card now (row below), not one big
    // bordered box with divider lines between entries - this is just the
    // vertical gap holding that list of cards together.
    rowsCard: { gap: spacing.sm },
    row: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      paddingHorizontal: spacing.md - 2,
      paddingTop: spacing.sm + 4,
      paddingBottom: spacing.xs,
    },
    rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4, minHeight: 56 },
    rowIndex: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: colors.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowIndexMuted: { backgroundColor: colors.canvas },
    rowIndexText: { fontSize: 13, fontWeight: '700', color: colors.accentStrong },
    rowIndexTextMuted: { color: colors.textFaint },
    rowQuestionText: { ...typography.body, fontSize: 14.5, fontWeight: '600', color: colors.text, lineHeight: 20 },
    rowMeta: { ...typography.caption, fontSize: 12, color: colors.textFaint, marginTop: 2 },
    playButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.text,
      alignItems: 'center',
      justifyContent: 'center',
    },
    playTriangleSmall: {
      width: 0,
      height: 0,
      borderTopWidth: 5,
      borderBottomWidth: 5,
      borderLeftWidth: 8,
      borderTopColor: 'transparent',
      borderBottomColor: 'transparent',
      borderLeftColor: '#FFFFFF',
      marginLeft: 2,
    },
    rowChevron: { color: colors.accent, fontSize: 14 },
    expandPanel: {
      paddingLeft: 30 + spacing.sm + 4,
      paddingRight: spacing.xs,
      paddingBottom: spacing.sm,
      paddingTop: spacing.xs,
      gap: spacing.sm - 2,
    },
    takesLabel: {
      fontSize: 10.5,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      color: colors.textFaint,
      fontWeight: '700',
    },
    takeCard: {
      width: 60,
      height: 78,
      borderRadius: radius.sm + 2,
      borderWidth: 2,
      backgroundColor: '#1E211F',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    },
    takeCardPlay: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: 'rgba(255,255,255,0.95)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    playTriangleTiny: {
      width: 0,
      height: 0,
      borderTopWidth: 4,
      borderBottomWidth: 4,
      borderLeftWidth: 6,
      borderTopColor: 'transparent',
      borderBottomColor: 'transparent',
      borderLeftColor: '#241E1A',
      marginLeft: 1,
    },
    takeCardDuration: { position: 'absolute', bottom: 4, fontSize: 9.5, fontWeight: '700', color: 'rgba(255,255,255,0.9)' },
    takeCardCheck: {
      position: 'absolute',
      top: 4,
      right: 4,
      width: 14,
      height: 14,
      borderRadius: 7,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    takeCardCheckGlyph: { fontSize: 8, fontWeight: '700', color: colors.accentText },
    actionLinkRow: { flexDirection: 'row', gap: spacing.lg, marginTop: 2 },
    retakeText: { fontSize: 13, fontWeight: '700', color: colors.accent },
    uploadedNote: { fontSize: 13, color: colors.textFaint, lineHeight: 18 },
    emptyBrandedCard: {
      borderWidth: 1.5,
      borderColor: colors.borderStrong,
      borderStyle: 'dashed',
      borderRadius: radius.lg,
      padding: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm + 2,
    },
    emptyBrandedThumb: { width: 44, height: 58, borderRadius: 9, backgroundColor: colors.canvas },
    emptyBrandedText: { ...typography.caption, color: colors.textFaint, flex: 1, lineHeight: 19 },
    brandedCard: {
      width: 128,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      padding: spacing.sm,
      gap: spacing.xs + 1,
    },
    brandedThumb: {
      height: 90,
      borderRadius: radius.md - 2,
      backgroundColor: '#1E211F',
      alignItems: 'center',
      justifyContent: 'center',
    },
    playCircle: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
    playTriangle: {
      width: 0,
      height: 0,
      borderTopWidth: 6,
      borderBottomWidth: 6,
      borderLeftWidth: 10,
      borderTopColor: 'transparent',
      borderBottomColor: 'transparent',
      borderLeftColor: '#241E1A',
      marginLeft: 3,
    },
    brandedLabel: { fontSize: 12.5, fontWeight: '700', color: colors.text },
    statusPill: {
      alignSelf: 'flex-start',
      backgroundColor: colors.accentSoft,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
    },
    statusPillText: { fontSize: 10.5, fontWeight: '700', color: colors.accentStrong },
  });
}
