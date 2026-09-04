import { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useVideoPlayer } from 'expo-video';
import { useTheme } from '../theme/ThemeContext';
import type { Spacing } from '../theme/spacing';
import { Toggle } from '../components/ui/Toggle';
import { Button } from '../components/ui/Button';

interface Props {
  questionNumber: number;
  totalQuestions: number;
  autoStart: boolean;
  onToggleAutoStart: (next: boolean) => void;
  /** True once alignment has locked and noise is clear (or overridden). */
  checksReady: boolean;
  countingDown: boolean;
  countdownSeconds: number;
  onStartRecording: () => void;
  // The current question's own vo_playback_url (API_CONTRACT.md), same
  // source QuestionBriefScreen's "Read to me" uses - a fresh presigned S3
  // URL, not a bundled/local clip. undefined while questions are still
  // loading.
  voPlaybackUrl?: string;
  readQuestionAloud: boolean;
  onToggleReadQuestionAloud: (next: boolean) => void;
}

// Chrome-only overlay, rendered as a SIBLING of <CameraAlignment/> (not a
// wrapper around it) - CameraAlignment must stay mounted continuously
// across cameraCheck -> countdown -> recording so the camera session never
// reinitializes mid-flow. AppFlow renders CameraAlignment once, at a stable
// tree position, and this chrome layers on top only while phase is
// 'cameraCheck'/'countdown'. CameraAlignment/alignment.ts/useAlignmentLock.ts
// are untouched - this only adds new UI (title bar, auto-start toggle, the
// start button/inline countdown) on top of what CameraAlignment already
// renders (the restyled AlignmentGuideOverlay + AlignmentStatusStrip).
export function CameraCheckScreen({
  questionNumber,
  totalQuestions,
  autoStart,
  onToggleAutoStart,
  checksReady,
  countingDown,
  countdownSeconds,
  onStartRecording,
  voPlaybackUrl,
  readQuestionAloud,
  onToggleReadQuestionAloud,
}: Props) {
  const { spacing } = useTheme();
  const styles = useMemo(() => makeStyles(spacing), [spacing]);

  // null (not just undefined) while there's nothing to play - useVideoPlayer
  // accepts a null source and stays inert, same fallback QuestionBriefScreen's
  // "Read to me" uses.
  const audioSource = voPlaybackUrl ?? null;
  const player = useVideoPlayer(audioSource);

  // The underlying native call can throw synchronously with "Cannot use
  // shared object that was already released" - same root cause and same
  // defensive pattern as useAmbientNoiseCheck.ts's safeStop() (see that
  // file's comment for the full mechanism), just for VideoPlayer instead
  // of AudioRecorder. useVideoPlayer releases its native player
  // automatically on unmount; there's no ordering guarantee that this
  // effect's own cleanup runs before that happens - most reliably hit right
  // when the countdown ends, since that's the same render that unmounts
  // this component (phase flips away from 'cameraCheck'/'countdown').
  function safePause() {
    try {
      player.pause();
    } catch (error) {
      console.warn('[camera-check] VO pause failed', error);
    }
  }

  // Plays once per countdown, from the top, only while the preference is
  // on - not tied to whether it happened to still be playing from Question
  // Brief's "Read to me", since that's a different moment in the flow and
  // may not have been used at all. Stopped (not just paused) the instant
  // the countdown ends and 'recording' actually starts (CLAUDE.md: no
  // simultaneous playback + record, mic pickup would otherwise catch the
  // tail of this over the person's own answer) - countingDown flipping to
  // false covers both that transition and a cancelled countdown alike.
  useEffect(() => {
    if (audioSource == null) return;
    if (!countingDown || !readQuestionAloud) {
      safePause();
      return;
    }
    try {
      player.currentTime = 0;
      player.play();
    } catch (error) {
      console.warn('[camera-check] VO play failed', error);
    }
    return safePause;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countingDown, readQuestionAloud, audioSource]);

  return (
    <View style={styles.container} pointerEvents="box-none">
      <View style={styles.topBar} pointerEvents="box-none">
        <View>
          <Text style={styles.title}>Let's check your camera</Text>
          <Text style={styles.subtitle}>
            Question {questionNumber} of {totalQuestions}
          </Text>
        </View>
        <View style={styles.toggleColumn}>
          <View style={styles.autoStartRow}>
            <Text style={styles.autoStartLabel}>Auto start</Text>
            <Toggle value={autoStart} onValueChange={onToggleAutoStart} onDark />
          </View>
          <View style={styles.autoStartRow}>
            <Text style={styles.autoStartLabel}>Read question aloud</Text>
            <Toggle value={readQuestionAloud} onValueChange={onToggleReadQuestionAloud} onDark />
          </View>
        </View>
      </View>

      <View style={styles.bottomBar} pointerEvents="box-none">
        {countingDown ? (
          <View style={styles.countdownRow}>
            <View style={styles.countdownCircle}>
              <Text style={styles.countdownNumber}>{Math.max(countdownSeconds, 1)}</Text>
            </View>
            <Text style={styles.countdownLabel}>Recording starts in {Math.max(countdownSeconds, 1)}…</Text>
          </View>
        ) : (
          <Button
            label={checksReady ? 'Start recording' : 'Waiting for checks…'}
            onPress={onStartRecording}
            disabled={!checksReady}
          />
        )}
      </View>
    </View>
  );
}

function makeStyles(spacing: Spacing) {
  return StyleSheet.create({
    container: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    topBar: {
      position: 'absolute',
      top: 16,
      left: spacing.lg,
      right: spacing.lg,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: spacing.md,
    },
    title: { color: '#FFFFFF', fontSize: 21, fontWeight: '700', letterSpacing: -0.3 },
    subtitle: { color: 'rgba(255,255,255,0.55)', fontSize: 13.5, marginTop: 4 },
    toggleColumn: { gap: 10, alignItems: 'flex-end' },
    autoStartRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
    autoStartLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600' },
    bottomBar: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: 30 },
    countdownRow: { alignItems: 'center', gap: spacing.sm },
    countdownCircle: {
      width: 58,
      height: 58,
      borderRadius: 29,
      borderWidth: 2,
      borderColor: 'rgba(255,255,255,0.4)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    countdownNumber: { color: '#FFFFFF', fontSize: 27, fontWeight: '700' },
    countdownLabel: { color: '#FFFFFF', fontSize: 15.5, fontWeight: '600' },
  });
}
