import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
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
}: Props) {
  const { spacing } = useTheme();
  const styles = useMemo(() => makeStyles(spacing), [spacing]);

  return (
    <View style={styles.container} pointerEvents="box-none">
      <View style={styles.topBar} pointerEvents="box-none">
        <View>
          <Text style={styles.title}>Let's check your camera</Text>
          <Text style={styles.subtitle}>
            Question {questionNumber} of {totalQuestions}
          </Text>
        </View>
        <View style={styles.autoStartRow}>
          <Text style={styles.autoStartLabel}>Auto start</Text>
          <Toggle value={autoStart} onValueChange={onToggleAutoStart} onDark />
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
    autoStartRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingTop: 4 },
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
