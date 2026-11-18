import { useEffect, useState } from 'react';
import { AccessibilityInfo, BackHandler, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { useStrings } from '../i18n/useStrings';
import { containsDevanagari, devanagariFontFamily } from '../theme/fonts';
import { useTooltipContext, type Rect } from './TooltipContext';
import { TOOLTIP_REGISTRY } from './tooltipRegistry';
import { tooltipLayout, visibleTarget } from './tooltipLayout';

export function AnchoredTooltipOverlay() {
  const { tour, activeId, layoutVersion, prepareTarget, next, back, skip } = useTooltipContext();
  const { colors, radius, typography } = useTheme();
  const { t } = useStrings();
  const screen = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [target, setTarget] = useState<{ id: string; rect?: Rect } | null>(null);
  const [bubbleHeight, setBubbleHeight] = useState(270);
  const def = TOOLTIP_REGISTRY.find(tip => tip.id === activeId);

  useEffect(() => {
    if (!activeId) { setTarget(null); return; }
    let cancelled = false;
    setTarget(null);
    prepareTarget(activeId).then(rect => {
      if (!cancelled) setTarget({ id: activeId, rect });
    }).catch(error => {
      console.warn('[tour] anchor unavailable', error);
      if (!cancelled) setTarget({ id: activeId });
    });
    return () => { cancelled = true; };
  }, [activeId, layoutVersion, prepareTarget, screen.width, screen.height, screen.fontScale]);

  useEffect(() => {
    if (!activeId) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { skip(); return true; });
    return () => subscription.remove();
  }, [activeId, skip]);

  useEffect(() => {
    if (target?.id === activeId && def && tour) {
      AccessibilityInfo.announceForAccessibility(t('tooltips.stepProgress', { number: tour.index + 1, total: tour.ids.length }) + '. ' + t(def.titleKey) + '. ' + t(def.bodyKey));
    }
    // Re-announce on a step change, not a bubble re-layout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, activeId]);

  if (!tour || !activeId || !def) return null;
  const measured = target?.id === activeId ? target.rect : undefined;
  const rect = measured ? visibleTarget({ x: measured.x - 6, y: measured.y - 6, width: measured.width + 12, height: measured.height + 12 }, screen.width, screen.height) : undefined;
  const corner = rect ? Math.min(radius.lg, rect.width / 2, rect.height / 2) : 0;
  const layout = tooltipLayout(rect, screen, bubbleHeight, insets);
  const progress = t('tooltips.stepProgress', { number: tour.index + 1, total: tour.ids.length });
  const title = t(def.titleKey), body = t(def.bodyKey);
  const font = (text: string, weight = '400') => containsDevanagari(text) ? { fontFamily: devanagariFontFamily(weight) } : undefined;
  const busy = target?.id !== activeId;
  const parts = rect ? [
    { left: 0, top: 0, width: screen.width, height: rect.y },
    { left: 0, top: rect.y + rect.height, width: screen.width, height: screen.height - rect.y - rect.height },
    { left: 0, top: rect.y, width: rect.x, height: rect.height },
    { left: rect.x + rect.width, top: rect.y, width: screen.width - rect.x - rect.width, height: rect.height },
  ] : [{ left: 0, top: 0, width: screen.width, height: screen.height }];

  return (
    <View pointerEvents="box-none" style={styles.overlay}>
      {/* Taps on the backdrop never advance a tour or trigger the real control. */}
      <Pressable accessible={false} importantForAccessibility="no" style={styles.fill} onPress={() => {}} />
      {parts.map((part, index) => <View key={index} pointerEvents="none" style={[styles.shade, part]} />)}
      {rect && [
        { left: rect.x, top: rect.y, circleLeft: -corner, circleTop: -corner },
        { left: rect.x + rect.width - corner, top: rect.y, circleLeft: -corner * 2, circleTop: -corner },
        { left: rect.x, top: rect.y + rect.height - corner, circleLeft: -corner, circleTop: -corner * 2 },
        { left: rect.x + rect.width - corner, top: rect.y + rect.height - corner, circleLeft: -corner * 2, circleTop: -corner * 2 },
      ].map((part, index) => <View key={`corner-${index}`} pointerEvents="none" style={{ position: 'absolute', left: part.left, top: part.top, width: corner, height: corner, overflow: 'hidden' }}><View style={{ position: 'absolute', left: part.circleLeft, top: part.circleTop, width: corner * 4, height: corner * 4, borderRadius: corner * 2, borderWidth: corner, borderColor: 'rgba(0,0,0,0.58)' }} /></View>)}
      {rect && <View pointerEvents="none" style={[styles.highlight, { left: rect.x, top: rect.y, width: rect.width, height: rect.height, borderRadius: corner }]} />}
      <View accessibilityViewIsModal importantForAccessibility="yes" style={[styles.bubble, layout, { backgroundColor: colors.surface, borderRadius: radius.lg, maxHeight: screen.height - insets.top - insets.bottom - 24 }]} onLayout={event => setBubbleHeight(Math.ceil(event.nativeEvent.layout.height))}>
        <Text style={[typography.caption, { color: colors.textMuted, marginBottom: 8 }, font(progress)]}>{progress}</Text>
        <ScrollView style={{ flexShrink: 1, maxHeight: Math.max(80, screen.height - insets.top - insets.bottom - 210) }}>
          <Text accessibilityRole="header" style={[typography.title, { fontSize: 20, color: colors.text, marginBottom: 10 }, font(title, '700')]}>{title}</Text>
          <Text style={[typography.body, { color: colors.textMuted, lineHeight: 24 }, font(body)]}>{body}</Text>
        </ScrollView>
        <View style={styles.controls}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('tooltips.skipButton')} onPress={skip} style={styles.secondary}>
            <Text style={[typography.caption, { color: colors.textMuted }, font(t('tooltips.skipButton'))]}>{t('tooltips.skipButton')}</Text>
          </Pressable>
          <View style={styles.stepButtons}>
            {tour.index > 0 && <Pressable accessibilityRole="button" onPress={back} style={styles.secondary}><Text style={[typography.button, { fontSize: 14, color: colors.text }, font(t('tooltips.backButton'), '700')]}>{t('tooltips.backButton')}</Text></Pressable>}
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} style={[styles.next, { backgroundColor: colors.accent, borderRadius: radius.md, opacity: busy ? 0.6 : 1 }]} onPress={next}>
              <Text style={[typography.button, { fontSize: 14, color: colors.accentText }, font(t(tour.index === tour.ids.length - 1 ? 'tooltips.doneButton' : 'tooltips.nextButton'), '700')]}>{t(tour.index === tour.ids.length - 1 ? 'tooltips.doneButton' : 'tooltips.nextButton')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 1000 },
  fill: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 },
  shade: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.58)' },
  highlight: { position: 'absolute', borderWidth: 2, borderColor: '#FFFFFF' },
  bubble: { position: 'absolute', padding: 18, shadowColor: '#000000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 10, elevation: 8 },
  controls: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', marginTop: 14, gap: 8 },
  secondary: { paddingVertical: 12, paddingHorizontal: 4, minHeight: 44, justifyContent: 'center' },
  stepButtons: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  next: { paddingVertical: 12, paddingHorizontal: 20, minHeight: 44, justifyContent: 'center' },
});
