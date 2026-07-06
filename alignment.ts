import type { Bounds } from 'react-native-vision-camera-face-detector';

export interface AlignmentSignals {
  centered: boolean;
  distanceOk: boolean;
  headroomOk: boolean;
}

// Thresholds are ratios relative to frame width/height so they hold up
// across different screen sizes. Starting points only — expect to tune
// these against real footage.
const CENTER_TOLERANCE = 0.15;
const MIN_FACE_WIDTH_RATIO = 0.35;
const MAX_FACE_WIDTH_RATIO = 0.75;
const MIN_HEADROOM_RATIO = 0.05;
const MAX_HEADROOM_RATIO = 0.35;

export function computeAlignmentSignals(
  bounds: Bounds,
  frameWidth: number,
  frameHeight: number,
): AlignmentSignals {
  const faceCenterX = bounds.x + bounds.width / 2;
  const faceCenterY = bounds.y + bounds.height / 2;

  const centered =
    Math.abs(faceCenterX - frameWidth / 2) / frameWidth < CENTER_TOLERANCE &&
    Math.abs(faceCenterY - frameHeight / 2) / frameHeight < CENTER_TOLERANCE;

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
