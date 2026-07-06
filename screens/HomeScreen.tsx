import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';

export interface RecordedVideo {
  id: string;
  label: string;
  // Filesystem path from VisionCamera's Recorder (app-private temp
  // storage, not a public gallery). Not rendered yet - no thumbnail/
  // playback UI exists - but tracked so it's available once that's built.
  filePath: string;
}

interface Props {
  videos: RecordedVideo[];
  onCreateNew: () => void;
}

export function HomeScreen({ videos, onCreateNew }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Your testimonials</Text>
        <Text style={styles.subtitle}>
          {videos.length === 0
            ? "You haven't recorded one yet."
            : `${videos.length} recorded`}
        </Text>
      </View>

      {videos.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>
            Record a short video testimonial in just a few minutes.
          </Text>
        </View>
      ) : (
        <FlatList
          data={videos}
          keyExtractor={(v) => v.id}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.videoCard}>
              <Text style={styles.videoLabel}>{item.label}</Text>
            </View>
          )}
        />
      )}

      <Pressable style={styles.button} onPress={onCreateNew}>
        <Text style={styles.buttonText}>Create Testimonial</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  header: {
    marginBottom: spacing.lg,
  },
  title: {
    ...typography.title,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.subtitle,
    color: colors.textMuted,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
  list: {
    paddingBottom: spacing.lg,
  },
  row: {
    gap: spacing.md,
  },
  videoCard: {
    flex: 1,
    aspectRatio: 9 / 16,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    marginBottom: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  buttonText: {
    ...typography.button,
    color: colors.accentText,
  },
});
