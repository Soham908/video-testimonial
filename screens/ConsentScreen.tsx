import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';

interface Props {
  onAgree: () => void;
}

// Placeholder consent copy, modeled on HeyGen's approach per CLAUDE.md.
// This is a mandatory gate before any recording - final wording needs a
// compliance review before shipping, this is a v1 UI scaffold only.
const CONSENT_POINTS = [
  'You will record a video of yourself answering 5 questions about your work.',
  'Your company may show this video on its website and to other distributors.',
  'Nothing is shared until you finish and press send. You can stop at any time.',
];

export function ConsentScreen({ onAgree }: Props) {
  const [agreed, setAgreed] = useState(false);

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Before we begin</Text>
        <Text style={styles.subtitle}>Please read this — it's important.</Text>
        <View style={styles.pointsGroup}>
          {CONSENT_POINTS.map((point) => (
            <View key={point} style={styles.pointRow}>
              <View style={styles.bullet} />
              <Text style={styles.pointText}>{point}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.link}>Read the full terms</Text>
      </ScrollView>

      <Pressable
        style={styles.checkboxRow}
        onPress={() => setAgreed((v) => !v)}
      >
        <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>
          {agreed && <Text style={styles.checkmark}>✓</Text>}
        </View>
        <Text style={styles.checkboxLabel}>
          I understand, and I agree to be recorded.
        </Text>
      </Pressable>

      <Pressable
        style={[styles.button, !agreed && styles.buttonDisabled]}
        disabled={!agreed}
        onPress={onAgree}
      >
        <Text style={[styles.buttonText, !agreed && styles.buttonTextDisabled]}>
          Agree & continue
        </Text>
      </Pressable>
      {!agreed && (
        <Text style={styles.hint}>Tick the box above to continue</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.xl,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xxl,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  title: {
    ...typography.title,
    color: colors.text,
  },
  subtitle: {
    ...typography.subtitle,
    color: colors.textFaint,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  pointsGroup: {
    gap: spacing.lg,
  },
  pointRow: {
    flexDirection: 'row',
    gap: spacing.sm + 2,
  },
  bullet: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.accent,
    marginTop: 7,
  },
  pointText: {
    ...typography.body,
    color: colors.text,
    flex: 1,
    lineHeight: 24,
  },
  link: {
    ...typography.body,
    fontSize: 15,
    fontWeight: '600',
    color: colors.accent,
    marginTop: spacing.lg,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  checkbox: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.textDisabled,
  },
  checkboxChecked: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: {
    color: colors.accentText,
    fontSize: 16,
    fontWeight: '700',
  },
  checkboxLabel: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
    lineHeight: 22,
  },
  button: {
    height: 60,
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    backgroundColor: colors.canvas,
  },
  buttonText: {
    ...typography.button,
    color: colors.accentText,
  },
  buttonTextDisabled: {
    color: colors.textDisabled,
  },
  hint: {
    ...typography.caption,
    color: colors.textFaint,
    textAlign: 'center',
    marginTop: spacing.sm + 4,
  },
});
