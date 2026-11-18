import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import type { PaletteColors } from '../theme/palettes';
import type { Spacing } from '../theme/spacing';
import type { Radius } from '../theme/radius';
import type { Typography } from '../theme/typography';
import { register, loginByPhone } from '../auth';
import { ApiError } from '../api';
import { useStrings } from '../i18n/useStrings';
import { AuthFormLayout } from '../components/ui/AuthFormLayout';
import { LegalLinks } from '../components/LegalDocumentViewer';
import { PhoneNumberField } from '../components/ui/PhoneNumberField';
import { validPhone, type PhoneCountryCode } from '../phoneNumbers';

interface Props {
  onAuthenticated: () => void | Promise<void>;
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
  const [country, setCountry] = useState<PhoneCountryCode>('IN');
  const [password, setPassword] = useState('');
  const [useInvite, setUseInvite] = useState(false);
  const [organizationInvite, setOrganizationInvite] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set only by the 409 redirect below - a neutral notice, not an error,
  // since "this phone is already registered" is an expected case per the
  // contract, not a failure.
  const [notice, setNotice] = useState<string | null>(null);
  const phoneInput = useRef<TextInput>(null);
  const passwordInput = useRef<TextInput>(null);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const isRegister = mode === 'register';
  const canSubmit = isRegister
    ? name.trim().length > 0 && validPhone(phone, country, true) && password.length >= 8 && (!useInvite || /^[A-Za-z0-9_-]{43}$/.test(organizationInvite.trim()))
    : validPhone(phone, country) && password.length > 0;

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setNotice(null);
  }

  async function handleSubmit() {
    if (submitting || !canSubmit) return;
    Keyboard.dismiss();
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      if (isRegister) {
        await register(name.trim(), phone.trim(), password, useInvite ? organizationInvite.trim() : undefined, country);
      } else {
        await loginByPhone(phone.trim(), password, country);
      }
      await onAuthenticated();
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
    <AuthFormLayout contentStyle={styles.container}>
      <View>
        <View style={styles.logoBadge}>
          <Image source={require('../assets/Zeist-logo-white.png')} style={styles.logoMark} resizeMode="contain" />
        </View>
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
              style={[styles.input, focusedField === 'name' && styles.inputFocused]}
              accessibilityLabel={t('selfRegister.nameLabel')}
              value={name}
              maxLength={200}
              onChangeText={setName}
              autoCapitalize="words"
              editable={!submitting}
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => phoneInput.current?.focus()}
              onFocus={() => setFocusedField('name')}
              onBlur={() => setFocusedField(null)}
              placeholderTextColor={colors.textDisabled}
            />
          </>
        )}

        <PhoneNumberField ref={phoneInput} label={t('selfRegister.phoneLabel')} value={phone} country={country} onChangeText={setPhone} onCountryChange={setCountry} disabled={submitting} registering={isRegister} onNext={() => passwordInput.current?.focus()} />

        <Text style={styles.label}>{t('selfRegister.passwordLabel')}</Text>
        <TextInput
          ref={passwordInput}
          style={[styles.input, focusedField === 'password' && styles.inputFocused]}
          accessibilityLabel={t('selfRegister.passwordLabel')}
          value={password}
          onChangeText={setPassword}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          editable={!submitting}
          returnKeyType="done"
          onSubmitEditing={handleSubmit}
          onFocus={() => setFocusedField('password')}
          onBlur={() => setFocusedField(null)}
          placeholderTextColor={colors.textDisabled}
        />

        {isRegister && password.length > 0 && password.length < 8 && <Text accessibilityLiveRegion="polite" style={[styles.error, { marginTop: -8, marginBottom: 12, fontSize: 12 }]}>{t('selfRegister.passwordHint')}</Text>}

        {isRegister && <>
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: useInvite }} onPress={() => setUseInvite(v => !v)} disabled={submitting}>
            <Text style={styles.toggleLink}>{t('selfRegister.inviteToggle')} {useInvite ? '✓' : ''}</Text>
          </Pressable>
          {useInvite && <TextInput style={styles.input} accessibilityLabel={t('selfRegister.inviteLabel')} placeholder={t('selfRegister.inviteLabel')} placeholderTextColor={colors.textDisabled} value={organizationInvite} onChangeText={setOrganizationInvite} autoCapitalize="none" autoCorrect={false} maxLength={43} editable={!submitting} />}
        </>}
        {notice && <Text style={styles.notice}>{notice}</Text>}
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
    // Same accent-fill badge treatment as LoginScreen.tsx - this is now
    // the actual landing screen during internal testing (registration is
    // the entry point, not login), so it needs the same top-of-screen
    // brand mark Login has.
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
    inputFocused: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
    keyboardToolbar: { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, alignItems: 'flex-end' },
    keyboardNext: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
    keyboardNextText: { ...typography.body, fontWeight: '700', color: colors.accent },
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
