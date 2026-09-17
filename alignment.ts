import type { Bounds } from 'react-native-vision-camera-face-detector';

export interface AlignmentSignals {
  centered: boolean;
  distanceOk: boolean;
  headroomOk: boolean;
}

// Thresholds are ratios relative to frame width/height so they hold up
// across different screen sizes. Starting points only — expect to tune
// these against real footage.
const MIN_FACE_WIDTH_RATIO = 0.35;
const MAX_FACE_WIDTH_RATIO = 0.75;
const MIN_HEADROOM_RATIO = 0.05;
const MAX_HEADROOM_RATIO = 0.35;

// Single source of truth for where/how big the on-screen guide oval is
// (AlignmentGuideOverlay imports these for its paddingTop/width/height) so
// the "centered" check always targets wherever the guide is actually
// drawn, rather than assuming dead screen-center. `width, height` passed
// into computeAlignmentSignals below are useWindowDimensions() (dp, same
// coordinate space these are styled in) - not camera sensor pixels.
//
// GUIDE_TOP_OFFSET was 150 (guide vertical center ~315dp from the top),
// which sat noticeably above true screen-center - holding the phone at a
// natural angle put the face well below the oval, forcing an unnatural
// downward tilt to line up. Raised to 230 (~centered in the space actually
// left over between CameraCheckScreen's top toggles and its bottom
// start-recording bar/countdown, on a ~850dp-tall reference screen) so a
// natural holding angle lines up correctly - but a FIXED dp offset turned
// out not to be device-independent after all: on a phone with a shorter
// screen (a different dp height than the 850dp reference), the same
// absolute 230dp lands noticeably higher relative to the visible camera
// area, matching the "circle sits toward the top on some phones" report.
// getGuideTopOffset() below reproduces the original 230/850 ratio instead
// of the raw constant, so the guide stays proportionally in the same
// place - "centered in the leftover space" - across screen heights. Same
// starting-point caveat as the thresholds below - expect to tune against
// real on-device footage across a range of screen sizes.
const GUIDE_TOP_OFFSET_RATIO = 230 / 850;
export function getGuideTopOffset(frameHeight: number): number {
  return frameHeight * GUIDE_TOP_OFFSET_RATIO;
}
export const GUIDE_WIDTH = 246;
export const GUIDE_HEIGHT = 330;

// A small inward margin (as a fraction of the oval's own width/height) on
// the containment check below. Not slack for the face to hang outside the
// oval - the oval is drawn as a rounded/elliptical shape, and checking
// against its bounding rectangle would otherwise reject an otherwise
// well-placed face whose corners fall in the rounded-off area. This just
// compensates for that approximation.
const CONTAINMENT_MARGIN_FRACTION = 0.08;

export function computeAlignmentSignals(
  bounds: Bounds,
  frameWidth: number,
  frameHeight: number,
): AlignmentSignals {
  const guideTopOffset = getGuideTopOffset(frameHeight);
  const guideLeft = (frameWidth - GUIDE_WIDTH) / 2 - GUIDE_WIDTH * CONTAINMENT_MARGIN_FRACTION;
  const guideRight = (frameWidth + GUIDE_WIDTH) / 2 + GUIDE_WIDTH * CONTAINMENT_MARGIN_FRACTION;
  const guideTop = guideTopOffset - GUIDE_HEIGHT * CONTAINMENT_MARGIN_FRACTION;
  const guideBottom = guideTopOffset + GUIDE_HEIGHT + GUIDE_HEIGHT * CONTAINMENT_MARGIN_FRACTION;

  // "centered" now means the whole face bounding box - including the chin
  // at bounds.y + bounds.height - sits inside the guide oval, not just
  // that the face's center point is roughly in the middle of it. A
  // center-only check can't catch a chin (or forehead/cheek) sticking out
  // past the oval's edge while the center still reads as fine.
  const centered =
    bounds.x >= guideLeft &&
    bounds.x + bounds.width <= guideRight &&
    bounds.y >= guideTop &&
    bounds.y + bounds.height <= guideBottom;

  const faceWidthRatio = bounds.width / frameWidth;
  const distanceOk =
    faceWidthRatio >= MIN_FACE_WIDTH_RATIO &&
    faceWidthRatio <= MAX_FACE_WIDTH_RATIO;

  const headroomRatio = bounds.y / frameHeight;
  const headroomOk =
    headroomRatio >= MIN_HEADROOM_RATIO && headroomRatio <= MAX_HEADROOM_RATIO;

  return { centered, distanceOk, headroomOk };
}

export function isFullyAligned(signals: AlignmentSignals): boolean {
  return signals.centered && signals.distanceOk && signals.headroomOk;
}
