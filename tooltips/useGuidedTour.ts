import { useEffect } from 'react';
import { ENABLE_ANCHORED_TOOLTIPS } from '../config';
import { useTooltipContext } from './TooltipContext';

// Only a mounted Home/Question screen can own an automatic tour. Targets
// merely register measurements, so the tab bar cannot start tips elsewhere.
export function useGuidedTour(key: string, ids: readonly string[], active = true) {
  const { startTour, leaveTour } = useTooltipContext();
  useEffect(() => {
    if (!ENABLE_ANCHORED_TOOLTIPS || !active) return;
    startTour(key, ids);
    return () => leaveTour(key);
  }, [key, ids, active, startTour, leaveTour]);
}
