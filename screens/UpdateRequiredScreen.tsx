import { useMemo } from 'react';
import { Linking, Platform, StyleSheet, Text, View } from 'react-native';
import * as Application from 'expo-application';
import { useTheme } from '../theme/ThemeContext';
import type { PaletteColors } from '../theme/palettes';
import type { Spacing } from '../theme/spacing';
import type { Radius } from '../theme/radius';
import type { Typography } from '../theme/typography';
import { Button } from '../components/ui/Button';
import { useStrings } from '../i18n/useStrings';

// Hard block, no back/dismiss - rendered as AppFlow.tsx's first render
// check (ahead of every other screen, including a still-open video player)
// once distributorProfile.min_app_version is newer than what's installed
// (appVersion.ts's isVersionBelow). There is deliberately no way past this
// screen other than actually updating - unlike Permissions' denied state,
// which always offers a "not now"/back escape hatch.
//
// iOS has no App Store listing yet (CLAUDE.md - Android is what matters for
// now), so there's no real store URL to send anyone to there. Rather than
// ship a dead link, the button only renders on Android; iOS shows the same
// blocking message with no CTA until a real App Store listing exists.
export function UpdateRequiredScreen() {
  const { colors, spacing, radius, typography } = useTheme();
  const styles = useMemo(() => makeStyles(colors, spacing, radius, typography), [colors, spacing, radius, typography]);
  const { t } = useStrings();

  function openStore() {
    const packageName = Application.applicationId;
    if (!packageName) return;
    const marketUrl = `market://details?id=${packageName}`;
    const webUrl = `https://play.google.com/store/apps/details?id=${packageName}`;
    Linking.canOpenURL(marketUrl)
      .then((canOpen) => Linking.openURL(canOpen ? marketUrl : webUrl))
      .catch(() => Linking.openURL(webUrl).catch(() => {}));
  }

  return (
    <View style={styles.container}>
      <View style={styles.body}>
        <View style={styles.badgeRow}>
          <View style={styles.badgeIcon}>
            <View style={styles.badgeDot} />
          </View>
          <Text style={styles.badgeText}>{t('updateRequired.badge')}</Text>
        </View>
        <Text style={styles.title}>{t('updateRequired.title')}</Text>
        <Text style={styles.subtitle}>{t('updateRequired.subtitle')}</Text>
      </View>

      <View style={styles.spacer} />
      {Platform.OS === 'android' && (
        <View style={styles.footer}>
          <Button label={t('updateRequired.updateButton')} onPress={openStore} />
        </View>
      )}
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
    body: { marginTop: spacing.lg },
    badgeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    badgeIcon: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.warningSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2.5, borderColor: colors.warning },
    badgeText: {
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      color: colors.warning,
    },
    title: { ...typography.title, fontSize: 27, color: colors.text, marginTop: spacing.md, lineHeight: 33 },
    subtitle: { ...typography.body, color: colors.textMuted, lineHeight: 23, marginTop: spacing.sm },
    spacer: { flex: 1 },
    footer: { paddingBottom: spacing.sm },
  });
}
