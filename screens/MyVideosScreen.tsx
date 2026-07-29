import { ActivityIndicator, ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import type { PlayableVideo } from './VideoPlayerScreen';
import type { UserFacingStatus } from '../myVideos';
import { colors, radius, spacing, typography } from '../theme';

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
  answers: AnswerRow[];
  branded: BrandedRow[];
  onPressAnswer: (row: AnswerRow) => void;
  onPressBranded: (row: BrandedRow) => void;
  // Caller shows a confirmation prompt before entering the camera flow -
  // this just reports the tap.
  onRetake: (questionIndex: number) => void;
}

const STATUS_LABEL: Record<UserFacingStatus, string> = {
  processing: 'Processing',
  ready: 'Ready',
  failed: 'Failed',
};

// Design screen 2b. Backed by GET /distributors/me/segments (answers) and
// GET /distributors/me/rendered-videos (branded reels) per API_CONTRACT.md -
// raw answer status always reads "Ready" once listed at all, since a
// segment appearing here already means it's durably uploaded; backend
// `failed` on a segment is about the (invisible-to-the-user) transcription
// pipeline, not the video itself. The branded section is the one place
// with a real processing/ready/failed distinction worth showing.
export function MyVideosScreen({
  loading,
  error,
  onRetryLoad,
  answers,
  branded,
  onPressAnswer,
  onPressBranded,
  onRetake,
}: Props) {
  if (error) {
    return (
      <View style={styles.centeredContainer}>
        <Text style={styles.errorTitle}>Couldn't load your videos</Text>
        <Text style={styles.errorSubtitle}>{error}</Text>
        <Pressable style={styles.retryButton} onPress={onRetryLoad}>
          <Text style={styles.retryButtonText}>Try again</Text>
        </Pressable>
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

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <Text style={styles.title}>My videos</Text>

      <Text style={styles.sectionLabel}>YOUR ANSWERS</Text>
      {answers.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>
            You haven't recorded any answers yet.
          </Text>
        </View>
      ) : (
        <View style={styles.answersCard}>
          {answers.map((row, index) => (
            <Pressable
              key={row.questionIndex}
              style={[
                styles.answerRow,
                index < answers.length - 1 && styles.answerRowDivider,
              ]}
              onPress={() => onPressAnswer(row)}
            >
              <View style={styles.answerIndex}>
                <Text style={styles.answerIndexText}>{index + 1}</Text>
              </View>
              <Text style={styles.answerLabel}>{row.label}</Text>
              <View style={styles.statusPill}>
                <Text style={styles.statusPillText}>Ready</Text>
              </View>
              <Pressable onPress={() => onRetake(row.questionIndex)} hitSlop={8}>
                <Text style={styles.retakeText}>Retake</Text>
              </Pressable>
            </Pressable>
          ))}
        </View>
      )}

      <Text style={styles.sectionLabel}>YOUR BRANDED VIDEO</Text>
      {branded.length === 0 ? (
        <View style={styles.brandedCard}>
          <View style={styles.brandedThumb}>
            <View style={styles.playCircle}>
              <View style={styles.playTriangle} />
            </View>
          </View>
          <Text style={styles.brandedHint}>
            Your branded video will appear here once it's ready.
          </Text>
        </View>
      ) : (
        <View style={styles.answersCard}>
          {branded.map((row, index) => {
            const pillStyle =
              row.status === 'ready'
                ? styles.statusPill
                : row.status === 'failed'
                  ? styles.statusPillDanger
                  : styles.statusPillProcessing;
            const pillTextStyle =
              row.status === 'failed' ? styles.statusPillTextDanger : styles.statusPillText;

            return (
              <Pressable
                key={row.questionIndex}
                style={[
                  styles.answerRow,
                  index < branded.length - 1 && styles.answerRowDivider,
                ]}
                onPress={() => onPressBranded(row)}
                disabled={row.status !== 'ready'}
              >
                <View style={styles.answerIndex}>
                  <Text style={styles.answerIndexText}>{index + 1}</Text>
                </View>
                <Text style={styles.answerLabel}>{row.label}</Text>
                <View style={pillStyle}>
                  <Text style={pillTextStyle}>{STATUS_LABEL[row.status]}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  centeredContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  errorTitle: {
    ...typography.title,
    fontSize: 22,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  errorSubtitle: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
  retryButton: {
    height: 52,
    paddingHorizontal: spacing.xl,
    borderWidth: 2,
    borderColor: colors.accent,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  retryButtonText: {
    ...typography.button,
    fontSize: 16,
    color: colors.accent,
  },
  title: {
    ...typography.title,
    fontSize: 24,
    color: colors.text,
  },
  sectionLabel: {
    ...typography.label,
    color: colors.textFaint,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  emptyCard: {
    padding: spacing.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  emptyText: {
    ...typography.body,
    color: colors.textFaint,
    textAlign: 'center',
  },
  answersCard: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md - 2,
  },
  answerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    height: 52,
  },
  answerRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.canvas,
  },
  answerIndex: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  answerIndexText: {
    ...typography.body,
    fontSize: 14,
    fontWeight: '700',
    color: colors.accentStrong,
  },
  answerLabel: {
    ...typography.body,
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },
  statusPill: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
  },
  statusPillProcessing: {
    backgroundColor: colors.processingSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
  },
  statusPillDanger: {
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
  },
  statusPillText: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '700',
    color: colors.accentStrong,
  },
  statusPillTextDanger: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '700',
    color: colors.danger,
  },
  retakeText: {
    ...typography.body,
    fontSize: 13.5,
    fontWeight: '700',
    color: colors.accent,
  },
  brandedCard: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    padding: spacing.md - 4,
  },
  brandedThumb: {
    height: 130,
    borderRadius: radius.md - 2,
    backgroundColor: '#1E211F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playTriangle: {
    width: 0,
    height: 0,
    borderTopWidth: 8,
    borderBottomWidth: 8,
    borderLeftWidth: 13,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: colors.text,
    marginLeft: 4,
  },
  brandedHint: {
    ...typography.caption,
    fontSize: 13,
    color: colors.textFaint,
    textAlign: 'center',
    marginTop: spacing.sm + 2,
  },
});
