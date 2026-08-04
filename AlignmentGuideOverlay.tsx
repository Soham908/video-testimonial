import { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import type { AlignmentSignals } from './alignment';
import { useTheme } from './theme/ThemeContext';
import type { PaletteDarkColors } from './theme/palettes';

interface Props {
  // Guide is shown while this is true, and fades out (not a hard cut) when
  // it flips false - per CLAUDE.md, full guide only during setup/lock phase.
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

// Renders inside CameraCheckScreen's dark full-bleed layout, in the space
// left below its title bar - a subtle outline plus one line of guidance,
// matching the Camera Check mockup rather than the old heavier
// dashed-guide treatment.
export function AlignmentGuideOverlay({ visible, signals, goodFrameStreak, requiredFrames }: Props) {
  const { themeDark: dark } = useTheme();
  const styles = useMemo(() => makeStyles(dark), [dark]);
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, [visible, opacity]);

  const allGood = signals != null && signals.centered && signals.distanceOk && signals.headroomOk;

  return (
    <Animated.View pointerEvents="none" style={[styles.overlay, { opacity }]}>
      <View style={[styles.guideOutline, allGood && { borderColor: dark.accent }]} />
      <Text style={styles.message}>{guidanceMessage(signals)}</Text>
    </Animated.View>
  );
}

function makeStyles(dark: PaletteDarkColors) {
  return StyleSheet.create({
    overlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: 'center',
      paddingTop: 110,
    },
    guideOutline: {
      width: 218,
      height: 290,
      borderTopLeftRadius: 128,
      borderTopRightRadius: 128,
      borderBottomLeftRadius: 96,
      borderBottomRightRadius: 96,
      borderWidth: 1.5,
      borderColor: 'rgba(255,255,255,0.18)',
    },
    message: {
      marginTop: 18,
      color: dark.text,
      fontSize: 16.5,
      fontWeight: '600',
      textAlign: 'center',
      lineHeight: 22,
      paddingHorizontal: 26,
    },
  });
}
