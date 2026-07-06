import { useCallback, useRef, useState } from 'react';

// Per CLAUDE.md: full lock needs ~15-20 consecutive good frames before
// question 1; the lighter recheck before questions 2-5 only needs ~5-8,
// since the person is already positioned.
export type AlignmentLockMode = 'initial' | 'recheck';

const REQUIRED_GOOD_FRAMES: Record<AlignmentLockMode, number> = {
  initial: 18,
  recheck: 6,
};

export interface AlignmentLockState {
  isLocked: boolean;
  goodFrameStreak: number;
  requiredFrames: number;
}

// Detection callbacks can fire 20-30+ times/sec. The streak itself is
// tracked every call (via refs, no re-render), but pushing that to React
// state - and therefore re-rendering the overlay - at the same rate causes
// visible lag for no visual benefit. Throttling UI updates to every 3rd
// call (~10/sec) still looks smooth, and a lock transition always updates
// immediately so the fade-out isn't delayed.
const UI_UPDATE_EVERY_N_FRAMES = 3;

export function useAlignmentLock(mode: AlignmentLockMode) {
  const requiredFrames = REQUIRED_GOOD_FRAMES[mode];
  const [state, setState] = useState<AlignmentLockState>({
    isLocked: false,
    goodFrameStreak: 0,
    requiredFrames,
  });
  const streakRef = useRef(0);
  const lockedRef = useRef(false);
  const callCountRef = useRef(0);

  const registerFrame = useCallback(
    (aligned: boolean) => {
      if (lockedRef.current) return;

      streakRef.current = aligned ? streakRef.current + 1 : 0;
      const justLocked = streakRef.current >= requiredFrames;
      lockedRef.current = justLocked;

      callCountRef.current += 1;
      const shouldUpdateUi =
        justLocked || callCountRef.current % UI_UPDATE_EVERY_N_FRAMES === 0;
      if (!shouldUpdateUi) return;

      setState({
        isLocked: justLocked,
        goodFrameStreak: streakRef.current,
        requiredFrames,
      });
    },
    [requiredFrames],
  );

  const reset = useCallback(() => {
    streakRef.current = 0;
    lockedRef.current = false;
    setState({ isLocked: false, goodFrameStreak: 0, requiredFrames });
  }, [requiredFrames]);

  return { ...state, registerFrame, reset };
}
