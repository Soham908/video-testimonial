import { useMemo, useState } from 'react';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import { useTheme } from '../theme/ThemeContext';
import type { PaletteColors } from '../theme/palettes';
import type { Spacing } from '../theme/spacing';
import type { Radius } from '../theme/radius';
import type { Typography } from '../theme/typography';
import { Button } from '../components/ui/Button';

// Only needs filePath + label, not a full RecordedVideo - lets this be
// reused for both a local recording (file:// URI) and a remote branded/
// answer playback_url (https:// URI, from My Videos), which don't share
// RecordedVideo's other fields (id, questionIndex, durationSeconds).
export interface PlayableVideo {
  filePath: string;
  label: string;
  // Finished Reel treatment (design 5A) - set when opened from a ready
  // branded reel, not a plain answer/rehearsal clip. Reached from My
  // Videos after a render completes, never part of the live session.
  celebratory?: boolean;
}

interface Props {
  video: PlayableVideo;
  onClose: () => void;
}

export function VideoPlayerScreen({ video, onClose }: Props) {
  const { colors, spacing, radius, typography } = useTheme();
  const styles = useMemo(() => makeStyles(colors, spacing, radius, typography), [colors, spacing, radius, typography]);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // filePath is either a full file:// URI (local recording, already
  // durable-storage-relative from recordings.ts) or a remote https:// URI
  // (a backend playback_url) - expo-video's player accepts either as-is.
  const player = useVideoPlayer(video.filePath, (p) => {
    p.play();
  });

  async function handleShare() {
    // React Native's built-in Share sheet includes WhatsApp when installed
    // (WhatsApp is the distribution channel that matters here, per
    // DECISIONS.md) - no extra native dependency needed for this part.
    try {
      await Share.share({ url: video.filePath, message: video.label });
    } catch (error) {
      console.error('[share]', error);
    }
  }

  async function handleSave() {
    setSaveState('saving');
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        setSaveState('error');
        return;
      }
      await MediaLibrary.saveToLibraryAsync(video.filePath);
      setSaveState('saved');
    } catch (error) {
      console.error('[save]', error);
      setSaveState('error');
    }
  }

  return (
    <View style={styles.container}>
      <VideoView style={styles.video} player={player} contentFit="contain" nativeControls />

      <Pressable style={styles.closeButton} onPress={onClose}>
        <Text style={styles.closeButtonText}>Close</Text>
      </Pressable>

      {video.celebratory ? (
        <View style={styles.celebratoryFooter}>
          <Text style={styles.congrats}>Congratulations!</Text>
          <Text style={styles.congratsSubtitle}>{video.label} is ready</Text>
          <View style={styles.celebratoryActions}>
            <Button label="Share on WhatsApp" onPress={handleShare} />
            <Button
              label={
                saveState === 'saved' ? 'Saved' : saveState === 'saving' ? 'Saving…' : 'Save to phone'
              }
              onPress={handleSave}
              variant="secondary"
              disabled={saveState === 'saving'}
            />
          </View>
        </View>
      ) : (
        <Text style={styles.label}>{video.label}</Text>
      )}
    </View>
  );
}

function makeStyles(colors: PaletteColors, spacing: Spacing, radius: Radius, typography: Typography) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    video: { flex: 1 },
    closeButton: {
      position: 'absolute',
      top: spacing.lg,
      left: spacing.lg,
      backgroundColor: 'rgba(0,0,0,0.55)',
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    closeButtonText: { ...typography.button, fontSize: 14, color: '#FFFFFF' },
    label: {
      position: 'absolute',
      bottom: spacing.lg,
      left: spacing.lg,
      right: spacing.lg,
      ...typography.body,
      color: colors.textMuted,
      textAlign: 'center',
    },
    celebratoryFooter: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: colors.surface,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      padding: spacing.xl,
      gap: spacing.sm,
    },
    congrats: { ...typography.title, fontSize: 22, color: colors.text, textAlign: 'center' },
    congratsSubtitle: { ...typography.body, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.sm },
    celebratoryActions: { gap: spacing.sm },
  });
}
