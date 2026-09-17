import { useEffect, useState } from 'react';
import { hasSeenTip, markTipSeen } from './firstRunTips';

// `active` gates when the tip is even eligible to show (e.g. only once a
// screen has actually settled into the relevant state) - separate from
// `visible` itself, which also depends on whether this device has already
// seen it. Checked once per mount rather than read synchronously at
// render time, since expo-file-system's textSync() is a blocking disk
// read - fine for the one-off check, but doing it inline in render would
// re-run it on every re-render for no reason.
export function useFirstRunTip(tipId: string, active: boolean): { visible: boolean; dismiss: () => void } {
  const [seen, setSeen] = useState<boolean | null>(null);

  useEffect(() => {
    setSeen(hasSeenTip(tipId));
  }, [tipId]);

  function dismiss() {
    markTipSeen(tipId);
    setSeen(true);
  }

  return { visible: active && seen === false, dismiss };
}
