import { useMemo, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { useStrings } from '../i18n/useStrings';
import type { PaletteColors } from '../theme/palettes';
import type { Spacing } from '../theme/spacing';
import type { Radius } from '../theme/radius';
import type { Typography } from '../theme/typography';
import { login } from '../auth';

interface Props {
  onLoggedIn: () => void;
  // Only passed when ENABLE_SELF_REGISTRATION is on (see AppFlow.tsx/
  // config.ts) - this screen doesn't need to know about the flag itself,
  // it just shows the entry point when a handler exists and stays exactly
  // as it is today when it doesn't.
  onRegisterPress?: () => void;
}

// Prefilled with a seeded test account - there's no self-serve account
// creation, distributors are provisioned backend-side. Prefill is a
// testing convenience while Soham is the only person signing in; revisit
// before this goes to real distributors.
export function LoginScreen({ onLoggedIn, onRegisterPress }: Props) {
  const { colors, spacing, radius, typography } = useTheme();
  const styles = useMemo(() => makeStyles(colors, spacing, radius, typography), [colors, spacing, radius, typography]);
  const { t } = useStrings();

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
      setError(err instanceof Error ? err.message : t('login.genericError'));
      setSubmitting(false);
    }
  }

  return (
    <Pressable style={styles.container} onPress={Keyboard.dismiss}>
      <View>
        <View style={styles.logoPlaceholder}>
          <Text style={styles.logoPlaceholderText}>{t('login.logoPlaceholder')}</Text>
        </View>
        <Text style={styles.title}>{t('login.title')}</Text>
        <Text style={styles.subtitle}>{t('login.subtitle')}</Text>

        <Text style={styles.label}>{t('login.usernameLabel')}</Text>
        <TextInput
          style={styles.input}
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!submitting}
          placeholderTextColor={colors.textDisabled}
        />

        <Text style={styles.label}>{t('login.passwordLabel')}</Text>
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

        <Pressable
          style={[styles.button, submitting && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color={colors.accentText} />
          ) : (
            <Text style={styles.buttonText}>{t('login.signInButton')}</Text>
          )}
        </Pressable>

        {onRegisterPress && (
          <Text style={styles.registerLink} onPress={onRegisterPress}>
            {t('login.registerLink')}
          </Text>
        )}
      </View>
    </Pressable>
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
    registerLink: {
      ...typography.body,
      fontSize: 14.5,
      fontWeight: '600',
      color: colors.accent,
      textAlign: 'center',
      marginTop: spacing.lg,
    },
  });
}
