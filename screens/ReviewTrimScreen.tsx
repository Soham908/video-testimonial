import { useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useTheme } from '../theme/ThemeContext';
import type { PaletteColors } from '../theme/palettes';
import type { Spacing } from '../theme/spacing';
import type { Radius } from '../theme/radius';
import { Button } from '../components/ui/Button';
import { Toggle } from '../components/ui/Toggle';
import { MAX_KEPT_TAKES } from '../recordings';
import { useStrings } from '../i18n/useStrings';

export interface Take {
  id: string;
  filePath: string;
  durationSeconds: number;
  // Trim metadata lives per-take now (recordings.ts) - undefined means
  // "never touched," same untouched-vs-full-clip distinction upload.ts
  // already relies on.
  trimStartSeconds?: number;
  trimEndSeconds?: number;
  // True for a take that already existed before this session (a retake) -
  // shown with a "Saved" tag instead of counting as one of this
  // recording's live attempts, so it's clear which ones are new.
  saved?: boolean;
}

interface Props {
  questionNumber: number;
  takes: Take[];
  selectedTakeId: string;
  onSelectTake: (id: string) => void;
  onChangeTrim: (start: number, end: number) => void;
  // Up to MAX_KEPT_TAKES take ids marked to keep. Only user-editable (via
  // onToggleKept) once takes.length exceeds MAX_KEPT_TAKES - below that,
  // the caller already marks everything kept automatically, since there's
  // no cap to enforce yet.
  keptTakeIds: string[];
  onToggleKept: (id: string) => void;
  onRecordAnother: () => void;
  onKeep: () => void;
}

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const REMOVE_LAST_SECONDS = 2;
// Handle drags land on fractional seconds - treat "close enough to
// duration - 2" as on, rather than requiring exact float equality.
const TRIM_END_EPSILON = 0.05;

