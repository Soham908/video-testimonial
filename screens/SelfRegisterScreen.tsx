import { useMemo, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import type { PaletteColors } from '../theme/palettes';
import type { Spacing } from '../theme/spacing';
import type { Radius } from '../theme/radius';
import type { Typography } from '../theme/typography';
import { register, loginByPhone } from '../auth';
import { ApiError } from '../api';
import { useStrings } from '../i18n/useStrings';

interface Props {
  onAuthenticated: () => void;
  onBack: () => void;
}

type Mode = 'register' | 'signIn';

// Combined register/sign-in for the phone+password self-registration path
// (ENABLE_SELF_REGISTRATION - API_CONTRACT.md's POST /register and
// POST /login/phone), only reachable when that flag is on (see LoginScreen's
// "New distributor? Register" link). One screen with a mode toggle rather
// than two separate screens - register() itself can require switching to
// sign-in mid-flow (a 409 on an already-registered phone), so the two modes
// need to live together rather than being separately-routed screens anyway.
// Structure mirrors LoginScreen.tsx (title/subtitle/label/input/error/
// button-with-loading) rather than inventing new layout.
export function SelfRegisterScreen({ onAuthenticated, onBack }: Props) {
  const { colors, spacing, radius, typography } = useTheme();
  const styles = useMemo(() => makeStyles(colors, spacing, radius, typography), [colors, spacing, radius, typography]);
  const { t } = useStrings();

  const [mode, setMode] = useState<Mode>('register');
  const [name, setName] = useState('');
  // Shared across both modes - phone is the same identifier either way, and
  // a 409-triggered switch into sign-in mode keeps whatever was typed here.
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set only by the 409 redirect below - a neutral notice, not an error,
  // since "this phone is already registered" is an expected case per the
  // contract, not a failure.
  const [notice, setNotice] = useState<string | null>(null);

  const isRegister = mode === 'register';
  const canSubmit = isRegister
    ? name.trim().length > 0 && phone.trim().length > 0 && password.length >= 6
    : phone.trim().length > 0 && password.length > 0;

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setNotice(null);
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      if (isRegister) {
        await register(name.trim(), phone.trim(), password);
      } else {
        await loginByPhone(phone.trim(), password);
      }
      onAuthenticated();
    } catch (err) {
      if (isRegister && err instanceof ApiError && err.code === 'phone_already_registered') {
        setMode('signIn');
        setNotice(err.message);
        setPassword('');
      } else {
        setError(err instanceof Error ? err.message : t('login.genericError'));
      }
      setSubmitting(false);
    }
  }

  return (
    <Pressable style={styles.container} onPress={Keyboard.dismiss}>
      <View>
        <Text style={styles.backLink} onPress={onBack}>
          {t('selfRegister.backLink')}
        </Text>
        <Text style={styles.title}>
          {isRegister ? t('selfRegister.registerTitle') : t('selfRegister.signInTitle')}
        </Text>
        <Text style={styles.subtitle}>
          {isRegister ? t('selfRegister.registerSubtitle') : t('selfRegister.signInSubtitle')}
        </Text>

        {isRegister && (
          <>
            <Text style={styles.label}>{t('selfRegister.nameLabel')}</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              editable={!submitting}
              placeholderTextColor={colors.textDisabled}
            />
          </>
        )}

        <Text style={styles.label}>{t('selfRegister.phoneLabel')}</Text>
        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          editable={!submitting}
          placeholderTextColor={colors.textDisabled}
        />

        <Text style={styles.label}>{t('selfRegister.passwordLabel')}</Text>
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

        {notice && <Text style={styles.notice}>{notice}</Text>}
        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable
          style={[styles.button, (submitting || !canSubmit) && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={submitting || !canSubmit}
        >
          {submitting ? (
            <ActivityIndicator color={colors.accentText} />
          ) : (
            <Text style={styles.buttonText}>
              {isRegister ? t('selfRegister.registerButton') : t('login.signInButton')}
            </Text>
          )}
        </Pressable>

        <Text
          style={styles.toggleLink}
          onPress={() => switchMode(isRegister ? 'signIn' : 'register')}
        >
          {isRegister ? t('selfRegister.switchToSignInLink') : t('selfRegister.switchToRegisterLink')}
        </Text>
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
    notice: {
      ...typography.body,
      fontSize: 14,
      color: colors.accent,
      marginTop: spacing.xs,
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
    toggleLink: {
      ...typography.body,
      fontSize: 14.5,
      fontWeight: '600',
      color: colors.accent,
      textAlign: 'center',
      marginTop: spacing.lg,
    },
  });
}
