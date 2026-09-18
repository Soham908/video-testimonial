import { useEffect, useRef, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useTooltipContext } from './TooltipContext';
import { ENABLE_ANCHORED_TOOLTIPS } from '../config';

interface Props {
  // Must match an id in tooltips/tooltipRegistry.ts - not typed against it
  // directly to avoid a circular import (the registry doesn't need to know
  // about this component).
  id: string;
  // Gate on the caller's own state - e.g. don't offer a tip while a
  // countdown/animation is running, or a target is mid-transition.
  // Defaults to true (always eligible once mounted).
  active?: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

// Wraps any existing element to make it a tooltip anchor - purely additive,
// doesn't change the wrapped element's own appearance or behavior. Two
// separate jobs: (1) measure its own on-screen position so the overlay
// (AnchoredTooltipOverlay, mounted once at the app root) knows where to
// point, and (2) offer itself to the queue once per mount if this device
// hasn't dismissed it before (TooltipContext.notifyEligible).
//
// When ENABLE_ANCHORED_TOOLTIPS is off (config.ts), this degrades to a
// plain passthrough View with none of the measuring/context wiring - the
// single revert switch for the whole system.
export function TooltipTarget({ id, active = true, children, style }: Props) {
  const viewRef = useRef<View>(null);
  const { setRect, notifyEligible } = useTooltipContext();

  useEffect(() => {
    if (ENABLE_ANCHORED_TOOLTIPS && active) notifyEligible(id);
  }, [active, id, notifyEligible]);

  if (!ENABLE_ANCHORED_TOOLTIPS) {
    return <View style={style}>{children}</View>;
  }

  function measure() {
    // collapsable={false} below keeps this View a real native node on
    // Android (RN otherwise "flattens" plain wrapper Views out of the
    // native tree for perf, which would make measureInWindow return
    // garbage/zeroed coordinates).
    viewRef.current?.measureInWindow((x, y, width, height) => {
      if (width > 0 && height > 0) setRect(id, { x, y, width, height });
    });
  }

  return (
    <View ref={viewRef} collapsable={false} onLayout={measure} style={style}>
      {children}
    </View>
  );
}
