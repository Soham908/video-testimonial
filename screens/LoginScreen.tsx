import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import type { PaletteColors } from '../theme/palettes';
import type { Spacing } from '../theme/spacing';
import type { Radius } from '../theme/radius';
import type { Typography } from '../theme/typography';
import { login } from '../auth';

interface Props {
  onLoggedIn: () => void;
}

// Prefilled with a seeded test account - there's no self-serve account
// creation, distributors are provisioned backend-side. Prefill is a
// testing convenience while Soham is the only person signing in; revisit
// before this goes to real distributors.
export function LoginScreen({ onLoggedIn }: Props) {
  const { colors, spacing, radius, typography } = useTheme();
  const styles = useMemo(() => makeStyles(colors, spacing, radius, typography), [colors, spacing, radius, typography]);

  const [username, setUsername] = useState('kumar');
  const [password, setPassword] = useState('kumar123');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await login(username, password);
      onLoggedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.logoPlaceholder}>
          <Text style={styles.logoPlaceholderText}>LOGO</Text>
        </View>
        <Text style={styles.title}>Sign in</Text>
        <Text style={styles.subtitle}>
          Use the account your company gave you to get started.
        </Text>

        <Text style={styles.label}>Username</Text>
        <TextInput
          style={styles.input}
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!submitting}
          placeholderTextColor={colors.textDisabled}
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          editable={!submitting}
          placeholderTextColor={colors.textDisabled}
        />

        {error && <Text style={styles.error}>{error}</Text>}
      </View>

      <Pressable
        style={[styles.button, submitting && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={submitting}
      >
        {submitting ? (
          <ActivityIndicator color={colors.accentText} />
        ) : (
          <Text style={styles.buttonText}>Sign in</Text>
        )}
      </Pressable>
    </View>
  );
}

function makeStyles(colors: PaletteColors, spacing: Spacing, radius: Radius, typography: Typography) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      padding: spacing.xl,
      paddingTop: spacing.xxl,
      paddingBottom: spacing.xxl,
    },
    content: {
      flex: 1,
    },
    logoPlaceholder: {
      width: 64,
      height: 64,
      borderRadius: radius.lg,
      backgroundColor: colors.canvas,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.lg,
    },
    logoPlaceholderText: {
      ...typography.caption,
      fontSize: 10,
      color: colors.textDisabled,
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
