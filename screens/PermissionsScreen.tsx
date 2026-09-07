import { useMemo } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useCameraPermission, useMicrophonePermission } from 'react-native-vision-camera';
import { useTheme } from '../theme/ThemeContext';
import type { PaletteColors } from '../theme/palettes';
import type { Spacing } from '../theme/spacing';
import type { Radius } from '../theme/radius';
import type { Typography } from '../theme/typography';
import { Button } from '../components/ui/Button';
import { useStrings } from '../i18n/useStrings';

interface Props {
  onContinue: () => void;
  /** Where "Not now" / "Back to the question" return to - Home, in practice. */
  onBack?: () => void;
}

// Pre-permission explainer, shown only when "Record a new testimonial" is
// tapped, right before the camera screen mounts. CameraAlignment already
// handles the actual OS camera/mic permission *requests* (sequenced there,
// see DEV_NOTES.md) - this screen only *reads* status, via the same
// react-native-vision-camera APIs, to decide which of two states to show.
//
// Permissions are detected on every entry, not shown once (DECISIONS.md) -
// the OS won't re-prompt after a denial, so a distributor who denied once
// needs an explicit path to Settings, not a repeat of the same ask.
//
// Structure matches design 13A/13B: a per-question header (this is reached
// mid-flow, not during onboarding), one card per permission with its own
// reason, a "here's what we promise" box, and a quiet secondary way out
// instead of a dead end.
export function PermissionsScreen({ onContinue, onBack }: Props) {
  const { colors, spacing, radius, typography } = useTheme();
  const styles = useMemo(() => makeStyles(colors, spacing, radius, typography), [colors, spacing, radius, typography]);
  const { t } = useStrings();

  // Both hooks already re-check on every AppState 'active' transition (see
  // usePermission.ts), so returning from Settings after granting updates
  // this automatically - no extra polling needed here.
  const camera = useCameraPermission();
  const microphone = useMicrophonePermission();
  const denied =
    (!camera.hasPermission && !camera.canRequestPermission) ||
    (!microphone.hasPermission && !microphone.canRequestPermission);

  const header = onBack && (
    <View style={styles.headerRow}>
      <Pressable style={styles.backRow} onPress={onBack} hitSlop={8}>
        <Text style={styles.backChevron}>‹</Text>
        <Text style={styles.headerTitle}>{t('permissions.backButton')}</Text>
      </Pressable>
    </View>
  );

  if (denied) {
    return (
      <View style={styles.container}>
        {header}
        <View style={styles.body}>
          <View style={styles.deniedBadgeRow}>
            <View style={styles.deniedBadgeIcon}>
              <View style={styles.iconLensSmall} />
            </View>
            <Text style={styles.deniedBadgeText}>{t('permissions.deniedBadge')}</Text>
          </View>
          <Text style={styles.title}>{t('permissions.deniedTitle')}</Text>
          <Text style={styles.subtitle}>{t('permissions.deniedSubtitle')}</Text>

          <View style={styles.stepsCard}>
            {[
              t('permissions.deniedStep1'),
              t('permissions.deniedStep2'),
              t('permissions.deniedStep3'),
            ].map((step, i) => (
              <View key={step} style={[styles.stepRow, i < 2 && styles.stepRowBorder]}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>{i + 1}</Text>
                </View>
                <Text style={styles.stepText}>{step}</Text>
              </View>
            ))}
          </View>

          <View style={styles.reassuranceBox}>
            <View style={styles.reassuranceDot} />
            <Text style={styles.reassuranceText}>{t('permissions.deniedReassurance')}</Text>
          </View>
        </View>

        <View style={styles.spacer} />
        <View style={styles.footer}>
          <Button label={t('permissions.deniedOpenSettingsButton')} onPress={() => Linking.openSettings()} />
          {onBack && (
            <Button label={t('permissions.deniedBackButton')} onPress={onBack} variant="secondary" />
          )}
          <Text style={styles.helpHint}>{t('permissions.deniedHelpHint')}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {header}
      <View style={styles.body}>
        <Text style={styles.title}>{t('permissions.grantedTitle')}</Text>
        <Text style={styles.subtitle}>{t('permissions.grantedSubtitle')}</Text>

        <View style={styles.permissionCards}>
          <View style={styles.permissionCard}>
            <View style={styles.permissionIcon}>
              <View style={styles.iconCamera}>
                <View style={styles.iconLens} />
              </View>
            </View>
            <View style={styles.permissionCardText}>
              <Text style={styles.permissionCardTitle}>{t('permissions.cameraCardTitle')}</Text>
              <Text style={styles.permissionCardBody}>{t('permissions.cameraCardBody')}</Text>
            </View>
          </View>
          <View style={styles.permissionCard}>
            <View style={styles.permissionIcon}>
              <View style={styles.iconMicWrap}>
                <View style={styles.iconMicCapsule} />
                <View style={styles.iconMicStem} />
                <View style={styles.iconMicBase} />
              </View>
            </View>
            <View style={styles.permissionCardText}>
              <Text style={styles.permissionCardTitle}>{t('permissions.microphoneCardTitle')}</Text>
              <Text style={styles.permissionCardBody}>{t('permissions.microphoneCardBody')}</Text>
            </View>
          </View>
        </View>

        <View style={styles.promisesBox}>
          <View style={styles.promiseRow}>
            <View style={styles.reassuranceDot} />
            <Text style={styles.reassuranceText}>{t('permissions.promise1')}</Text>
          </View>
          <View style={styles.promiseRow}>
            <View style={styles.reassuranceDot} />
            <Text style={styles.reassuranceText}>{t('permissions.promise2')}</Text>
          </View>
        </View>
      </View>

      <View style={styles.spacer} />
      <View style={styles.footer}>
        <Button label={t('permissions.allowButton')} onPress={onContinue} />
        {onBack && (
          <Text style={styles.notNow} onPress={onBack}>
            {t('permissions.notNowButton')}
          </Text>
        )}
      </View>
    </View>
  );
}

function makeStyles(colors: PaletteColors, spacing: Spacing, radius: Radius, typography: Typography) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.xxl + spacing.topExtra,
      paddingBottom: spacing.footerBottom,
    },
    headerRow: { flexDirection: 'row' },
    // One tappable row (arrow + label), not an arrow-only hit target -
    // same fix as QuestionBriefScreen's own back control. Matching
    // lineHeight on both Texts gives alignItems:'center' identical boxes
    // to center; the chevron glyph still sits low within its own box
    // regardless, hence the small negative marginTop nudge.
    backRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2 },
    backChevron: { fontSize: 24, fontWeight: '700', color: colors.text, lineHeight: 24, marginTop: -2 },
    headerTitle: { ...typography.body, fontSize: 15.5, fontWeight: '700', color: colors.text, lineHeight: 24 },
    body: { marginTop: spacing.md },
    iconCamera: {
      width: 46,
      height: 34,
      borderRadius: 9,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconLens: { width: 16, height: 16, borderRadius: 8, borderWidth: 3, borderColor: colors.accentText },
    // Capsule + stem + base reads as a mic silhouette, not just a blob -
    // matches the camera icon's level of shape detail.
    iconMicWrap: { alignItems: 'center', justifyContent: 'center' },
    iconMicCapsule: { width: 18, height: 26, borderRadius: 9, backgroundColor: colors.accent },
    iconMicStem: { width: 3, height: 8, backgroundColor: colors.accent, marginTop: 2 },
    iconMicBase: { width: 16, height: 3, borderRadius: 1.5, backgroundColor: colors.accent, marginTop: 2 },
    iconLensSmall: { width: 12, height: 12, borderRadius: 6, borderWidth: 2.5, borderColor: colors.warning },
    title: {
      ...typography.title,
      fontSize: 27,
      color: colors.text,
      marginTop: spacing.md,
      lineHeight: 33,
    },
    subtitle: {
      ...typography.body,
      color: colors.textMuted,
      lineHeight: 23,
      marginTop: spacing.sm,
    },
    permissionCards: { gap: spacing.sm + 2, marginTop: spacing.lg },
    permissionCard: {
      flexDirection: 'row',
      gap: spacing.md,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.md,
    },
    permissionIcon: {
      width: 46,
      height: 46,
      borderRadius: radius.md,
      backgroundColor: colors.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    permissionCardText: { flex: 1, gap: 5 },
    permissionCardTitle: { ...typography.body, fontSize: 16.5, fontWeight: '700', color: colors.text },
    permissionCardBody: { ...typography.caption, fontSize: 14, color: colors.textMuted, lineHeight: 20 },
    promisesBox: {
      marginTop: spacing.md,
      gap: spacing.sm,
      backgroundColor: colors.canvas,
      borderRadius: radius.lg,
      padding: spacing.md,
    },
    promiseRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
    reassuranceBox: {
      marginTop: spacing.md,
      flexDirection: 'row',
      gap: spacing.sm,
      alignItems: 'flex-start',
      backgroundColor: colors.canvas,
      borderRadius: radius.lg,
      padding: spacing.md,
    },
    reassuranceDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: colors.success,
      marginTop: 6,
    },
    reassuranceText: { ...typography.caption, fontSize: 13.5, color: colors.text, flex: 1, lineHeight: 20 },
    deniedBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    deniedBadgeIcon: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.warningSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    deniedBadgeText: {
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      color: colors.warning,
    },
    stepsCard: {
      marginTop: spacing.lg,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      paddingHorizontal: spacing.md,
    },
    stepRow: { flexDirection: 'row', gap: spacing.sm + 2, alignItems: 'flex-start', paddingVertical: spacing.sm + 4 },
    stepRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
    stepNumber: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: colors.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepNumberText: { fontSize: 13, fontWeight: '700', color: colors.accent },
    stepText: { ...typography.body, fontSize: 15, lineHeight: 21, flex: 1 },
    spacer: { flex: 1 },
    footer: { gap: spacing.sm + 2, paddingBottom: spacing.sm },
    helpHint: { ...typography.caption, fontSize: 12.5, color: colors.textFaint, textAlign: 'center', lineHeight: 18 },
    notNow: { ...typography.body, fontSize: 14.5, fontWeight: '600', color: colors.textMuted, textAlign: 'center' },
  });
}
