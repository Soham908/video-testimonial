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
  'Your camera and microphone will be used to record a short video.',
  'This video may be edited into a branded testimonial reel.',
  'A transcript will be generated and analyzed for sentiment and themes.',
  'You can redo any answer before submitting.',
];

export function ConsentScreen({ onAgree }: Props) {
  const [agreed, setAgreed] = useState(false);

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Before we start</Text>
        {CONSENT_POINTS.map((point) => (
          <View key={point} style={styles.pointRow}>
            <View style={styles.bullet} />
            <Text style={styles.pointText}>{point}</Text>
          </View>
        ))}
      </ScrollView>

      <Pressable
        style={styles.checkboxRow}
        onPress={() => setAgreed((v) => !v)}
      >
        <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>
          {agreed && <Text style={styles.checkmark}>✓</Text>}
        </View>
        <Text style={styles.checkboxLabel}>
          I understand and agree to be recorded.
        </Text>
      </Pressable>

      <Pressable
        style={[styles.button, !agreed && styles.buttonDisabled]}
        disabled={!agreed}
        onPress={onAgree}
      >
        <Text style={styles.buttonText}>Continue</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingTop: spacing.lg,
  },
  title: {
    ...typography.title,
    color: colors.text,
    marginBottom: spacing.lg,
  },
  pointRow: {
    flexDirection: 'row',
    marginBottom: spacing.md,
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
    marginTop: 8,
    marginRight: spacing.sm,
  },
  pointText: {
    ...typography.body,
    color: colors.textMuted,
    flex: 1,
    lineHeight: 21,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
    marginRight: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  checkmark: {
    color: colors.accentText,
    fontSize: 14,
    fontWeight: '700',
  },
  checkboxLabel: {
    ...typography.body,
    color: colors.text,
    flex: 1,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    ...typography.button,
    color: colors.accentText,
  },
});
