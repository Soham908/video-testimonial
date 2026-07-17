import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import type { RecordedVideo } from '../recordings';
import { colors, radius, spacing, typography } from '../theme';

interface Props {
  videos: RecordedVideo[];
  onPressVideo: (video: RecordedVideo) => void;
  // Caller shows a confirmation prompt before entering the camera flow -
  // this just reports the tap.
  onRetake: (video: RecordedVideo) => void;
}

// Design screen 2b. Per-question status always shows "Ready" - real
// server-side processing status isn't wired up yet. The branded video
// section is a full placeholder - the render pipeline (nexrender + After
// Effects, per CLAUDE.md) doesn't exist yet either.
export function MyVideosScreen({ videos, onPressVideo, onRetake }: Props) {
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <Text style={styles.title}>My videos</Text>

      <Text style={styles.sectionLabel}>YOUR ANSWERS</Text>
      {videos.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>
            You haven't recorded any answers yet.
          </Text>
        </View>
      ) : (
        <View style={styles.answersCard}>
          {videos.map((video, index) => (
            <Pressable
              key={video.id}
              style={[
                styles.answerRow,
                index < videos.length - 1 && styles.answerRowDivider,
              ]}
              onPress={() => onPressVideo(video)}
            >
              <View style={styles.answerIndex}>
                <Text style={styles.answerIndexText}>{index + 1}</Text>
              </View>
              <Text style={styles.answerLabel}>{video.label}</Text>
              <View style={styles.statusPill}>
                <Text style={styles.statusPillText}>Ready</Text>
              </View>
              <Pressable onPress={() => onRetake(video)} hitSlop={8}>
                <Text style={styles.retakeText}>Retake</Text>
              </Pressable>
            </Pressable>
          ))}
        </View>
      )}

      <Text style={styles.sectionLabel}>YOUR BRANDED VIDEO</Text>
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
  statusPillText: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '700',
    color: colors.accentStrong,
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
