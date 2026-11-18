import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PaletteColors } from '../theme/palettes';
import type { Spacing } from '../theme/spacing';
import type { Radius } from '../theme/radius';
import type { Typography } from '../theme/typography';
import { Button } from '../components/ui/Button';
import { ProgressBar } from '../components/ui/ProgressBar';
import { useStrings } from '../i18n/useStrings';
import { CompletionCheckmark } from '../components/CompletionFeedback';
import { containsDevanagari, devanagariFontFamily } from '../theme/fonts';

interface Props {
  onDone: () => void;
  // True for the whole window the batch is actually still sending -
  // AppFlow renders this screen the moment upload is confirmed, not only
  // once it finishes, so this screen has a live progress bar to show
  // instead of being reached only once there's nothing left to report.
  // Flips false once every segment has been confirmed by the backend.
  uploading: boolean;
  // 0-1, same value UploadingScreen used to show on its own button -
  // meaningless once `uploading` is false.
  progress: number;
  confirmedCount: number;
  totalCount: number;
  // When false (this build's default - see config.ts), no render job is
  // ever created server-side, so the normal "we'll message you when your
  // branded videos are ready" copy would be a promise that never gets
  // kept. Swapped for upload-only copy in that case.
  reelsEnabled: boolean;
}

// Released state's tail end (design 7c). Doubles as the live "sending"
// state now too (`uploading`) - previously this screen was only reached
// once the batch had already finished, which left its "keep your internet
// on until it finishes" copy describing an upload that was, by then,
// already over (a real logical bug, not just stale wording). "Record
// another" doesn't fit the locked product shape any more (5 fixed
// questions, one batch, no "another product" concept) - the only real
// exit is back to Home, available throughout (release semantics: the
// user isn't blocked here even while sending is still in progress).
export function ConfirmationScreen({ onDone, uploading, progress, confirmedCount, totalCount, reelsEnabled }: Props) {
  const { colors, spacing, radius, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors, spacing, radius, typography), [colors, spacing, radius, typography]);
  const { t } = useStrings();
  const sending = uploading || totalCount <= 0 || confirmedCount !== totalCount;
  const previousUploading = useRef(sending);
  const [completionEvent, setCompletionEvent] = useState(0);
  useEffect(() => {
    if (previousUploading.current && !sending) setCompletionEvent(value => value + 1);
    previousUploading.current = sending;
  }, [sending]);
  const font = (value: string, weight = '400') => containsDevanagari(value) ? { fontFamily: devanagariFontFamily(weight) } : undefined;

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom + spacing.edgeGap + spacing.footerGap }]}>
      <View style={styles.content}>
        {sending ? <View style={styles.checkCircle}>
            <ActivityIndicator size="large" color={colors.accentText} />
        </View> : <CompletionCheckmark eventId={completionEvent || undefined} style={{ marginBottom: spacing.xl }} />}
        <Text accessibilityRole="header" style={[styles.title, !sending && font(t('feedback.uploadCompleteTitle'), '700')]}>
          {sending ? t('confirmation.titleSending') : t('feedback.uploadCompleteTitle')}
        </Text>
        <Text style={[styles.subtitle, !sending && font(t(reelsEnabled ? 'confirmation.subtitleDoneReelsEnabled' : confirmedCount === 1 ? 'feedback.uploadCompleteBodySingular' : 'feedback.uploadCompleteBody'))]}>
          {sending
            ? t('confirmation.subtitleSending', { percent: Math.round(progress * 100) })
            : reelsEnabled
              ? t('confirmation.subtitleDoneReelsEnabled')
              : t(confirmedCount === 1 ? 'feedback.uploadCompleteBodySingular' : 'feedback.uploadCompleteBody', { count: confirmedCount })}
        </Text>
        <View style={[styles.reassuranceBox, sending && styles.reassuranceBoxWarning]}>
          {sending ? (
            <>
              <ProgressBar progress={progress} />
              <Text style={styles.reassuranceRowWarning}>{t('confirmation.reassuranceSending')}</Text>
            </>
          ) : (
            <>
              <Text accessibilityLiveRegion="polite" style={[styles.reassuranceRow, font(t('feedback.uploadReceived'))]}>{t('feedback.uploadReceived', { completed: confirmedCount, total: totalCount })}</Text>
              {reelsEnabled && <Text style={styles.reassuranceRow}>{t('confirmation.reassuranceDone2')}</Text>}
            </>
          )}
        </View>
      </View>
      <Button label={t('confirmation.backToHomeButton')} onPress={onDone} />
    </View>
  );
}

function makeStyles(colors: PaletteColors, spacing: Spacing, radius: Radius, typography: Typography) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      alignItems: 'center',
      padding: spacing.xl,
      paddingTop: spacing.xxl * 1.5 + spacing.topExtra,
      paddingBottom: spacing.footerBottom,
    },
    content: { flex: 1, alignItems: 'center' },
    checkCircle: {
      width: 104,
      height: 104,
      borderRadius: 52,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.xl,
    },
    checkmark: { fontSize: 40, fontWeight: '700', color: colors.accentText },
    title: { ...typography.title, fontSize: 26, color: colors.text, textAlign: 'center', marginBottom: spacing.sm },
    subtitle: { ...typography.body, color: colors.textMuted, textAlign: 'center', lineHeight: 24 },
    reassuranceBox: {
      marginTop: spacing.xl,
      alignSelf: 'stretch',
      gap: spacing.sm,
      backgroundColor: colors.canvas,
      borderRadius: radius.lg,
      padding: spacing.md,
    },
    // Distinct warning treatment only while the batch is actually
    // sending - this is the "don't close the app, you'll lose your
    // recordings" moment, and the previous plain-caption styling read as
    // routine/skippable copy rather than something worth actually reading
    // (real tester feedback). Once uploading is done there's nothing left
    // to lose by closing the app, so that state keeps the neutral box.
    reassuranceBoxWarning: {
      backgroundColor: colors.warningSoft,
      borderWidth: 1,
      borderColor: colors.warning,
    },
    reassuranceRow: { ...typography.caption, fontSize: 14, color: colors.text, lineHeight: 20 },
    reassuranceRowWarning: {
      ...typography.caption,
      fontSize: 15,
      fontWeight: '700',
      color: colors.warning,
      lineHeight: 21,
    },
  });
}
