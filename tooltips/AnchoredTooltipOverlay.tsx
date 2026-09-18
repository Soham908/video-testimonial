import { useMemo } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import type { PaletteColors } from '../theme/palettes';
import type { Spacing } from '../theme/spacing';
import type { Radius } from '../theme/radius';
import type { Typography } from '../theme/typography';
import { useStrings } from '../i18n/useStrings';
import { useTooltipContext, type Rect } from './TooltipContext';
import { TOOLTIP_REGISTRY } from './tooltipRegistry';

const BUBBLE_MARGIN = 12;
const BUBBLE_MAX_WIDTH = 280;
const SIDE_MARGIN = 16;
const ARROW_SIZE = 8;
// Minimum clearance a placement needs before it's ruled out - not an exact
// bubble height (that depends on how long the copy is), just enough to
// avoid picking "below" when there's obviously no room left on that side.
const MIN_PLACEMENT_SPACE = 140;

// Mounted once at the app root (App.tsx), alongside TooltipProvider - reads
// whichever tooltip is currently at the front of the queue and renders a
// dimmed backdrop, a highlight ring around the target's measured rect, and
// a callout bubble with an arrow pointing at it. Renders nothing when no
// tooltip is active, so it's always safe to mount unconditionally.
export function AnchoredTooltipOverlay() {
  const { activeId, getRect, dismissActive } = useTooltipContext();
  const { colors, spacing, radius, typography } = useTheme();
  const styles = useMemo(() => makeStyles(colors, spacing, radius, typography), [colors, spacing, radius, typography]);
  const { t } = useStrings();

  if (!activeId) return null;
  const rect = getRect(activeId);
  if (!rect) return null;
  const def = TOOLTIP_REGISTRY.find((d) => d.id === activeId);
  if (!def) return null;

  const layout = computeBubbleLayout(rect);

  return (
    <>
      <Pressable style={styles.backdrop} onPress={dismissActive} />
      <View
        pointerEvents="none"
        style={[
          styles.highlight,
          { left: rect.x - 4, top: rect.y - 4, width: rect.width + 8, height: rect.height + 8 },
        ]}
      />
      <View
        style={[
          styles.bubble,
          {
            width: layout.width,
            left: layout.left,
            ...(layout.placeBelow ? { top: layout.verticalOffset } : { bottom: layout.verticalOffset }),
          },
        ]}
      >
        {layout.placeBelow && <View style={[styles.arrowUp, { left: layout.arrowLeft }]} />}
        <Text style={styles.title}>{t(def.titleKey)}</Text>
        <Text style={styles.body}>{t(def.bodyKey)}</Text>
        <Pressable onPress={dismissActive} style={styles.gotItButton} hitSlop={6}>
          <Text style={styles.gotItText}>{t('tooltips.gotItButton')}</Text>
        </Pressable>
        {!layout.placeBelow && <View style={[styles.arrowDown, { left: layout.arrowLeft }]} />}
      </View>
    </>
  );
}

function computeBubbleLayout(rect: Rect) {
  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
  const spaceBelow = screenHeight - (rect.y + rect.height);
  const spaceAbove = rect.y;
  // Prefer below (reads more naturally, matches how most callouts point up
  // at what they describe) - falls back to above only when there's
  // genuinely more room that way.
  const placeBelow = spaceBelow >= MIN_PLACEMENT_SPACE || spaceAbove < spaceBelow;
  const verticalOffset = placeBelow
    ? rect.y + rect.height + BUBBLE_MARGIN
    : screenHeight - rect.y + BUBBLE_MARGIN;

  const width = Math.min(BUBBLE_MAX_WIDTH, screenWidth - SIDE_MARGIN * 2);
  const targetCenterX = rect.x + rect.width / 2;
  const left = Math.max(SIDE_MARGIN, Math.min(targetCenterX - width / 2, screenWidth - width - SIDE_MARGIN));
  const arrowLeft = Math.max(12, Math.min(targetCenterX - left - ARROW_SIZE, width - ARROW_SIZE * 2 - 12));

  return { placeBelow, verticalOffset, width, left, arrowLeft };
}

function makeStyles(colors: PaletteColors, spacing: Spacing, radius: Radius, typography: Typography) {
  return StyleSheet.create({
    backdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      zIndex: 998,
    },
    highlight: {
      position: 'absolute',
      borderWidth: 2,
      borderColor: '#FFFFFF',
      borderRadius: radius.md,
      zIndex: 999,
    },
    bubble: {
      position: 'absolute',
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.md,
      zIndex: 1000,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 10,
      elevation: 8,
    },
    arrowUp: {
      position: 'absolute',
      top: -ARROW_SIZE,
      width: 0,
      height: 0,
      borderLeftWidth: ARROW_SIZE,
      borderRightWidth: ARROW_SIZE,
      borderBottomWidth: ARROW_SIZE,
      borderLeftColor: 'transparent',
      borderRightColor: 'transparent',
      borderBottomColor: colors.surface,
    },
    arrowDown: {
      position: 'absolute',
      bottom: -ARROW_SIZE,
      width: 0,
      height: 0,
      borderLeftWidth: ARROW_SIZE,
      borderRightWidth: ARROW_SIZE,
      borderTopWidth: ARROW_SIZE,
      borderLeftColor: 'transparent',
      borderRightColor: 'transparent',
      borderTopColor: colors.surface,
    },
    title: { ...typography.title, fontSize: 16.5, color: colors.text, marginBottom: 4 },
    body: { ...typography.body, fontSize: 14, color: colors.textMuted, lineHeight: 20, marginBottom: spacing.sm + 2 },
    gotItButton: { alignSelf: 'flex-end' },
    gotItText: { ...typography.button, fontSize: 14, color: colors.accent },
  });
}