// New screen, no current equivalent - review/trim is mandatory after every
// take now (DECISIONS.md), not a conditional "alignment broke" overlay.
// The timeline is plain (no thumbnails/waveform - both need native
// video/audio decode; `ffmpeg-kit-react-native` is retired, not worth a
// forked dependency for this). Trim is metadata only - see recordings.ts -
// no media is actually cut here.
export function ReviewTrimScreen({
  questionNumber,
  takes,
  selectedTakeId,
  onSelectTake,
  onChangeTrim,
  keptTakeIds,
  onToggleKept,
  onRecordAnother,
  onKeep,
}: Props) {
  const { colors, spacing, radius } = useTheme();
  const { t } = useStrings();
  // The fixed action-button footer sits at the real bottom of the screen
  // now (not just after whatever content preceded it), so it needs the
  // same real per-device bottom inset BottomTabBar.tsx already accounts
  // for - otherwise Android's 3-button/gesture nav bar sits on top of it.
  const insets = useSafeAreaInsets();
  const styles = useMemo(
    () => makeStyles(colors, spacing, radius, insets.bottom),
    [colors, spacing, radius, insets.bottom],
  );

  const selected = takes.find((take) => take.id === selectedTakeId) ?? takes[takes.length - 1];
  const player = useVideoPlayer(selected?.filePath ?? null, (p) => {
    p.pause();
  });

  // Derived, not stored: "on" means the end handle is currently sitting at
  // duration - 2, nothing more. This can never drift out of sync with what
  // actually gets trimmed (unlike a separate boolean, which used to track
  // this and could silently disagree with the slider - see recordings.ts).
  const selectedDuration = selected?.durationSeconds ?? 0;
  const selectedEnd = selected?.trimEndSeconds ?? selectedDuration;
  const removeLastTwoSecondsOn =
    !!selected && Math.abs(selectedEnd - (selectedDuration - REMOVE_LAST_SECONDS)) < TRIM_END_EPSILON;

  function handleToggleRemoveLastTwoSeconds(next: boolean) {
    if (!selected) return;
    const start = selected.trimStartSeconds ?? 0;
    onChangeTrim(start, next ? Math.max(start, selectedDuration - REMOVE_LAST_SECONDS) : selectedDuration);
  }

  // Picking is only required once there's more to choose from than the
  // take cap allows - below that, the caller already marks everything in
  // `takes` as kept (keptTakeIds mirrors `takes` 1:1 in that case), so
  // there's nothing to decide here.
  const mustPick = takes.length > MAX_KEPT_TAKES;
  const keepButtonLabel = !mustPick
    ? takes.length > 1
      ? t('reviewTrim.keepBothTakesButton')
      : t('reviewTrim.keepButton')
    : keptTakeIds.length === MAX_KEPT_TAKES
      ? t('reviewTrim.keepTheseButton', { count: MAX_KEPT_TAKES })
      : t('reviewTrim.selectToKeepButton', { count: MAX_KEPT_TAKES, kept: keptTakeIds.length });
  const keepDisabled = mustPick && keptTakeIds.length !== MAX_KEPT_TAKES;
  const droppedTake =
    mustPick && keptTakeIds.length === MAX_KEPT_TAKES
      ? takes.find((take) => !keptTakeIds.includes(take.id))
      : undefined;

  return (
    <View style={styles.container}>
      <View style={styles.videoWrap}>
        {selected && (
          // "contain" (not "cover") - the wrap's height is an arbitrary
          // fixed box unrelated to the recording's real aspect ratio;
          // "cover" was cropping/zooming into it instead of showing the
          // true framing the distributor actually recorded.
          <VideoView style={styles.video} player={player} contentFit="contain" nativeControls />
        )}
      </View>

      {/* Scrollable, not a plain flex column - a short device with 3 takes
          showing must never silently clip the trim controls/buttons off
          the bottom with no way to reach them; a tall device just never
          shows a scroll indicator at all. */}
      <ScrollView style={styles.sheet} contentContainerStyle={styles.sheetContent}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>{t('reviewTrim.title')}</Text>
          <Text style={styles.subtitle}>
            {t('reviewTrim.takeSubtitle', {
              number: takes.findIndex((take) => take.id === selected?.id) + 1,
              duration: formatTime(selected?.durationSeconds ?? 0),
            })}
          </Text>
        </View>

        {mustPick && (
          <Text style={styles.pickHint}>
            {t('reviewTrim.pickHint', { max: MAX_KEPT_TAKES, total: takes.length })}
          </Text>
        )}

        {takes.length > 1 && (
          <View style={styles.list}>
            {takes.map((take, i) => {
              const isKept = keptTakeIds.includes(take.id);
              const isSelected = take.id === selected?.id;
              return (
                <Pressable
                  key={take.id}
                  onPress={() => onSelectTake(take.id)}
                  style={[
                    styles.takeRow,
                    { borderColor: isSelected ? colors.accent : colors.border },
                    mustPick && !isKept && styles.takeRowDropped,
                  ]}
                >
                  <View style={styles.rowThumb}>
                    <View style={styles.rowThumbPlay} />
                  </View>
                  <Text style={styles.rowLabel} numberOfLines={1}>
                    {t('reviewTrim.takeLabel', { number: i + 1 })}{' '}
                    <Text style={styles.rowMeta}>· {formatTime(take.durationSeconds)}</Text>
                    {isSelected && <Text style={styles.rowInlineTag}> · {t('reviewTrim.usingBadge')}</Text>}
                    {take.saved && <Text style={styles.rowInlineTag}> · {t('reviewTrim.savedTag')}</Text>}
                  </Text>
                  {mustPick && (
                    <Pressable
                      hitSlop={10}
                      onPress={(e) => {
                        e.stopPropagation();
                        onToggleKept(take.id);
                      }}
                      style={[styles.rowKeep, isKept && styles.rowKeepKept]}
                    >
                      {isKept && <Text style={styles.rowKeepGlyph}>✓</Text>}
                    </Pressable>
                  )}
                </Pressable>
              );
            })}
          </View>
        )}

        {droppedTake && (
          <Text style={styles.dropNote}>
            {t('reviewTrim.dropNote', { number: takes.findIndex((take) => take.id === droppedTake.id) + 1 })}
          </Text>
        )}

        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleLabel}>{t('reviewTrim.removeLastTwoSecondsLabel')}</Text>
            <Text style={styles.toggleReason}>{t('reviewTrim.removeLastTwoSecondsReason')}</Text>
          </View>
          <Toggle value={removeLastTwoSecondsOn} onValueChange={handleToggleRemoveLastTwoSeconds} />
        </View>

        {selected && (
          <TrimTimeline
            durationSeconds={selected.durationSeconds}
            startSeconds={selected.trimStartSeconds ?? 0}
            endSeconds={selected.trimEndSeconds ?? selected.durationSeconds}
            onChange={onChangeTrim}
            colors={colors}
          />
        )}
      </ScrollView>

      {/* Outside the ScrollView, not its last child - a fixed footer that
          always sits at the bottom of the screen regardless of how much
          content is above it or whether that content is scrolled, instead
          of just trailing whatever happened to come before it. */}
      <View style={styles.actions}>
        <Button
          label={keepButtonLabel}
          onPress={onKeep}
          disabled={keepDisabled}
          style={styles.actionButton}
          textStyle={styles.actionButtonText}
        />
        <Button
          label={t('reviewTrim.recordAnotherButton')}
          onPress={onRecordAnother}
          variant="secondary"
          style={styles.actionButton}
          textStyle={styles.actionButtonText}
        />
      </View>
    </View>
  );
}

