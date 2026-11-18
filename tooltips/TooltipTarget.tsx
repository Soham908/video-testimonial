import { useEffect, useRef, type ReactNode, type RefObject, type MutableRefObject } from 'react';
import { View, ScrollView, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTooltipContext, type Rect } from './TooltipContext';
import { ENABLE_ANCHORED_TOOLTIPS } from '../config';
interface Props {
  id: string;
  active?: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  scrollRef?: RefObject<ScrollView | null>;
  scrollOffset?: MutableRefObject<number>;
}
interface Measurable { measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => void; }
function measure(node: Measurable | null | undefined): Promise<Rect | undefined> {
  return new Promise(resolve => {
    const timeout = setTimeout(() => resolve(undefined), 180);
    if (!node) { clearTimeout(timeout); resolve(undefined); return; }
    node.measureInWindow((x, y, width, height) => {
      clearTimeout(timeout);
      resolve(width > 0 && height > 0 ? { x, y, width, height } : undefined);
    });
  });
}
const settle = () => new Promise(resolve => setTimeout(resolve, 90));

export function TooltipTarget({ id, active = true, children, style, scrollRef, scrollOffset }: Props) {
  const view = useRef<View>(null);
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const { registerTarget, refreshTarget } = useTooltipContext();
  useEffect(() => {
    if (!ENABLE_ANCHORED_TOOLTIPS || !active) return;
    let mounted = true;
    const unregister = registerTarget(id, { prepare: async () => {
      for (let attempt = 0; attempt < 3 && mounted; attempt++) {
        let rect = await measure(view.current);
        if (!mounted) return undefined;
        const scroll = scrollRef?.current;
        if (rect && scroll && scrollOffset) {
          const viewport = await measure(scroll.getNativeScrollRef());
          if (!mounted) return undefined;
          const visibleTop = viewport ? Math.max(viewport.y, insets.top) + 12 : 0;
          const visibleBottom = viewport ? Math.min(viewport.y + viewport.height, screenHeight - insets.bottom) - 12 : 0;
          if (viewport && (rect.y < visibleTop || rect.y + rect.height > visibleBottom)) {
            scroll.scrollTo({ y: Math.max(0, scrollOffset.current + rect.y - visibleTop), animated: false });
            await settle();
            rect = await measure(view.current);
          }
        }
        if (mounted && rect) return rect;
        await settle();
      }
      return undefined;
    } });
    return () => { mounted = false; unregister(); };
  }, [active, id, registerTarget, scrollRef, scrollOffset, insets.top, insets.bottom, screenHeight]);
  return <View ref={view} collapsable={false} onLayout={ENABLE_ANCHORED_TOOLTIPS && active ? () => refreshTarget(id) : undefined} style={style}>{children}</View>;
}
