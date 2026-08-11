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
import type { PaletteColors, PaletteDarkColors } from '../theme/palettes';
import type { Spacing } from '../theme/spacing';
import type { Radius } from '../theme/radius';
import type { Typography } from '../theme/typography';

interface Props {
  onGetStarted: () => void;
}

type StepVariant = 'ask' | 'reward' | 'share';

interface Step {
  variant: StepVariant;
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
    variant: 'ask',
    eyebrow: 'What you\'ll do',
    title: 'Answer 5 quick questions on camera',
    body: 'The app guides you one step at a time — good light, good framing, a quiet moment. About 10 minutes, start to finish.',
  },
  {
    variant: 'reward',
    eyebrow: 'What you get',
    title: 'You get five finished videos',
    body: 'We add the frame, your name and your shop. They come back to you to keep and to send to whoever you like.',
  },
  {
    variant: 'share',
    eyebrow: 'Sharing them',
    title: 'Share your reel however you like',
    body: 'WhatsApp is the fastest way, and it\'s always your call — nothing goes out until you press send.',
  },
];

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export function OnboardingScreen({ onGetStarted }: Props) {
  const { colors, themeDark, spacing, radius, typography } = useTheme();
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
        {STEPS.map((step) => (
          <View key={step.title} style={[styles.page, { width: SCREEN_WIDTH }]}>
            <View style={styles.artwork}>
              <StepIllustration variant={step.variant} styles={styles} themeDark={themeDark} accent={colors.accent} />
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

// Per-step artwork - a dark "device mockup" card echoing the approved design
// export (14B), not a floating emoji. `themeDark` is the same fixed dark
// token used for the camera-mode chrome elsewhere, reused here so the card
// looks intentional rather than like a random hardcoded color.
function StepIllustration({
  variant,
  styles,
  themeDark,
  accent,
}: {
  variant: StepVariant;
  styles: ReturnType<typeof makeStyles>;
  themeDark: PaletteDarkColors;
  accent: string;
}) {
  const cardStyle = [styles.illoCard, { backgroundColor: themeDark.background }];

  if (variant === 'ask') {
    return (
      <View style={cardStyle}>
        <View style={styles.illoQuestionCard}>
          <View style={styles.illoDotsRow}>
            {[0, 1, 2, 3, 4].map((i) => (
              <View key={i} style={[styles.illoDot, i === 0 && { backgroundColor: accent }]} />
            ))}
          </View>
          <View style={[styles.illoPlayCircle, { backgroundColor: accent }]}>
            <View style={styles.illoPlayTriangle} />
          </View>
        </View>
      </View>
    );
  }

  if (variant === 'reward') {
    return (
      <View style={cardStyle}>
        <View style={styles.illoBadge}>
          <Text style={styles.illoBadgeText}>YOUR VIDEO</Text>
        </View>
        <View style={[styles.illoPhoneCard, { backgroundColor: themeDark.chromeStrong }]}>
          <View style={styles.illoAvatarBlock} />
          <Text style={styles.illoPhoneName}>Mahesh Agrawal</Text>
          <Text style={styles.illoPhoneSubtitle}>Agrawal Traders</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={cardStyle}>
      <View style={styles.illoChatStack}>
        <View style={styles.illoBubbleIncoming} />
        <View style={[styles.illoBubbleOutgoing, { backgroundColor: accent }]}>
          <Text style={styles.illoCheckGlyph}>✓✓</Text>
        </View>
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
      height: 330,
      borderRadius: radius.xl,
      overflow: 'hidden',
      marginBottom: spacing.xl,
    },
    illoCard: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    // 'ask' variant - a mini question card with a progress-dots row and a
    // play glyph, echoing Home's own question card treatment.
    illoQuestionCard: {
      width: 170,
      borderRadius: radius.lg,
      backgroundColor: '#FFFFFF',
      paddingVertical: spacing.lg,
      alignItems: 'center',
      gap: spacing.md,
    },
    illoDotsRow: { flexDirection: 'row', gap: 5 },
    illoDot: { width: 10, height: 4, borderRadius: 2, backgroundColor: '#E4DBCF' },
    illoPlayCircle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    illoPlayTriangle: {
      width: 0,
      height: 0,
      borderTopWidth: 8,
      borderBottomWidth: 8,
      borderLeftWidth: 13,
      borderTopColor: 'transparent',
      borderBottomColor: 'transparent',
      borderLeftColor: '#FFFFFF',
      marginLeft: 4,
    },
    // 'reward' variant - matches the approved design export (14B) almost
    // exactly: a phone-card mockup with a "YOUR VIDEO" badge.
    illoBadge: {
      position: 'absolute',
      top: spacing.md,
      left: spacing.md,
      backgroundColor: 'rgba(255,255,255,0.14)',
      borderRadius: radius.pill,
      paddingVertical: 6,
      paddingHorizontal: 11,
    },
    illoBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
    illoPhoneCard: {
      width: 150,
      height: 250,
      borderRadius: radius.lg,
      padding: spacing.md,
      flexDirection: 'column',
    },
    illoAvatarBlock: { width: 34, height: 34, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.16)', marginBottom: 'auto' },
    illoPhoneName: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
    illoPhoneSubtitle: { color: 'rgba(255,255,255,0.62)', fontSize: 12, marginTop: 2 },
    // 'share' variant - a two-bubble chat exchange (incoming, then an
    // outgoing message with a read receipt) - immediately reads as
    // "sharing/WhatsApp" the way a generic send-arrow glyph didn't.
    illoChatStack: { width: 190, gap: 10 },
    illoBubbleIncoming: {
      alignSelf: 'flex-start',
      width: 88,
      height: 32,
      borderRadius: 16,
      borderBottomLeftRadius: 4,
      backgroundColor: '#FFFFFF',
    },
    illoBubbleOutgoing: {
      alignSelf: 'flex-end',
      width: 122,
      height: 44,
      borderRadius: 16,
      borderBottomRightRadius: 4,
      alignItems: 'flex-end',
      justifyContent: 'flex-end',
      paddingRight: 10,
      paddingBottom: 6,
    },
    illoCheckGlyph: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '700' },
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
      paddingBottom: spacing.footerBottom,
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