// Plain draggable strip - two handles, no frame thumbnails or waveform.
// PanResponder is built into React Native core, no new dependency.
function TrimTimeline({
  durationSeconds,
  startSeconds,
  endSeconds,
  onChange,
  colors,
}: {
  durationSeconds: number;
  startSeconds: number;
  endSeconds: number;
  onChange: (start: number, end: number) => void;
  colors: PaletteColors;
}) {
  const { spacing, radius } = useTheme();
  const trackWidth = useRef(0);
  const [width, setWidth] = useState(0);

  const startResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderMove: (_e, gesture) => {
          if (trackWidth.current === 0) return;
          const fraction = Math.max(0, Math.min(1, gesture.moveX / trackWidth.current));
          const next = Math.min(fraction * durationSeconds, endSeconds - 1);
          onChange(Math.max(0, next), endSeconds);
        },
      }),
    [durationSeconds, endSeconds, onChange],
  );

  const endResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderMove: (_e, gesture) => {
          if (trackWidth.current === 0) return;
          const fraction = Math.max(0, Math.min(1, gesture.moveX / trackWidth.current));
          const next = Math.max(fraction * durationSeconds, startSeconds + 1);
          onChange(startSeconds, Math.min(durationSeconds, next));
        },
      }),
    [durationSeconds, startSeconds, onChange],
  );

  const startPct = durationSeconds > 0 ? startSeconds / durationSeconds : 0;
  const endPct = durationSeconds > 0 ? endSeconds / durationSeconds : 1;

  return (
    <View style={{ gap: spacing.xs + 2 }}>
      <View
        style={{ height: 34, justifyContent: 'center' }}
        onLayout={(e) => {
          trackWidth.current = e.nativeEvent.layout.width;
          setWidth(e.nativeEvent.layout.width);
        }}
      >
        <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.canvas }} />
        <View
          style={{
            position: 'absolute',
            height: 6,
            borderRadius: 3,
            backgroundColor: colors.accent,
            left: startPct * width,
            width: Math.max(0, (endPct - startPct) * width),
          }}
        />
        <View
          {...startResponder.panHandlers}
          style={{
            position: 'absolute',
            left: startPct * width - 9,
            width: 18,
            height: 18,
            borderRadius: 9,
            backgroundColor: colors.surface,
            borderWidth: 2,
            borderColor: colors.accent,
          }}
        />
        <View
          {...endResponder.panHandlers}
          style={{
            position: 'absolute',
            left: endPct * width - 9,
            width: 18,
            height: 18,
            borderRadius: 9,
            backgroundColor: colors.surface,
            borderWidth: 2,
            borderColor: colors.accent,
          }}
        />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 12.5, color: colors.textFaint, fontVariant: ['tabular-nums'] }}>
          {formatTime(startSeconds)}
        </Text>
        <Text style={{ fontSize: 12.5, color: colors.textFaint, fontVariant: ['tabular-nums'] }}>
          {formatTime(endSeconds)}
        </Text>
      </View>
    </View>
  );
}

