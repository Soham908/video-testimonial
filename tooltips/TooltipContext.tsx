import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { hasSeenTip, markTipSeen } from '../firstRunTips';
import { TOOLTIP_REGISTRY } from './tooltipRegistry';

export interface Rect { x: number; y: number; width: number; height: number; }
interface Tour { key: string; ids: string[]; index: number; }
export interface TooltipTargetHandle { prepare: () => Promise<Rect | undefined>; }
interface TooltipContextValue {
  tour: Tour | null;
  activeId: string | null;
  layoutVersion: number;
  refreshTarget: (id: string) => void;
  startTour: (key: string, ids: readonly string[], replay?: boolean) => void;
  leaveTour: (key: string) => void;
  next: () => void;
  back: () => void;
  skip: () => void;
  registerTarget: (id: string, target: TooltipTargetHandle) => () => void;
  prepareTarget: (id: string) => Promise<Rect | undefined>;
}
const TooltipContext = createContext<TooltipContextValue | null>(null);
const validIds = new Set(TOOLTIP_REGISTRY.map(tip => tip.id));

export function TooltipProvider({ children }: { children: ReactNode }) {
  const [tour, setTour] = useState<Tour | null>(null);
  const [layoutVersion, setLayoutVersion] = useState(0);
  const current = useRef(tour);
  current.current = tour;
  const targets = useRef(new Map<string, TooltipTargetHandle>());

  const remember = useCallback((key: string) => {
    try { markTipSeen(key); }
    catch (error) { console.warn('[tour] could not save completion', error); }
  }, []);
  const startTour = useCallback((key: string, ids: readonly string[], replay = false) => {
    const available = [...new Set(ids)].filter(id => validIds.has(id));
    if (!available.length) return;
    if (!replay) {
      try { if (hasSeenTip(key)) return; }
      catch (error) { console.warn('[tour] could not read completion', error); }
    }
    setTour({ key, ids: available, index: 0 });
  }, []);
  const leaveTour = useCallback((key: string) => {
    setTour(value => value?.key === key ? null : value);
  }, []);
  const skip = useCallback(() => {
    if (current.current) remember(current.current.key);
    setTour(null);
  }, [remember]);
  const next = useCallback(() => {
    const value = current.current;
    if (!value) return;
    if (value.index === value.ids.length - 1) { remember(value.key); setTour(null); }
    else setTour({ ...value, index: value.index + 1 });
  }, [remember]);
  const back = useCallback(() => {
    setTour(value => value ? { ...value, index: Math.max(0, value.index - 1) } : null);
  }, []);
  const registerTarget = useCallback((id: string, target: TooltipTargetHandle) => {
    targets.current.set(id, target);
    return () => { if (targets.current.get(id) === target) targets.current.delete(id); };
  }, []);
  const refreshTarget = useCallback((id: string) => {
    const value = current.current;
    if (value?.ids[value.index] === id) setLayoutVersion(version => version + 1);
  }, []);
  const prepareTarget = useCallback(async (id: string) => targets.current.get(id)?.prepare(), []);

  return <TooltipContext.Provider value={{ tour, layoutVersion, refreshTarget, activeId: tour?.ids[tour.index] ?? null, startTour, leaveTour, next, back, skip, registerTarget, prepareTarget }}>{children}</TooltipContext.Provider>;
}
export function useTooltipContext(): TooltipContextValue {
  const value = useContext(TooltipContext);
  if (!value) throw new Error('useTooltipContext must be used within TooltipProvider');
  return value;
}
