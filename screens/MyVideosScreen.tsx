import { useMemo } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { PlayableVideo } from './VideoPlayerScreen';
import type { UserFacingStatus } from '../myVideos';
import { useTheme } from '../theme/ThemeContext';
import type { PaletteColors } from '../theme/palettes';
import type { Spacing } from '../theme/spacing';
import type { Radius } from '../theme/radius';
import type { Typography } from '../theme/typography';
import { Button } from '../components/ui/Button';
import { Carousel } from '../components/ui/Carousel';

export interface AnswerRow {
  questionIndex: number;
  label: string;
  play: PlayableVideo;
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
  totalQuestions: number;
  answers: AnswerRow[];
  branded: BrandedRow[];
  /** Whether there's anything local worth (re-)sending - drives the header upload button. */
  hasPendingUpload: boolean;
  onPressAnswer: (row: AnswerRow) => void;
  onPressBranded: (row: BrandedRow) => void;
  // Caller shows a confirmation prompt before entering the camera flow -
  // this just reports the tap. Used both for "record this one" (not yet
  // answered) and "change" (already answered).
  onRetake: (questionIndex: number) => void;
  onUploadAll: () => void;
}

const STATUS_LABEL: Record<UserFacingStatus, string> = {
  processing: 'Processing',
  ready: 'Ready',
  failed: 'Failed',
};

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
  totalQuestions,
  answers,
  branded,
  hasPendingUpload,
  onPressAnswer,
  onPressBranded,
  onRetake,
  onUploadAll,
}: Props) {
  const { colors, spacing, radius, typography } = useTheme();
  const styles = useMemo(() => makeStyles(colors, spacing, radius, typography), [colors, spacing, radius, typography]);

  if (error) {
    return (
      <View style={styles.centeredContainer}>
        <Text style={styles.errorTitle}>Couldn't load your videos</Text>
        <Text style={styles.errorSubtitle}>{error}</Text>
        <Button label="Try again" onPress={onRetryLoad} variant="secondary" style={{ marginTop: spacing.lg }} />
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

  const hasAnyReady = branded.some((b) => b.status === 'ready');

  const answersSection = (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>Your answers</Text>
      <View style={styles.rowsCard}>
        {Array.from({ length: totalQuestions }).map((_, questionIndex) => {
          const answer = answers.find((a) => a.questionIndex === questionIndex);
          const isLast = questionIndex === totalQuestions - 1;
          return (
            <View key={questionIndex} style={[styles.row, !isLast && styles.rowDivider]}>
              <View style={styles.rowIndex}>
                <Text style={styles.rowIndexText}>{questionIndex + 1}</Text>
              </View>
              <Text style={styles.rowLabel} onPress={answer ? () => onPressAnswer(answer) : undefined}>
                {answer ? `Question ${questionIndex + 1}` : `Question ${questionIndex + 1} · not recorded yet`}
              </Text>
              {answer ? (
                <Text style={styles.changeText} onPress={() => onRetake(questionIndex)}>
                  Change
                </Text>
              ) : (
                <Button label="Record" onPress={() => onRetake(questionIndex)} variant="quiet" />
              )}
            </View>
          );
        })}
      </View>
    </View>
  );

  const brandedSection = (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>Your branded videos</Text>
      {branded.length === 0 ? (
        <View style={styles.emptyBrandedCard}>
          <View style={styles.emptyBrandedThumb} />
          <Text style={styles.emptyBrandedText}>
            Your branded videos will appear here once every answer has been sent and made.
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
        <View>
          <Text style={styles.title}>My videos</Text>
          {hasPendingUpload && <Text style={styles.headerSubtitle}>You have answers not sent yet</Text>}
        </View>
        {hasPendingUpload && <Button label="Upload" onPress={onUploadAll} variant="secondary" />}
      </View>

      {hasAnyReady ? (
        <>
          {brandedSection}
          {answersSection}
        </>
      ) : (
        <>
          {answersSection}
          {brandedSection}
        </>
      )}
    </ScrollView>
  );
}

function makeStyles(colors: PaletteColors, spacing: Spacing, radius: Radius, typography: Typography) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.lg },
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
    rowsCard: {
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      paddingHorizontal: spacing.md - 2,
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4, minHeight: 56, paddingVertical: spacing.xs },
    rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.canvas },
    rowIndex: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: colors.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowIndexText: { fontSize: 13, fontWeight: '700', color: colors.accentStrong },
    rowLabel: { ...typography.body, fontSize: 14.5, fontWeight: '600', color: colors.text, flex: 1 },
    changeText: { fontSize: 13.5, fontWeight: '700', color: colors.accent },
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
