import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { hasSeenTip, markTipSeen } from '../firstRunTips';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TooltipContextValue {
  // Only ever the front of the queue - one tooltip visible at a time, app-
  // wide, even if several TooltipTargets on the same screen are eligible at
  // once. Prevents two anchored bubbles stacking on top of each other.
  activeId: string | null;
  getRect: (id: string) => Rect | undefined;
  setRect: (id: string, rect: Rect) => void;
  // Called once by a TooltipTarget when it mounts (or becomes `active`) -
  // queues itself if this device hasn't dismissed it before. A no-op if
  // already seen, already queued, or already active.
  notifyEligible: (id: string) => void;
  // Marks the current front-of-queue tooltip seen (so it won't auto-show
  // again) and advances to the next queued one, if any.
  dismissActive: () => void;
  // Help-button entry point - replaces the queue outright with these ids,
  // regardless of whether they've been seen before. Used to let someone
  // deliberately re-open tips they already dismissed.
  replay: (ids: string[]) => void;
}

const TooltipContext = createContext<TooltipContextValue | null>(null);

export function TooltipProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<string[]>([]);
  const [rects, setRects] = useState<Record<string, Rect>>({});

  const getRect = useCallback((id: string) => rects[id], [rects]);

  const setRect = useCallback((id: string, rect: Rect) => {
    setRects((prev) => {
      const existing = prev[id];
      if (
        existing &&
        existing.x === rect.x &&
        existing.y === rect.y &&
        existing.width === rect.width &&
        existing.height === rect.height
      ) {
        return prev;
      }
      return { ...prev, [id]: rect };
    });
  }, []);

  const notifyEligible = useCallback((id: string) => {
    if (hasSeenTip(id)) return;
    setQueue((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  const dismissActive = useCallback(() => {
    setQueue((prev) => {
      const [current, ...rest] = prev;
      if (current) markTipSeen(current);
      return rest;
    });
  }, []);

  const replay = useCallback((ids: string[]) => {
    setQueue(ids);
  }, []);

  const activeId = queue[0] ?? null;

  return (
    <TooltipContext.Provider value={{ activeId, getRect, setRect, notifyEligible, dismissActive, replay }}>
      {children}
    </TooltipContext.Provider>
  );
}

export function useTooltipContext(): TooltipContextValue {
  const ctx = useContext(TooltipContext);
  if (!ctx) {
    throw new Error('useTooltipContext must be used within TooltipProvider (see App.tsx)');
  }
  return ctx;
}
