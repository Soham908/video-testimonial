import { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import type { PaletteColors } from '../theme/palettes';
import type { Spacing } from '../theme/spacing';
import type { Radius } from '../theme/radius';
import type { Typography } from '../theme/typography';
import { Button } from '../components/ui/Button';
import { ProgressBar } from '../components/ui/ProgressBar';

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
export function ConfirmationScreen({ onDone, uploading, progress, reelsEnabled }: Props) {
  const { colors, spacing, radius, typography } = useTheme();
  const styles = useMemo(() => makeStyles(colors, spacing, radius, typography), [colors, spacing, radius, typography]);

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.checkCircle}>
          {uploading ? (
            <ActivityIndicator size="large" color={colors.accentText} />
          ) : (
            <Text style={styles.checkmark}>✓</Text>
          )}
        </View>
        <Text style={styles.title}>
          {uploading ? 'Sending your answers' : 'Your answers are on their way'}
        </Text>
        <Text style={styles.subtitle}>
          {uploading
            ? `${Math.round(progress * 100)}% sent - this can take a few minutes on slower connections.`
            : reelsEnabled
              ? "We'll let you know the moment your branded videos are ready."
              : 'Thanks for recording - your answers have been received.'}
        </Text>
        <View style={styles.reassuranceBox}>
          {uploading ? (
            <>
              <ProgressBar progress={progress} />
              <Text style={styles.reassuranceRow}>
                Keep your internet on and don't close the app - it finishes on its own.
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.reassuranceRow}>✓ Upload done - all your answers were received</Text>
              {reelsEnabled && (
                <Text style={styles.reassuranceRow}>✓ We'll message you when your videos are ready</Text>
              )}
            </>
          )}
        </View>
      </View>
      <Button label="Back to Home" onPress={onDone} />
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
      paddingTop: spacing.xxl * 1.5,
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
    reassuranceRow: { ...typography.caption, fontSize: 14, color: colors.text, lineHeight: 20 },
  });
}
