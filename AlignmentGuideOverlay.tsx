import { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { GUIDE_TOP_OFFSET, GUIDE_WIDTH, GUIDE_HEIGHT, type AlignmentSignals } from './alignment';
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
      <Text style={styles.message}>{guidanceMessage(signals)}</Text>
      <View style={[styles.guideOutline, allGood && { borderColor: dark.accent }]} />
    </Animated.View>
  );
}

// How far above the oval's own top (GUIDE_TOP_OFFSET) the guidance message
// sits - independent of the message's own height (position: 'absolute'),
// so a longer message wrapping to 2 lines never pushes into the oval
// itself, and the oval's tuned vertical position (see alignment.ts) is
// never affected by the message at all. Kept close to the oval (not up
// near the top bar) so it reads as guidance about the circle right below
// it, not a separate, disconnected instruction.
const MESSAGE_TOP_OFFSET = GUIDE_TOP_OFFSET - 60;

function makeStyles(dark: PaletteDarkColors) {
  return StyleSheet.create({
    overlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: 'center',
      paddingTop: GUIDE_TOP_OFFSET,
    },
    guideOutline: {
      width: GUIDE_WIDTH,
      height: GUIDE_HEIGHT,
      // Radii scaled from the original 218-wide oval's 128/96 proportions
      // so the shape stays the same as GUIDE_WIDTH changes.
      borderTopLeftRadius: 144,
      borderTopRightRadius: 144,
      borderBottomLeftRadius: 108,
      borderBottomRightRadius: 108,
      borderWidth: 1.5,
      borderColor: 'rgba(255,255,255,0.18)',
    },
    // Above the oval now, not below it - once the oval was recentered
    // lower on screen (GUIDE_TOP_OFFSET raised to 230), a message below it
    // started overlapping AlignmentStatusStrip's checklist, which is
    // anchored from the bottom edge independently.
    message: {
      position: 'absolute',
      top: MESSAGE_TOP_OFFSET,
      left: 0,
      right: 0,
      color: dark.text,
      fontSize: 16.5,
      fontWeight: '600',
      textAlign: 'center',
      lineHeight: 22,
      paddingHorizontal: 26,
    },
  });
}
