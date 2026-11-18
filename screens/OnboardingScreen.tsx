import { useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { useStrings } from '../i18n/useStrings';
import { containsDevanagari, devanagariFontFamily } from '../theme/fonts';
import type { LanguageCode } from '../preferences';
import { Button } from '../components/ui/Button';

type StepKind = 'what' | 'why' | 'how';
const LANGUAGES: LanguageCode[] = ['en', 'hi', 'mr'];
const STEPS: StepKind[] = ['what', 'why', 'how'];

interface Props {
  language: LanguageCode | null;
  onChangeLanguage: (language: LanguageCode) => void;
  onGetStarted: () => void;
  onBack: () => void;
}

function scriptStyle(text: string, weight = '400') {
  return containsDevanagari(text) ? { fontFamily: devanagariFontFamily(weight) } : undefined;
}

// One language choice followed by three content cards: four stops in total.
// Keep the current card when reopening the picker; consent remains a separate gate.
export function OnboardingScreen({ language, onChangeLanguage, onGetStarted, onBack }: Props) {
  const { colors, spacing, radius, typography, themeDark } = useTheme();
  const { t } = useStrings();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const pager = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const [choosingLanguage, setChoosingLanguage] = useState(true);
  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, paddingTop: insets.top + spacing.edgeGap + spacing.sm },
    header: { paddingHorizontal: spacing.xl, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    brand: { ...typography.caption, color: colors.accent, fontWeight: '700', flex: 1 },
    textAction: { paddingVertical: spacing.md, minHeight: 48, justifyContent: 'center', flexShrink: 1 },
    textActionText: { ...typography.caption, color: colors.textMuted, fontWeight: '600' },
    content: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.lg },
    title: { ...typography.title, color: colors.text, lineHeight: 36 },
    body: { ...typography.body, color: colors.textMuted, lineHeight: 26 },
    choices: { gap: spacing.md },
    languageRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, minHeight: 72 },
    languageSelected: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
    languageText: { ...typography.button, color: colors.text },
    check: { fontSize: 22, fontWeight: '700', color: colors.accent },
    pager: { flex: 1 },
    page: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md, gap: spacing.md },
    artwork: { height: Math.min(240, Math.max(130, height * 0.24)), borderRadius: radius.xl, backgroundColor: themeDark.background, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, marginBottom: spacing.sm },
    eyebrow: { ...typography.label, color: colors.accent },
    footer: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: insets.bottom + spacing.edgeGap + spacing.footerGap, gap: spacing.sm },
    progress: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
    footerRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
    next: { flex: 1 },
    dots: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
    dot: { height: 6, width: 6, borderRadius: 3, backgroundColor: colors.borderStrong },
    activeDot: { width: 22, backgroundColor: colors.accent },
    illustrationCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, alignItems: 'center', gap: spacing.sm, minWidth: 150 },
    illustrationTitle: { ...typography.body, fontWeight: '700', color: colors.text, textAlign: 'center' },
    questionMark: { fontSize: 48, color: colors.accent, fontWeight: '700' },
    quote: { fontSize: 64, lineHeight: 70, color: colors.accentText },
    illustrationLightText: { ...typography.body, color: '#FFFFFF', textAlign: 'center', fontWeight: '700' },
    howList: { gap: spacing.md, alignSelf: 'stretch' },
    howRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
    howNumber: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
    howNumberText: { color: colors.accentText, fontWeight: '700' },
  }), [colors, spacing, radius, typography, themeDark, height, insets.top, insets.bottom]);

  function goTo(next: number) {
    const bounded = Math.max(0, Math.min(STEPS.length - 1, next));
    setIndex(bounded);
    pager.current?.scrollTo({ x: bounded * width, animated: true });
  }

  function goBack() {
    if (choosingLanguage) onBack();
    else if (index > 0) goTo(index - 1);
    else setChoosingLanguage(true);
  }

  useEffect(() => {
    if (!choosingLanguage) pager.current?.scrollTo({ x: index * width, animated: false });
    // The pager remounts when closing the picker; restore the current card.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, choosingLanguage]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { goBack(); return true; });
    return () => subscription.remove();
  }, [choosingLanguage, index, width, onBack]);

  function onSwipe(event: NativeSyntheticEvent<NativeScrollEvent>) {
    setIndex(Math.max(0, Math.min(STEPS.length - 1, Math.round(event.nativeEvent.contentOffset.x / width))));
  }

  const languageName = language ? t(`languageNames.${language}`) : '';
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {choosingLanguage ? (
          <>
            <Text style={styles.brand}>{t('splash.appName')}</Text>
            <Pressable accessibilityRole="button" onPress={onBack} style={styles.textAction}>
              <Text style={[styles.textActionText, scriptStyle(t('onboarding.backButton'))]}>{t('onboarding.backButton')}</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Pressable accessibilityRole="button" onPress={() => setChoosingLanguage(true)} style={[styles.textAction, { flex: 1 }]}>
              <Text style={[styles.textActionText, scriptStyle(languageName, '600')]}>{t('onboarding.changeLanguage')}: {languageName} ▾</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={onGetStarted} style={styles.textAction}>
              <Text style={[styles.textActionText, scriptStyle(t('onboarding.skipButton'))]}>{t('onboarding.skipButton')}</Text>
            </Pressable>
          </>
        )}
      </View>

      {choosingLanguage ? (
        <>
          <ScrollView contentContainerStyle={styles.content}>
            <Text accessibilityRole="header" style={[styles.title, scriptStyle(t('onboarding.languageTitle'), '700')]}>{t('onboarding.languageTitle')}</Text>
            <Text style={[styles.body, scriptStyle(t('onboarding.languageBody'))]}>{t('onboarding.languageBody')}</Text>
            <View accessibilityRole="radiogroup" style={styles.choices}>
              {LANGUAGES.map(code => (
                <Pressable key={code} accessibilityRole="radio" accessibilityState={{ checked: language === code }} accessibilityLabel={t(`languageNames.${code}`)} onPress={() => onChangeLanguage(code)} style={[styles.languageRow, language === code && styles.languageSelected]}>
                  <Text style={[styles.languageText, scriptStyle(t(`languageNames.${code}`), '700')]}>{t(`languageNames.${code}`)}</Text>
                  {language === code && <Text style={styles.check}>✓</Text>}
                </Pressable>
              ))}
            </View>
          </ScrollView>
          <View style={styles.footer}>
            {!language && <Text style={styles.progress}>{t('onboarding.languageHint')}</Text>}
            <Button label={t('onboarding.languageContinue')} textStyle={scriptStyle(t('onboarding.languageContinue'), '700')} disabled={!language} onPress={() => { if (language) setChoosingLanguage(false); }} />
          </View>
        </>
      ) : (
        <>
          <ScrollView ref={pager} horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={onSwipe} style={styles.pager}>
            {STEPS.map((kind, i) => (
              <ScrollView key={kind} style={{ width }} contentContainerStyle={styles.page}>
                <View style={styles.artwork} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  {kind === 'what' ? (
                    <View style={styles.illustrationCard}><Text style={styles.questionMark}>?</Text><Text style={[styles.illustrationTitle, scriptStyle(t('onboarding.whatBadge'), '700')]}>{t('onboarding.whatBadge')}</Text></View>
                  ) : kind === 'why' ? (
                    <><Text style={styles.quote}>“</Text><Text style={[styles.illustrationLightText, scriptStyle(t('onboarding.whyBadge'), '700')]}>{t('onboarding.whyBadge')}</Text></>
                  ) : (
                    <View style={styles.howList}>{[1, 2, 3].map(n => <View key={n} style={styles.howRow}><View style={styles.howNumber}><Text style={styles.howNumberText}>{n}</Text></View><Text style={[styles.illustrationLightText, { flex: 1, textAlign: 'left' }, scriptStyle(t(`onboarding.howStep${n}`), '700')]}>{t(`onboarding.howStep${n}`)}</Text></View>)}</View>
                  )}
                </View>
                <Text style={[styles.eyebrow, scriptStyle(t(`onboarding.step${i + 1}Eyebrow`), '700')]}>{t(`onboarding.step${i + 1}Eyebrow`)}</Text>
                <Text accessibilityRole="header" style={[styles.title, scriptStyle(t(`onboarding.step${i + 1}Title`), '700')]}>{t(`onboarding.step${i + 1}Title`)}</Text>
                <Text style={[styles.body, scriptStyle(t(`onboarding.step${i + 1}Body`))]}>{t(`onboarding.step${i + 1}Body`)}</Text>
              </ScrollView>
            ))}
          </ScrollView>
          <View style={styles.footer}>
            <Text accessibilityLiveRegion="polite" style={[styles.progress, scriptStyle(t('onboarding.cardProgress', { number: index + 1, total: STEPS.length }))]}>{t('onboarding.cardProgress', { number: index + 1, total: STEPS.length })}</Text>
            <View style={styles.dots} accessible={false}>{STEPS.map((kind, i) => <View key={kind} style={[styles.dot, index === i && styles.activeDot]} />)}</View>
            <View style={styles.footerRow}>
              <Button label={t('onboarding.backButton')} textStyle={scriptStyle(t('onboarding.backButton'), '700')} variant="quiet" onPress={goBack} />
              <Button label={t(index === STEPS.length - 1 ? 'onboarding.getStartedButton' : 'onboarding.nextButton')} textStyle={scriptStyle(t(index === STEPS.length - 1 ? 'onboarding.getStartedButton' : 'onboarding.nextButton'), '700')} onPress={() => index === STEPS.length - 1 ? onGetStarted() : goTo(index + 1)} style={styles.next} />
            </View>
          </View>
        </>
      )}
    </View>
  );
}
