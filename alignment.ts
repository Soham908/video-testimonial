import type { Bounds } from 'react-native-vision-camera-face-detector';

export interface AlignmentSignals {
  centered: boolean;
  distanceOk: boolean;
  headroomOk: boolean;
}

const MIN_FACE_WIDTH_RATIO = 0.35;
const MAX_FACE_WIDTH_RATIO = 0.75;
const MIN_HEADROOM_RATIO = 0.05;
const MAX_HEADROOM_RATIO = 0.35;

// Preserve the tuned phone guide. On wide previews, grow it uniformly;
// height limits keep it clear of the lower controls on shorter layouts.
const GUIDE_TOP_OFFSET_RATIO = 230 / 850;
export const GUIDE_WIDTH = 246;
export const GUIDE_HEIGHT = 330;
const PHONE_PREVIEW_WIDTH = 600;
const REFERENCE_PREVIEW_HEIGHT = 850;
const CONTAINMENT_MARGIN_FRACTION = 0.08;

export interface AlignmentGeometry {
  left: number;
  top: number;
  width: number;
  height: number;
  scale: number;
  distanceReferenceWidth: number;
}

export function getGuideTopOffset(frameHeight: number): number {
  return frameHeight * GUIDE_TOP_OFFSET_RATIO;
}

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

export function getAlignmentGeometry(frameWidth: number, frameHeight: number): AlignmentGeometry {
  if (!isPositiveFinite(frameWidth) || !isPositiveFinite(frameHeight)) {
    return { left: 0, top: 0, width: 0, height: 0, scale: 0, distanceReferenceWidth: 0 };
  }
  const top = getGuideTopOffset(frameHeight);
  const scale = Math.min(
    Math.max(1, Math.min(frameWidth / PHONE_PREVIEW_WIDTH, frameHeight / REFERENCE_PREVIEW_HEIGHT)),
    // Keep the same model usable in a short resized preview. Normal
    // portrait phones retain the original guide dimensions unchanged.
    (frameHeight - top) / GUIDE_HEIGHT,
    frameWidth / GUIDE_WIDTH,
  );
  const width = GUIDE_WIDTH * scale;
  const height = GUIDE_HEIGHT * scale;
  return {
    left: (frameWidth - width) / 2,
    top,
    width,
    height,
    scale,
    // The distance check must grow with the same guide. A full-window
    // minimum coupled to a height-capped guide can become impossible.
    // Phone widths keep their original .35/.75 viewport thresholds.
    distanceReferenceWidth: Math.min(frameWidth, PHONE_PREVIEW_WIDTH * scale),
  };
}

export function computeAlignmentSignals(
  bounds: Bounds,
  frameWidth: number,
  frameHeight: number,
): AlignmentSignals {
  const invalid: AlignmentSignals = { centered: false, distanceOk: false, headroomOk: false };
  if (
    !bounds ||
    ![frameWidth, frameHeight, bounds.width, bounds.height].every(isPositiveFinite) ||
    !Number.isFinite(bounds.x) || !Number.isFinite(bounds.y) ||
    bounds.x < 0 || bounds.y < 0 ||
    bounds.x + bounds.width > frameWidth || bounds.y + bounds.height > frameHeight
  ) return invalid;

  const guide = getAlignmentGeometry(frameWidth, frameHeight);
  const guideLeft = guide.left - guide.width * CONTAINMENT_MARGIN_FRACTION;
  const guideRight = guide.left + guide.width * (1 + CONTAINMENT_MARGIN_FRACTION);
  const guideTop = guide.top - guide.height * CONTAINMENT_MARGIN_FRACTION;
  const guideBottom = guide.top + guide.height * (1 + CONTAINMENT_MARGIN_FRACTION);

  // Whole-face containment catches cheeks, forehead or chin outside the
  // target even when the center of the face is still in the guide.
  const centered =
    bounds.x >= guideLeft &&
    bounds.x + bounds.width <= guideRight &&
    bounds.y >= guideTop &&
    bounds.y + bounds.height <= guideBottom;

  const faceWidthRatio = bounds.width / guide.distanceReferenceWidth;
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
