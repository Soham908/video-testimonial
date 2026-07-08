import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';

interface Props {
  onCreateNew: () => void;
}

const OTHER_TESTIMONIALS = ['Sunita · Indore', 'Vijay · Nagpur', 'Meena · Patna'];

// Return-visit dashboard (design screen 2a) - greeting, primary record CTA,
// and two placeholder content sections (how-it-works video, other
// distributors' testimonials) that don't have real data/backends yet.
export function HomeScreen({ onCreateNew }: Props) {
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <Text style={styles.greeting}>Welcome back</Text>
      <Text style={styles.subGreeting}>Distributor</Text>

      <Pressable style={styles.ctaCard} onPress={onCreateNew}>
        <View style={styles.ctaIconCircle}>
          <View style={styles.ctaIconCamera}>
            <View style={styles.ctaIconLens} />
          </View>
        </View>
        <View style={styles.ctaText}>
          <Text style={styles.ctaTitle}>Record a new testimonial</Text>
          <Text style={styles.ctaSubtitle}>For your next campaign</Text>
        </View>
      </Pressable>

      <View style={styles.howItWorksCard}>
        <View style={styles.howItWorksThumb}>
          <View style={styles.playCircle}>
            <View style={styles.playTriangle} />
          </View>
        </View>
        <View>
          <Text style={styles.howItWorksLabel}>HOW IT WORKS</Text>
          <Text style={styles.howItWorksTitle}>Watch a 1-minute guide</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>See what others are saying</Text>
      <View style={styles.carousel}>
        {OTHER_TESTIMONIALS.map((name) => (
          <View key={name} style={styles.carouselItem}>
            <View style={styles.carouselThumb}>
              <View style={styles.playCircleSmall}>
                <View style={styles.playTriangleSmall} />
              </View>
            </View>
            <Text style={styles.carouselName}>{name}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  greeting: {
    ...typography.title,
    fontSize: 24,
    color: colors.text,
  },
  subGreeting: {
    ...typography.body,
    fontSize: 14,
    color: colors.textFaint,
    marginTop: 2,
  },
  ctaCard: {
    marginTop: spacing.lg - 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md - 2,
    padding: spacing.md + 2,
    borderRadius: radius.lg,
    backgroundColor: colors.accent,
  },
  ctaIconCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaIconCamera: {
    width: 26,
    height: 19,
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaIconLens: {
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: colors.accent,
  },
  ctaText: {
    gap: 2,
  },
  ctaTitle: {
    ...typography.body,
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  ctaSubtitle: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.8)',
  },
  howItWorksCard: {
    marginTop: spacing.md - 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md - 2,
    padding: spacing.sm + 4,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  howItWorksThumb: {
    width: 110,
    height: 64,
    borderRadius: radius.sm + 2,
    backgroundColor: '#1E211F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playTriangle: {
    width: 0,
    height: 0,
    borderTopWidth: 6,
    borderBottomWidth: 6,
    borderLeftWidth: 10,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: colors.text,
    marginLeft: 3,
  },
  howItWorksLabel: {
    ...typography.label,
    fontSize: 12,
    color: colors.accent,
  },
  howItWorksTitle: {
    ...typography.body,
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    marginTop: 3,
    lineHeight: 20,
  },
  sectionTitle: {
    ...typography.body,
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginTop: spacing.lg + 2,
  },
  carousel: {
    flexDirection: 'row',
    gap: spacing.md - 4,
    marginTop: spacing.md - 4,
  },
  carouselItem: {
    width: 112,
  },
  carouselThumb: {
    width: 112,
    height: 150,
    borderRadius: radius.md - 2,
    backgroundColor: '#1E211F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playCircleSmall: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playTriangleSmall: {
    width: 0,
    height: 0,
    borderTopWidth: 6,
    borderBottomWidth: 6,
    borderLeftWidth: 9,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: colors.text,
    marginLeft: 3,
  },
  carouselName: {
    ...typography.caption,
    fontSize: 12.5,
    fontWeight: '600',
    color: colors.textMuted,
    marginTop: spacing.xs + 2,
  },
});
