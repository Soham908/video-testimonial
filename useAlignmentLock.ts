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

export function useAlignmentLock(mode: AlignmentLockMode) {
  const requiredFrames = REQUIRED_GOOD_FRAMES[mode];
  const [state, setState] = useState<AlignmentLockState>({
    isLocked: false,
    goodFrameStreak: 0,
    requiredFrames,
  });
  const streakRef = useRef(0);
  const lockedRef = useRef(false);

  const registerFrame = useCallback(
    (aligned: boolean) => {
      if (lockedRef.current) return;

      streakRef.current = aligned ? streakRef.current + 1 : 0;
      const justLocked = streakRef.current >= requiredFrames;
      lockedRef.current = justLocked;

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
