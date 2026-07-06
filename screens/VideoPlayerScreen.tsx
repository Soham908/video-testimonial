import { useVideoPlayer, VideoView } from 'expo-video';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { RecordedVideo } from './HomeScreen';
import { colors, radius, spacing, typography } from '../theme';

interface Props {
  video: RecordedVideo;
  onClose: () => void;
}

export function VideoPlayerScreen({ video, onClose }: Props) {
  const player = useVideoPlayer(`file://${video.filePath}`, (p) => {
    p.play();
  });

  return (
    <View style={styles.container}>
      <VideoView
        style={styles.video}
        player={player}
        contentFit="contain"
        nativeControls
      />
      <Pressable style={styles.closeButton} onPress={onClose}>
        <Text style={styles.closeButtonText}>Close</Text>
      </Pressable>
      <Text style={styles.label}>{video.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  video: {
    flex: 1,
  },
  closeButton: {
    position: 'absolute',
    top: spacing.lg,
    left: spacing.lg,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  closeButtonText: {
    ...typography.button,
    fontSize: 14,
    color: colors.text,
  },
  label: {
    position: 'absolute',
    bottom: spacing.lg,
    left: spacing.lg,
    right: spacing.lg,
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
