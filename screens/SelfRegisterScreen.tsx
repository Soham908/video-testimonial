import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import type { PaletteColors } from '../theme/palettes';
import type { Spacing } from '../theme/spacing';
import type { Radius } from '../theme/radius';
import type { Typography } from '../theme/typography';
import { register } from '../auth';

interface Props {
  onRegistered: () => void;
  onBack: () => void;
}

// Real self-registration (ENABLE_SELF_REGISTRATION - API_CONTRACT.md's
// POST /register), only reachable when that flag is on (see LoginScreen's
// "New distributor? Register" link). Deliberately just a name field and a
// button - phone is optional/unverified per the contract and adds a second
// field for no real benefit at this stage, so it's omitted entirely rather
// than collected and left unused. Structure mirrors LoginScreen.tsx
// (title/subtitle/label/input/error/button-with-loading) rather than
// inventing new layout - this is the same shape of screen (an unauthenticated
// form that ends with a real token), not a themed "welcome" moment.
export function SelfRegisterScreen({ onRegistered, onBack }: Props) {
  const { colors, spacing, radius, typography } = useTheme();
  const styles = useMemo(() => makeStyles(colors, spacing, radius, typography), [colors, spacing, radius, typography]);

  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await register(name.trim());
      onRegistered();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <View>
        <Text style={styles.backLink} onPress={onBack}>
          ‹ Back to sign in
        </Text>
        <Text style={styles.title}>What's your name?</Text>
        <Text style={styles.subtitle}>This appears on your finished videos - you can change it later.</Text>

        <Text style={styles.label}>Your name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          autoFocus
          autoCapitalize="words"
          editable={!submitting}
          placeholderTextColor={colors.textDisabled}
        />

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable
          style={[styles.button, (submitting || !name.trim()) && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={submitting || !name.trim()}
        >
          {submitting ? (
            <ActivityIndicator color={colors.accentText} />
          ) : (
            <Text style={styles.buttonText}>Get started</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function makeStyles(colors: PaletteColors, spacing: Spacing, radius: Radius, typography: Typography) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      padding: spacing.xl,
      paddingTop: spacing.xxl + spacing.topExtra,
      paddingBottom: spacing.xxl,
    },
    backLink: {
      ...typography.body,
      fontSize: 15,
      fontWeight: '600',
      color: colors.textMuted,
      marginBottom: spacing.lg,
    },
    title: {
      ...typography.title,
      fontSize: 27,
      color: colors.text,
      marginBottom: spacing.sm,
    },
    subtitle: {
      ...typography.subtitle,
      color: colors.textMuted,
      lineHeight: 24,
      marginBottom: spacing.xl,
    },
    label: {
      ...typography.label,
      color: colors.textFaint,
      marginBottom: spacing.sm - 4,
    },
    input: {
      ...typography.body,
      height: 52,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      paddingHorizontal: spacing.md - 2,
      color: colors.text,
      marginBottom: spacing.md,
    },
    error: {
      ...typography.body,
      fontSize: 14,
      color: colors.danger,
      marginTop: spacing.xs,
    },
    button: {
      height: 60,
      marginTop: spacing.lg,
      backgroundColor: colors.accent,
      borderRadius: radius.lg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonDisabled: {
      opacity: 0.7,
    },
    buttonText: {
      ...typography.button,
      color: colors.accentText,
    },
  });
}
