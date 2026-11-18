import { LegalLinks } from '../components/LegalDocumentViewer';
import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { useStrings } from '../i18n/useStrings';
import type { PaletteColors } from '../theme/palettes';
import type { Spacing } from '../theme/spacing';
import type { Radius } from '../theme/radius';
import type { Typography } from '../theme/typography';
import { loginByPhone } from '../auth';
import { AuthFormLayout } from '../components/ui/AuthFormLayout';
import { PhoneNumberField } from '../components/ui/PhoneNumberField';
import { validPhone, type PhoneCountryCode } from '../phoneNumbers';

interface Props {
  onLoggedIn: () => void | Promise<void>;
  // Only passed when ENABLE_SELF_REGISTRATION is on (see AppFlow.tsx/
  // config.ts) - this screen doesn't need to know about the flag itself,
  // it just shows the entry point when a handler exists and stays exactly
  // as it is today when it doesn't.
  onRegisterPress?: () => void;
  // Set once by AppFlow.tsx right after api.ts's session-expired handler
  // forces a logout mid-flow - a distinct, calmer message from this
  // screen's own `error` state below (which is specifically "you just
  // typed the wrong password"), so a token dying doesn't read as a failed
  // login attempt.
  notice?: string;
  authenticate?: typeof loginByPhone;
  heading?: string;
  description?: string;
  signInLabel?: string;
  onRetryRecovery?: () => void;
  onUseAnotherAccount?: () => void;
  recoveryBusy?: boolean;
}

// Release login starts empty. Reviewer credentials belong in store review notes.
export function LoginScreen({ onLoggedIn, onRegisterPress, notice, authenticate = loginByPhone, heading, description, signInLabel, onRetryRecovery, onUseAnotherAccount, recoveryBusy = false }: Props) {
  const { colors, spacing, radius, typography } = useTheme();
  const styles = useMemo(() => makeStyles(colors, spacing, radius, typography), [colors, spacing, radius, typography]);
  const { t } = useStrings();

  const [username, setUsername] = useState('');
  const [country, setCountry] = useState<PhoneCountryCode>('IN');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordInput = useRef<TextInput>(null);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const canSubmit = validPhone(username, country) && password.length > 0 && !recoveryBusy;

  async function handleSubmit() {
    if (submitting || !canSubmit) return;
    Keyboard.dismiss();
    setSubmitting(true);
    setError(null);
    try {
      await authenticate(username, password, country);
      await onLoggedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('login.genericError'));
      setSubmitting(false);
    }
  }

  return (
    <AuthFormLayout contentStyle={styles.container}>
      <View>
        <View style={styles.logoBadge}>
          <Image source={require('../assets/Zeist-logo-white.png')} style={styles.logoMark} resizeMode="contain" />
        </View>
        <Text style={styles.title}>{heading ?? t('login.title')}</Text>
        <Text style={styles.subtitle}>{description ?? t('login.subtitle')}</Text>

        {notice && (
          <View style={styles.noticeBox}>
            <Text style={styles.noticeText}>{notice}</Text>
          </View>
        )}

        <PhoneNumberField label={t('login.usernameLabel')} value={username} country={country} onChangeText={setUsername} onCountryChange={setCountry} disabled={submitting || recoveryBusy} onNext={() => passwordInput.current?.focus()} />

        <Text style={styles.label}>{t('login.passwordLabel')}</Text>
        <TextInput
          ref={passwordInput}
          style={[styles.input, focusedField === 'password' && styles.inputFocused]}
          accessibilityLabel={t('login.passwordLabel')}
          value={password}
          onChangeText={setPassword}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          editable={!submitting && !recoveryBusy}
          returnKeyType="done"
          onSubmitEditing={handleSubmit}
          onFocus={() => setFocusedField('password')}
          onBlur={() => setFocusedField(null)}
          placeholderTextColor={colors.textDisabled}
        />

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable
          accessibilityRole="button"
          style={[styles.button, (submitting || !canSubmit) && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={submitting || !canSubmit}
        >
          {submitting ? (
            <ActivityIndicator color={colors.accentText} />
          ) : (
            <Text style={styles.buttonText}>{signInLabel ?? t('login.signInButton')}</Text>
          )}
        </Pressable>
        {onRetryRecovery && <Pressable accessibilityRole="button" onPress={onRetryRecovery} disabled={recoveryBusy || submitting} style={styles.registerLink}><Text style={styles.noticeText}>{recoveryBusy ? t('deletion.cleaning') : t('deletion.retry')}</Text></Pressable>}
        {onUseAnotherAccount && <Pressable accessibilityRole="button" onPress={onUseAnotherAccount} style={styles.registerLink}><Text style={styles.noticeText}>{t('deletion.useAnotherAccount')}</Text></Pressable>}

        {onRegisterPress && (
          <Text style={styles.registerLink} onPress={onRegisterPress}>
            {t('login.registerLink')}
          </Text>
        )}
        <LegalLinks />
      </View>
    </AuthFormLayout>
  );
}

function makeStyles(colors: PaletteColors, spacing: Spacing, radius: Radius, typography: Typography) {
  return StyleSheet.create({
    container: {
      flexGrow: 1,
      backgroundColor: colors.background,
      padding: spacing.xl,
      paddingTop: spacing.xxl + spacing.topExtra,
      paddingBottom: spacing.xxl,
    },
    // Real logo now (was a bordered "LOGO" text placeholder) - accent-fill
    // badge rather than the neutral canvas box the placeholder used, since
    // the logo art itself is white-on-transparent and needs a solid,
    // reasonably dark background (any client palette's accent works) to
    // actually read, the same treatment SplashScreen already uses it with.
    logoBadge: {
      width: 64,
      height: 64,
      borderRadius: radius.lg,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.lg,
    },
    logoMark: { width: 34, height: 40 },
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
    noticeBox: {
      backgroundColor: colors.warningSoft,
      borderRadius: radius.md,
      padding: spacing.md - 2,
      marginBottom: spacing.lg,
    },
    noticeText: {
      ...typography.body,
      fontSize: 14,
      color: colors.warning,
      lineHeight: 20,
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
    inputFocused: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
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
