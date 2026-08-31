import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import type { PaletteColors } from '../theme/palettes';
import type { Spacing } from '../theme/spacing';
import type { Radius } from '../theme/radius';
import type { Typography } from '../theme/typography';
import { Button } from '../components/ui/Button';
import { PopupSheet } from '../components/ui/Modal';

export interface UploadItem {
  questionIndex: number;
  label: string;
  questionText?: string;
  takeLabel?: string;
  durationSeconds?: number;
}

interface Props {
  items: UploadItem[];
  error: string | null;
  onConfirm: () => void;
  onRetry: () => void;
  onSendLater: () => void;
  /** Row tap - back to that question's review/trim (design 7a). */
  onReviewItem?: (questionIndex: number) => void;
  onBack?: () => void;
}

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Design 7a/7b: a plain list of everything going out (nothing individually
// selectable) plus a confirmation pop-up. No per-question upload any more;
// this is always the whole batch (DECISIONS.md). Once confirmed, AppFlow
// stops rendering this component altogether in favor of ConfirmationScreen
// (design 7c) - which is where the live progress bar and "sending vs.
// done" messaging now live, so that screen has something to show instead
// of being reached only once there's nothing left to report. This
// component only reappears if an error happens (Try again / Send later).
export function UploadingScreen({
  items,
  error,
  onConfirm,
  onRetry,
  onSendLater,
  onReviewItem,
  onBack,
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

  const totalSeconds = items.reduce((sum, item) => sum + (item.durationSeconds ?? 0), 0);

  return (
    <View style={styles.container}>
      {onBack && (
        <Text style={styles.backLink} onPress={onBack}>
          ‹ Back to My Videos
        </Text>
      )}
      <Text style={styles.title}>Sending your answers</Text>
      <Text style={styles.subtitle}>
        {items.length} question{items.length === 1 ? '' : 's'}, going together.
      </Text>
      <Text style={styles.hint}>Tap a video to review it again.</Text>

      <ScrollView style={styles.list} contentContainerStyle={{ gap: spacing.xs + 1 }}>
        {items.map((item) => {
          const rowContent = (
            <>
              <View style={styles.rowThumb}>
                <Text style={styles.rowThumbGlyph}>▶</Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.rowLabel}>
                  {item.questionIndex + 1} · {item.questionText ?? item.label}
                </Text>
                <Text style={styles.rowSubLabel}>
                  {item.takeLabel ?? 'Take 1'}
                  {item.durationSeconds != null ? ` · ${formatTime(item.durationSeconds)}` : ''}
                </Text>
              </View>
              {onReviewItem && <Text style={styles.rowChevron}>›</Text>}
            </>
          );
          return onReviewItem ? (
            <Pressable
              key={item.questionIndex}
              style={styles.row}
              onPress={() => onReviewItem(item.questionIndex)}
            >
              {rowContent}
            </Pressable>
          ) : (
            <View key={item.questionIndex} style={styles.row}>
              {rowContent}
            </View>
          );
        })}
        {totalSeconds > 0 && (
          <Text style={styles.sizeNote}>
            ✓ About {formatTime(totalSeconds)} of video in total. Your videos stay on your phone as well.
          </Text>
        )}
      </ScrollView>

      <View style={{ gap: spacing.sm }}>
        <Button label="Send all" onPress={() => setConfirming(true)} />
        <Text style={styles.notNow} onPress={onSendLater}>
          Not now
        </Text>
      </View>

      <PopupSheet visible={confirming} onDismiss={() => setConfirming(false)}>
        <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 8 }}>
          Send all {items.length} to us?
        </Text>
        <Text style={{ fontSize: 14.5, color: colors.textMuted, lineHeight: 21, marginBottom: 16 }}>
          All {items.length} answers go up together, using the takes you chose. After sending, they can't be
          changed.
        </Text>
        <View style={styles.confirmReassuranceBox}>
          <Text style={styles.confirmReassuranceRow}>✓ Your videos stay on your phone too</Text>
          <Text style={styles.confirmReassuranceRow}>✓ Your branded videos come back after this</Text>
        </View>
        <View style={{ gap: 10, marginTop: 16 }}>
          <Button
            label="Yes, upload them"
            onPress={() => {
              setConfirming(false);
              onConfirm();
            }}
          />
          <Button label="Go back" variant="secondary" onPress={() => setConfirming(false)} />
        </View>
      </PopupSheet>
    </View>
  );
}

function makeStyles(colors: PaletteColors, spacing: Spacing, radius: Radius, typography: Typography) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, padding: spacing.xl, paddingTop: spacing.xxl, gap: spacing.xs + 2 },
    backLink: { ...typography.body, fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: spacing.xs },
    title: { ...typography.title, fontSize: 25, color: colors.text },
    subtitle: { ...typography.body, color: colors.textMuted },
    hint: { ...typography.caption, fontSize: 13.5, color: colors.textFaint },
    list: { flex: 1, marginTop: spacing.sm },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm + 2,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingVertical: spacing.sm + 2,
      paddingHorizontal: spacing.md,
    },
    rowThumb: {
      width: 44,
      height: 52,
      borderRadius: radius.sm + 2,
      backgroundColor: '#2B2521',
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowThumbGlyph: { color: 'rgba(255,255,255,0.9)', fontSize: 11 },
    rowLabel: { ...typography.body, fontSize: 14.5, fontWeight: '600', color: colors.text },
    rowSubLabel: { ...typography.caption, fontSize: 12.5, color: colors.textFaint },
    rowChevron: { fontSize: 20, fontWeight: '700', color: colors.accent },
    sizeNote: { ...typography.caption, fontSize: 13.5, color: colors.textMuted, lineHeight: 20, marginTop: spacing.xs },
    notNow: { ...typography.body, fontSize: 15, fontWeight: '600', color: colors.textMuted, textAlign: 'center' },
    confirmReassuranceBox: {
      gap: spacing.sm - 2,
      backgroundColor: colors.canvas,
      borderRadius: radius.lg,
      padding: spacing.md,
    },
    confirmReassuranceRow: { ...typography.caption, fontSize: 14, color: colors.text },
  });
}
