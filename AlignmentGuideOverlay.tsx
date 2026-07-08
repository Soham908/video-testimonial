import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import type { AlignmentSignals } from './alignment';
import { colors, themeDark } from './theme';

interface Props {
  // Guide is shown while this is true, and fades out (not a hard cut) when
  // it flips false — per CLAUDE.md, full guide only during setup/lock phase.
  visible: boolean;
  signals: AlignmentSignals | null;
  goodFrameStreak: number;
  requiredFrames: number;
}

function guidanceMessage(signals: AlignmentSignals | null): string {
  if (signals == null) return 'Position your face in the frame';
  if (!signals.distanceOk) return 'Adjust your distance from the camera';
  if (!signals.centered) return 'Center your face in the guide';
  if (!signals.headroomOk) return 'Adjust your framing';
  return 'Hold still…';
}

// --- Diagnostic-only: measures this overlay's own re-render rate,
// independent of CameraAlignment's detection-callback rate. If this stays
// close to the detection fps, React is keeping up with incoming data and
// any perceived stutter is a paint/animation cost issue (b), not a data
// lag issue (a). If it's meaningfully lower than the detection fps, React
// itself is dropping/batching updates. Not meant to ship -
// experiment/face-detection-diagnostics branch only.
const renderTimestamps: number[] = [];
let lastRenderLogAt = 0;
function logRenderCadence() {
  const now = Date.now();
  renderTimestamps.push(now);
  const windowStart = now - 5_000;
  while (renderTimestamps.length > 0 && renderTimestamps[0] < windowStart) {
    renderTimestamps.shift();
  }
  if (now - lastRenderLogAt > 1000) {
    const spanMs = Math.max(now - renderTimestamps[0], 1);
    const rate = (renderTimestamps.length / spanMs) * 1000;
    lastRenderLogAt = now;
    console.log(`[fps-diagnostic] AlignmentGuideOverlay render rate: ${rate.toFixed(2)}/sec`);
  }
}

export function AlignmentGuideOverlay({
  visible,
  signals,
  goodFrameStreak,
  requiredFrames,
}: Props) {
  logRenderCadence();
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, [visible, opacity]);

  const allGood =
    signals != null &&
    signals.centered &&
    signals.distanceOk &&
    signals.headroomOk;

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.overlay, { opacity }]}
    >
      <View style={[styles.guideOval, allGood && styles.guideOvalGood]} />
      <Text style={styles.message}>{guidanceMessage(signals)}</Text>
      <Text style={styles.progress}>
        {Math.min(goodFrameStreak, requiredFrames)}/{requiredFrames}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guideOval: {
    width: 232,
    height: 312,
    borderRadius: 170,
    borderWidth: 3,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.9)',
  },
  guideOvalGood: {
    borderColor: colors.accent,
    borderStyle: 'solid',
  },
  message: {
    marginTop: 24,
    color: themeDark.text,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  progress: {
    marginTop: 8,
    color: themeDark.textFaint,
    fontSize: 14,
  },
});
