import { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { getGuideTopOffset, GUIDE_WIDTH, GUIDE_HEIGHT, type AlignmentSignals } from './alignment';
import { useTheme } from './theme/ThemeContext';
import type { PaletteDarkColors } from './theme/palettes';
import { useStrings, type UseStringsResult } from './i18n/useStrings';

interface Props {
  // Guide is shown while this is true, and fades out (not a hard cut) when
  // it flips false - per CLAUDE.md, full guide only during setup/lock phase.
  visible: boolean;
  signals: AlignmentSignals | null;
  goodFrameStreak: number;
  requiredFrames: number;
}

function guidanceMessage(signals: AlignmentSignals | null, t: UseStringsResult['t']): string {
  if (signals == null) return t('alignmentGuide.guidancePositionFace');
  if (!signals.distanceOk) return t('alignmentGuide.guidanceAdjustDistance');
  if (!signals.centered) return t('alignmentGuide.guidanceCenterFace');
  if (!signals.headroomOk) return t('alignmentGuide.guidanceAdjustFraming');
  return t('alignmentGuide.guidanceHoldStill');
}

// Renders inside CameraCheckScreen's dark full-bleed layout, in the space
// left below its title bar - a subtle outline plus one line of guidance,
// matching the Camera Check mockup rather than the old heavier
// dashed-guide treatment.
export function AlignmentGuideOverlay({ visible, signals, goodFrameStreak, requiredFrames }: Props) {
  const { themeDark: dark } = useTheme();
  const { height } = useWindowDimensions();
  const guideTopOffset = getGuideTopOffset(height);
  const styles = useMemo(() => makeStyles(dark, guideTopOffset), [dark, guideTopOffset]);
  const opacity = useRef(new Animated.Value(1)).current;
  const { t } = useStrings();

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
      <Text style={styles.message}>{guidanceMessage(signals, t)}</Text>
      <View style={[styles.guideOutline, allGood && { borderColor: dark.accent }]} />
    </Animated.View>
  );
}

// How far above the oval's own top the guidance message sits -
// independent of the message's own height (position: 'absolute'), so a
// longer message wrapping to 2 lines never pushes into the oval itself,
// and the oval's tuned vertical position (see alignment.ts) is never
// affected by the message at all. Kept close to the oval (not up near the
// top bar) so it reads as guidance about the circle right below it, not a
// separate, disconnected instruction.
const MESSAGE_TOP_OFFSET_DELTA = -60;

function makeStyles(dark: PaletteDarkColors, guideTopOffset: number) {
  return StyleSheet.create({
    overlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: 'center',
      paddingTop: guideTopOffset,
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
      // Was rgba(255,255,255,0.18) - effectively invisible against a
      // bright/plain background (the exact complaint from real testers).
      // There's no actual background-brightness detection feeding this
      // (see DECISIONS.md - never built), so this can't adapt live; a
      // stronger fixed stroke plus a soft dark shadow keeps it readable
      // against both bright and dark scenes without needing that signal.
      borderWidth: 3,
      borderColor: 'rgba(255,255,255,0.85)',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.5,
      shadowRadius: 6,
      elevation: 4,
    },
    // Above the oval now, not below it - once the oval was recentered
    // lower on screen, a message below it started overlapping
    // AlignmentStatusStrip's checklist, which is anchored from the bottom
    // edge independently.
    message: {
      position: 'absolute',
      top: guideTopOffset + MESSAGE_TOP_OFFSET_DELTA,
      left: 0,
      right: 0,
      color: dark.text,
      fontSize: 18.5,
      fontWeight: '700',
      textAlign: 'center',
      lineHeight: 24,
      paddingHorizontal: 26,
      textShadowColor: 'rgba(0,0,0,0.6)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 4,
    },
  });
}
