import type { Rect } from './TooltipContext';
const MARGIN = 16;
export function visibleTarget(rect: Rect | undefined, width: number, height: number): Rect | undefined {
  if (!rect) return undefined;
  const x = Math.max(0, rect.x), y = Math.max(0, rect.y);
  const right = Math.min(width, rect.x + rect.width), bottom = Math.min(height, rect.y + rect.height);
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : undefined;
}
export function tooltipLayout(rect: Rect | undefined, screen: { width: number; height: number }, bubbleHeight: number, insets: { top: number; bottom: number }) {
  const width = Math.min(360, screen.width - MARGIN * 2);
  const minimumTop = insets.top + 12;
  const maximumTop = Math.max(minimumTop, screen.height - insets.bottom - 12 - bubbleHeight);
  const center = rect ? rect.x + rect.width / 2 : screen.width / 2;
  const left = Math.max(MARGIN, Math.min(center - width / 2, screen.width - width - MARGIN));
  const below = rect ? rect.y + rect.height + 12 : (screen.height - bubbleHeight) / 2;
  const above = rect ? rect.y - bubbleHeight - 12 : below;
  const preferred = below + bubbleHeight <= screen.height - insets.bottom - 12 ? below : above;
  const top = Math.max(minimumTop, Math.min(preferred, maximumTop));
  return { width, left, top };
}
