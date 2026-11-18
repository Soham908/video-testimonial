import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated } from 'react-native';

export function useMilestoneMotion(eventId?: number, consumed?: { current: boolean }) {
  const [reducedMotion, setReducedMotion] = useState<boolean | null>(null);
  const motion = useRef(new Animated.Value(1)).current;
  const played = useRef<number | undefined>(undefined);
  useEffect(() => {
    let mounted = true, changed = false;
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', value => {
      changed = true;
      if (mounted) setReducedMotion(value);
    });
    AccessibilityInfo.isReduceMotionEnabled().then(value => {
      if (mounted && !changed) setReducedMotion(value);
    }).catch(() => { if (mounted && !changed) setReducedMotion(true); });
    return () => { mounted = false; subscription.remove(); };
  }, []);

  useEffect(() => {
    if (reducedMotion === null) return;
    if (eventId === undefined || reducedMotion || consumed?.current) {
      motion.stopAnimation(); motion.setValue(1);
      if (eventId !== undefined) played.current = eventId;
      if (consumed && eventId !== undefined) consumed.current = true;
      return;
    }
    if (played.current === eventId) return;
    played.current = eventId;
    if (consumed) consumed.current = true;
    motion.setValue(0);
    const animation = Animated.timing(motion, { toValue: 1, duration: 280, useNativeDriver: true, isInteraction: false });
    animation.start();
    return () => { animation.stop(); motion.setValue(1); };
  }, [eventId, reducedMotion, motion, consumed]);
  return motion;
}
