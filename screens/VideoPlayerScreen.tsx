import { useVideoPlayer, VideoView } from 'expo-video';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';

// Only needs filePath + label, not a full RecordedVideo - lets this be
// reused for both a local recording (file:// URI) and a remote branded/
// answer playback_url (https:// URI, from My Videos), which don't share
// RecordedVideo's other fields (id, questionIndex, durationSeconds).
export interface PlayableVideo {
  filePath: string;
  label: string;
}

interface Props {
  video: PlayableVideo;
  onClose: () => void;
}

export function VideoPlayerScreen({ video, onClose }: Props) {
  // filePath is either a full file:// URI (local recording, already
  // durable-storage-relative from recordings.ts) or a remote https:// URI
  // (a backend playback_url) - expo-video's player accepts either as-is.
  const player = useVideoPlayer(video.filePath, (p) => {
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
