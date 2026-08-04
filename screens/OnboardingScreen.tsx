import { useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import type { PaletteColors } from '../theme/palettes';
import type { Spacing } from '../theme/spacing';
import type { Radius } from '../theme/radius';
import type { Typography } from '../theme/typography';

interface Props {
  onGetStarted: () => void;
}

interface Step {
  eyebrow: string;
  title: string;
  body: string;
}

// Three swipes, one idea each - the middle one is the reward, shown rather
// than described (DECISIONS.md, 14B, replaces the old single-screen
// WelcomeScreen). No tab bar - this is a one-time, pre-login-adjacent
// sequence, not part of the main app shell.
const STEPS: Step[] = [
  {
    eyebrow: 'What you\'ll do',
    title: 'Answer 5 quick questions on camera',
    body: 'The app guides you one step at a time — good light, good framing, a quiet moment. About 10 minutes, start to finish.',
  },
  {
    eyebrow: 'What you get',
    title: 'You get five finished videos',
    body: 'We add the frame, your name and your shop. They come back to you to keep and to send to whoever you like.',
  },
  {
    eyebrow: 'Sharing them',
    title: 'Share your reel however you like',
    body: 'WhatsApp is the fastest way, and it\'s always your call — nothing goes out until you press send.',
  },
];

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export function OnboardingScreen({ onGetStarted }: Props) {
  const { colors, spacing, radius, typography } = useTheme();
  const styles = useMemo(() => makeStyles(colors, spacing, radius, typography), [colors, spacing, radius, typography]);
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);

  function goTo(nextIndex: number) {
    setIndex(nextIndex);
    scrollRef.current?.scrollTo({ x: nextIndex * SCREEN_WIDTH, animated: true });
  }

  function handleMomentumEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const next = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setIndex(next);
  }

  const isLast = index === STEPS.length - 1;

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <View style={{ flex: 1 }} />
        <Pressable onPress={onGetStarted}>
          <Text style={styles.skip}>Skip</Text>
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleMomentumEnd}
        style={styles.pager}
      >
        {STEPS.map((step, i) => (
          <View key={step.title} style={[styles.page, { width: SCREEN_WIDTH }]}>
            <View style={styles.artwork}>
              <Text style={styles.artworkGlyph}>{i === 1 ? '🎬' : i === 0 ? '💬' : '📲'}</Text>
            </View>
            <Text style={styles.eyebrow}>{step.eyebrow}</Text>
            <Text style={styles.title}>{step.title}</Text>
            <Text style={styles.body}>{step.body}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.bottomRow}>
        <Pressable onPress={() => goTo(Math.max(0, index - 1))} disabled={index === 0}>
          <Text style={[styles.back, index === 0 && styles.backHidden]}>Back</Text>
        </Pressable>

        <View style={styles.dots}>
          {STEPS.map((step, i) => (
            <View
              key={step.title}
              style={[styles.dot, i === index && styles.dotActive, i === index && { backgroundColor: colors.accent }]}
            />
          ))}
        </View>

        <Pressable
          style={styles.nextButton}
          onPress={() => (isLast ? onGetStarted() : goTo(index + 1))}
        >
          <Text style={styles.nextButtonText}>{isLast ? 'Get started' : 'Next'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function makeStyles(colors: PaletteColors, spacing: Spacing, radius: Radius, typography: Typography) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, paddingTop: spacing.xl },
    topRow: { flexDirection: 'row', paddingHorizontal: spacing.xl },
    skip: { ...typography.body, fontSize: 14, fontWeight: '600', color: colors.textMuted },
    pager: { flex: 1 },
    page: { flex: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
    artwork: {
      height: 260,
      borderRadius: radius.xl,
      backgroundColor: colors.canvas,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.xl,
    },
    artworkGlyph: { fontSize: 56 },
    eyebrow: {
      fontSize: 12.5,
      fontWeight: '700',
      letterSpacing: 1.5,
      textTransform: 'uppercase',
      color: colors.accent,
      marginBottom: spacing.sm,
    },
    title: {
      ...typography.title,
      fontSize: 27,
      color: colors.text,
      lineHeight: 34,
      marginBottom: spacing.sm,
    },
    body: { ...typography.body, color: colors.textMuted, lineHeight: 24 },
    bottomRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.xl,
      paddingBottom: spacing.xl,
      paddingTop: spacing.md,
    },
    back: { ...typography.body, fontSize: 14.5, fontWeight: '600', color: colors.textMuted, width: 56 },
    backHidden: { opacity: 0 },
    dots: { flexDirection: 'row', gap: 7 },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.borderStrong },
    dotActive: { width: 22 },
    nextButton: {
      backgroundColor: colors.accent,
      borderRadius: radius.md,
      paddingVertical: 13,
      paddingHorizontal: 26,
    },
    nextButtonText: { ...typography.button, fontSize: 15.5, color: colors.accentText },
  });
}
