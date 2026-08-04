import { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import type { PaletteColors } from '../theme/palettes';
import type { Spacing } from '../theme/spacing';
import type { Radius } from '../theme/radius';
import type { Typography } from '../theme/typography';
import { Button } from '../components/ui/Button';
import { ProgressBar } from '../components/ui/ProgressBar';
import { PopupSheet } from '../components/ui/Modal';

export interface UploadItem {
  questionIndex: number;
  label: string;
}

interface Props {
  items: UploadItem[];
  /** True once the user has confirmed and the real upload sequence is running. */
  uploading: boolean;
  // 0-1, driven by segment count (n of N uploaded), not upload bytes -
  // plain fetch doesn't expose byte-level progress, see upload.ts.
  progress: number;
  error: string | null;
  onConfirm: () => void;
  onRetry: () => void;
  onGoHome: () => void;
  onSendLater: () => void;
}

// Design 7a/7b/7c as one continuous screen: a plain list of everything
// going out (nothing individually selectable), a confirmation pop-up, then
// - once confirmed - the button itself becomes the progress bar and the
// list stops being interactive. No per-question upload any more; this is
// always the whole batch (DECISIONS.md).
export function UploadingScreen({
  items,
  uploading,
  progress,
  error,
  onConfirm,
  onRetry,
  onGoHome,
  onSendLater,
}: Props) {
  const { colors, spacing, radius, typography } = useTheme();
  const styles = useMemo(() => makeStyles(colors, spacing, radius, typography), [colors, spacing, radius, typography]);
  const [confirming, setConfirming] = useState(false);

  if (error) {
    return (
      <View style={styles.container}>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Text style={styles.title}>Sending stopped partway</Text>
          <Text style={styles.subtitle}>{error}</Text>
        </View>
        <View style={{ gap: spacing.sm }}>
          <Button label="Try again" onPress={onRetry} />
          <Button label="Send later" onPress={onSendLater} variant="secondary" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sending your answers</Text>
      <Text style={styles.subtitle}>
        {items.length} question{items.length === 1 ? '' : 's'}, going together.
      </Text>

      <ScrollView style={styles.list} contentContainerStyle={{ gap: spacing.xs + 1 }}>
        {items.map((item) => (
          <View key={item.questionIndex} style={[styles.row, uploading && styles.rowMuted]}>
            <Text style={styles.rowLabel}>{item.label}</Text>
          </View>
        ))}
      </ScrollView>

      {uploading ? (
        <View style={styles.progressArea}>
          <View style={styles.progressButton}>
            <ProgressBar progress={progress} onSolid />
          </View>
          <Text style={styles.guidance}>
            Keep the internet on and don't close the app - it finishes on its own.
          </Text>
          <Button label="Back to Home" onPress={onGoHome} variant="quiet" />
        </View>
      ) : (
        <Button label="Send all" onPress={() => setConfirming(true)} />
      )}

      <PopupSheet visible={confirming} onDismiss={() => setConfirming(false)}>
        <Text style={{ fontSize: 19, fontWeight: '700', color: colors.text, marginBottom: 8 }}>
          Send everything now?
        </Text>
        <Text style={{ fontSize: 14.5, color: colors.textMuted, lineHeight: 20, marginBottom: 20 }}>
          All {items.length} answers go together. Your branded videos come back afterward.
        </Text>
        <View style={{ gap: 10 }}>
          <Button
            label="Send now"
            onPress={() => {
              setConfirming(false);
              onConfirm();
            }}
          />
          <Button label="Not yet" variant="secondary" onPress={() => setConfirming(false)} />
        </View>
      </PopupSheet>
    </View>
  );
}

function makeStyles(colors: PaletteColors, spacing: Spacing, radius: Radius, typography: Typography) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, padding: spacing.xl, paddingTop: spacing.xxl, gap: spacing.md },
    title: { ...typography.title, fontSize: 25, color: colors.text },
    subtitle: { ...typography.body, color: colors.textMuted },
    list: { flex: 1, marginTop: spacing.sm },
    row: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingVertical: spacing.sm + 2,
      paddingHorizontal: spacing.md,
    },
    rowMuted: { opacity: 0.6 },
    rowLabel: { ...typography.body, fontSize: 14.5, fontWeight: '600', color: colors.text },
    progressArea: { gap: spacing.sm },
    progressButton: {
      backgroundColor: colors.accent,
      borderRadius: radius.lg,
      paddingVertical: 16,
      paddingHorizontal: 20,
    },
    guidance: { ...typography.caption, color: colors.textFaint, textAlign: 'center', lineHeight: 19 },
  });
}