function makeStyles(colors: PaletteColors, spacing: Spacing, radius: Radius, insetBottom: number) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    videoWrap: { height: '38%', backgroundColor: '#000' },
    video: { flex: 1 },
    sheet: { flex: 1 },
    sheetContent: { padding: spacing.xl, gap: spacing.md },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
    title: { fontSize: 22, fontWeight: '700', color: colors.text },
    subtitle: { fontSize: 13, color: colors.textMuted },
    pickHint: { fontSize: 12.5, color: colors.textMuted, lineHeight: 18 },
    // Vertical, compact rows - not the horizontal thumbnail strip this
    // replaced. Sized to keep 3 rows well under 200px total so the trim
    // timeline and both action buttons stay on-screen without scrolling on
    // a typical device (the ScrollView above is the fallback for whatever
    // doesn't fit, not the primary plan).
    list: { gap: spacing.xs + 2 },
    takeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm + 2,
      borderWidth: 2,
      borderRadius: radius.md,
      paddingVertical: spacing.sm - 1,
      paddingHorizontal: spacing.sm + 2,
      backgroundColor: colors.surface,
    },
    takeRowDropped: { opacity: 0.45 },
    rowThumb: {
      width: 32,
      height: 32,
      borderRadius: radius.sm,
      backgroundColor: colors.canvas,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowThumbPlay: {
      width: 0,
      height: 0,
      borderTopWidth: 5,
      borderBottomWidth: 5,
      borderLeftWidth: 7,
      borderTopColor: 'transparent',
      borderBottomColor: 'transparent',
      borderLeftColor: colors.textMuted,
      marginLeft: 2,
    },
    rowLabel: { flex: 1, fontSize: 13.5, fontWeight: '700', color: colors.text },
    rowMeta: { fontSize: 12, fontWeight: '400', color: colors.textFaint },
    rowInlineTag: { fontSize: 12, fontWeight: '700', color: colors.accent },
    // A real touch target (28px + hitSlop 10), not the old 18px corner
    // badge - and its own Pressable with stopPropagation, not a raw
    // onTouchEnd on the row competing with a nested Pressable for the
    // touch (that mismatch was why selecting a take felt unreliable).
    rowKeep: {
      width: 28,
      height: 28,
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowKeepKept: { backgroundColor: colors.accent, borderColor: colors.accent },
    rowKeepGlyph: { fontSize: 13, fontWeight: '700', color: colors.accentText },
    dropNote: { fontSize: 12, fontWeight: '600', color: colors.danger },
    toggleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    toggleLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
    toggleReason: { fontSize: 12.5, color: colors.textFaint, marginTop: 2 },
    actions: {
      flexDirection: 'row',
      gap: spacing.sm,
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.sm,
      // Just the real device inset plus a small fixed margin - not
      // spacing.lg on top of it, which left far more air below the
      // buttons than the system nav bar actually needs cleared.
      paddingBottom: insetBottom + spacing.xs,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.background,
    },
    actionButton: { flex: 1, paddingHorizontal: spacing.sm },
    actionButtonText: { fontSize: 14.5 },
  });
}
