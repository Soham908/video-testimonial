import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import type { AlignmentSignals } from './alignment';

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

export function AlignmentGuideOverlay({
  visible,
  signals,
  goodFrameStreak,
  requiredFrames,
}: Props) {
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
    width: 260,
    height: 340,
    borderRadius: 170,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  guideOvalGood: {
    borderColor: '#4ade80',
  },
  message: {
    marginTop: 24,
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  progress: {
    marginTop: 8,
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
  },
});
