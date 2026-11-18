import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEvent } from 'expo';
import { useTheme } from '../theme/ThemeContext';
import type { PaletteColors } from '../theme/palettes';
import type { Spacing } from '../theme/spacing';
import type { Radius } from '../theme/radius';
import { Button } from '../components/ui/Button';
import { ProgressBar } from '../components/ui/ProgressBar';
import { Toggle } from '../components/ui/Toggle';
import { PopupSheet } from '../components/ui/Modal';
import { MAX_KEPT_TAKES } from '../recordings';
import { useStrings } from '../i18n/useStrings';
import { containsDevanagari, devanagariFontFamily } from '../theme/fonts';
import { draggedTrimMs, measuredDurationMs, requestedTrim, trimAfterRemovingTail } from '../trim';

export interface Take {
  id: string;
  filePath: string;
  durationSeconds: number;
  durationVerified?: boolean;
  trimAdjustedForReview?: boolean;
  // Trim metadata lives per-take now (recordings.ts) - undefined means
  // "never touched," same untouched-vs-full-clip distinction upload.ts
  // already relies on.
  trimStartSeconds?: number;
  trimEndSeconds?: number;
  // True for a take that already existed before this session (a retake) -
  // shown with a "Saved" tag instead of counting as one of this
  // recording's live attempts, so it's clear which ones are new.
  saved?: boolean;
  isPrimary?: boolean;
}

interface Props {
  questionNumber: number;
  totalQuestions: number;
  recordedQuestions: number;
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
  onBack?: () => void;
  questionBindingNeeded?: boolean;
  onBindQuestion?: () => void;
  onReviewReplacement?: () => void;
  replacementReviewError?: string | null;
  onMeasuredDuration?: (takeId: string, filePath: string, durationSeconds: number) => void;
  bindingQuestionText?: string;
  // Absent for an uploaded answer or while upload is in progress.
  onDeleteTake?: (id: string) => void;
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
  totalQuestions,
  recordedQuestions,
  takes,
  selectedTakeId,
  onSelectTake,
  onChangeTrim,
  keptTakeIds,
  onToggleKept,
  onRecordAnother,
  onKeep,
  onDeleteTake,
  onBack,
  questionBindingNeeded,
  onBindQuestion,
  onReviewReplacement,
  replacementReviewError,
  onMeasuredDuration,
  bindingQuestionText,
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
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const measuredCallbackRef = useRef(onMeasuredDuration);
  measuredCallbackRef.current = onMeasuredDuration;
  const [durationError, setDurationError] = useState(false);
  useEffect(() => {
    let active = true;
    const takeId = selected?.id, filePath = selected?.filePath;
    setDurationError(false);
    const observe = (duration: number, sourceUri?: string) => {
      if (!active || !takeId || !filePath || selectedRef.current?.id !== takeId || selectedRef.current.filePath !== filePath
        || (sourceUri !== undefined && sourceUri !== filePath)) return;
      if (measuredDurationMs(duration) === null) { setDurationError(true); return; }
      measuredCallbackRef.current?.(takeId, filePath, duration);
    };
    const loaded = player.addListener('sourceLoad', event => {
      const source = event.videoSource;
      const uri = typeof source === 'string' ? source : source && typeof source === 'object' ? source.uri : undefined;
      observe(event.duration, uri);
    });
    const status = player.addListener('statusChange', event => { if (active && event.status === 'error') setDurationError(true); });
    if (player.duration > 0) observe(player.duration);
    return () => { active = false; loaded.remove(); status.remove(); };
  }, [player, selected?.id, selected?.filePath]);
  const recordedCount = Math.min(totalQuestions, recordedQuestions);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState(false);
  const deleting = useRef(false);
  const pendingDelete = onDeleteTake ? takes.find(take => take.id === deleteId) : undefined;
  const deleteNumber = takes.findIndex(take => take.id === deleteId) + 1;
  const font = (value: string, weight = '400') => containsDevanagari(value) ? { fontFamily: devanagariFontFamily(weight) } : undefined;

  function requestDelete(id: string) {
    try { player.pause(); }
    catch (error) { console.warn('[review] could not pause preview', error); }
    setDeleteError(false);
    setDeleteId(id);
  }
  function confirmDelete() {
    if (!pendingDelete || !onDeleteTake || deleting.current) return;
    deleting.current = true;
    try { onDeleteTake(pendingDelete.id); setDeleteId(null); }
    catch (error) { console.warn('[review] take deletion failed', error); setDeleteError(true); }
    finally { deleting.current = false; }
  }

  function playPreview() {
    try {
      if (player.duration > 0 && player.currentTime >= player.duration - 0.1) player.currentTime = 0;
      player.play();
    } catch (error) {
      console.warn('[review] preview playback failed', error);
    }
  }

  // Derived, not stored: "on" means the end handle is currently sitting at
  // duration - 2, nothing more. This can never drift out of sync with what
  // actually gets trimmed (unlike a separate boolean, which used to track
  // this and could silently disagree with the slider - see recordings.ts).
  const selectedDuration = selected?.durationSeconds ?? 0;
  const selectedEnd = selected?.trimEndSeconds ?? selectedDuration;
  const removeLastTwoSecondsOn =
    !!selected && Math.abs(selectedEnd - (selectedDuration - REMOVE_LAST_SECONDS)) < TRIM_END_EPSILON;

  function handleToggleRemoveLastTwoSeconds(next: boolean) {
    if (!selected || selected.durationVerified !== true) return;
    const start = selected.trimStartSeconds ?? 0;
    const trim = trimAfterRemovingTail(selectedDuration, start, next);
    if (trim) onChangeTrim(trim.startSeconds, trim.endSeconds);
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
  const kept = mustPick ? takes.filter(take => keptTakeIds.includes(take.id)) : takes;
  const durationsReady = kept.length > 0 && kept.every(take => requestedTrim(take) !== null);
  const keepDisabled = (mustPick && keptTakeIds.length !== MAX_KEPT_TAKES) || !durationsReady || durationError;
  const droppedTake =
    mustPick && keptTakeIds.length === MAX_KEPT_TAKES
      ? takes.find((take) => !keptTakeIds.includes(take.id))
      : undefined;

  return (
    <View style={styles.container}>
      {onBack && <View style={{ paddingTop: insets.top + spacing.edgeGap + 8, paddingHorizontal: spacing.lg, paddingBottom: 8 }}><Pressable accessibilityRole="button" accessibilityLabel={t('questionBrief.backButton')} onPress={onBack} style={{ minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center' }}><Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>‹ {t('questionBrief.backButton')}</Text></Pressable></View>}
      <View style={styles.videoWrap}>
        {selected && (
          // "contain" (not "cover") - the wrap's height is an arbitrary
          // fixed box unrelated to the recording's real aspect ratio;
          // "cover" was cropping/zooming into it instead of showing the
          // true framing the distributor actually recorded.
          <VideoView style={styles.video} player={player} contentFit="contain" nativeControls />
        )}
        {selected && !isPlaying && (
          <View style={styles.playOverlay} pointerEvents="box-none">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('reviewTrim.playPreview')}
              style={styles.playButton}
              onPress={playPreview}
            >
              <Text style={styles.playGlyph}>▶</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* Scrollable, not a plain flex column - a short device with 3 takes
          showing must never silently clip the trim controls/buttons off
          the bottom with no way to reach them; a tall device just never
          shows a scroll indicator at all. */}
      <ScrollView style={styles.sheet} contentContainerStyle={styles.sheetContent}>
        <Text style={styles.subtitle}>{t('uploadApproval.originalReview')}</Text>
        <Text style={styles.subtitle}>{t('uploadApproval.originalRetained')}</Text>
        {(!durationsReady || durationError) && <Text accessibilityRole={durationError ? 'alert' : 'text'} style={styles.subtitle}>{t(durationError ? 'reviewTrim.durationError' : 'reviewTrim.durationPending')}</Text>}
        {selected?.trimAdjustedForReview && <Text style={styles.subtitle}>{t('reviewTrim.trimAdjusted')}</Text>}
        {questionBindingNeeded && <View style={{ gap: spacing.sm }}>
          <Text style={styles.subtitle}>{t('uploadApproval.legacyReview')}</Text>
          {!!bindingQuestionText && <Text style={styles.toggleLabel}>{bindingQuestionText}</Text>}
          {onBindQuestion && <Button label={t('uploadApproval.bindQuestion')} onPress={onBindQuestion} variant="secondary" />}
        </View>}
        {!questionBindingNeeded && onReviewReplacement && <Button label={t('uploadApproval.reviewReplacement')} onPress={onReviewReplacement} variant="quiet" />}
        {replacementReviewError && <Text accessibilityRole="alert" style={styles.deleteError}>{replacementReviewError}</Text>}
        <View style={styles.progressSummary}>
          <Text style={styles.progressText}>
            {t('reviewTrim.questionProgress', { number: questionNumber, total: totalQuestions })}
          </Text>
          <Text style={styles.subtitle}>
            {t('reviewTrim.recordedProgress', { completed: recordedCount, total: totalQuestions, remaining: totalQuestions - recordedCount })}
          </Text>
          <ProgressBar progress={totalQuestions > 0 ? recordedCount / totalQuestions : 0} />
        </View>
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

        {(takes.length > 1 || (takes.length > 0 && onDeleteTake)) && (
          <View style={styles.list}>
            {takes.map((take, i) => {
              const isKept = keptTakeIds.includes(take.id);
              const isSelected = take.id === selected?.id;
              return (
                <View
                  key={take.id}
                  style={[
                    styles.takeRow,
                    { borderColor: isSelected ? colors.accent : colors.border },
                    mustPick && !isKept && styles.takeRowDropped,
                  ]}
                >
                  <Pressable accessibilityRole="button" accessibilityLabel={t('takeDeletion.previewLabel', { number: i + 1 })} accessibilityState={{ selected: isSelected }} onPress={() => onSelectTake(take.id)} style={styles.rowPreview}>
                  <View style={styles.rowThumb}>
                    <View style={styles.rowThumbPlay} />
                  </View>
                  <Text style={styles.rowLabel} numberOfLines={1}>
                    {t('reviewTrim.takeLabel', { number: i + 1 })}{' '}
                    <Text style={styles.rowMeta}>· {formatTime(take.durationSeconds)}</Text>
                    {isSelected && <Text style={styles.rowInlineTag}> · {t('reviewTrim.usingBadge')}</Text>}
                    {take.saved && <Text style={styles.rowInlineTag}> · {t('reviewTrim.savedTag')}</Text>}
                  </Text>
                  </Pressable>
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
                  {onDeleteTake && <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('takeDeletion.deleteLabel', { number: i + 1 })}
                    onPress={() => requestDelete(take.id)}
                    style={styles.deleteButton}
                  ><TrashIcon color={colors.danger} /></Pressable>}
                </View>
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
          <View pointerEvents={selected?.durationVerified === true && trimAfterRemovingTail(selectedDuration, selected?.trimStartSeconds ?? 0, true) ? 'auto' : 'none'} style={{ opacity: selected?.durationVerified === true && trimAfterRemovingTail(selectedDuration, selected?.trimStartSeconds ?? 0, true) ? 1 : 0.4 }}><Toggle value={removeLastTwoSecondsOn} onValueChange={handleToggleRemoveLastTwoSeconds} /></View>
        </View>

        {selected && selected.durationVerified === true && (
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

      <PopupSheet visible={!!pendingDelete} groupAccessibility={false} onDismiss={() => { if (!deleting.current) setDeleteId(null); }}>
        <Text accessibilityRole="header" style={[styles.deleteTitle, font(t('takeDeletion.title'), '700')]}>{t('takeDeletion.title', { number: deleteNumber })}</Text>
        <Text style={[styles.deleteBody, font(t('takeDeletion.question'))]}>{t('takeDeletion.question', { number: questionNumber })} · {formatTime(pendingDelete?.durationSeconds ?? 0)}</Text>
        <Text style={[styles.deleteBody, font(t('takeDeletion.body'))]}>{t('takeDeletion.body')}</Text>
        <Text style={[styles.deleteBody, font(t(takes.length === 1 ? 'takeDeletion.lastTake' : 'takeDeletion.remaining'))]}>{t(takes.length === 1 ? 'takeDeletion.lastTake' : 'takeDeletion.remaining')}</Text>
        {pendingDelete?.isPrimary && takes.some(take => take.id !== deleteId && take.saved) && <Text style={[styles.deleteBody, font(t('takeDeletion.primary'))]}>{t('takeDeletion.primary')}</Text>}
        {deleteError && <Text accessibilityRole="alert" style={[styles.deleteError, font(t('takeDeletion.error'))]}>{t('takeDeletion.error')}</Text>}
        <View style={{ gap: spacing.sm }}>
          <Pressable accessibilityRole="button" onPress={confirmDelete} style={[styles.confirmDelete, { backgroundColor: colors.danger }]}><Text style={[styles.confirmDeleteText, { color: colors.accentText }, font(t('takeDeletion.confirm'), '700')]}>{t('takeDeletion.confirm')}</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={t('takeDeletion.cancel')} onPress={() => setDeleteId(null)} style={[styles.confirmDelete, { borderWidth: 1.5, borderColor: colors.border }]}><Text style={[styles.confirmDeleteText, { color: colors.text }, font(t('takeDeletion.cancel'), '700')]}>{t('takeDeletion.cancel')}</Text></Pressable>
        </View>
      </PopupSheet>
    </View>
  );
}

function TrashIcon({ color }: { color: string }) {
  return <View pointerEvents="none" style={{ alignItems: 'center', width: 18, height: 20 }}>
    <View style={{ width: 7, height: 3, borderWidth: 1.5, borderColor: color, borderBottomWidth: 0 }} />
    <View style={{ width: 18, height: 1.5, backgroundColor: color }} />
    <View style={{ width: 13, height: 14, borderWidth: 1.5, borderTopWidth: 0, borderColor: color, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 }} />
  </View>;
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
  const dragStart = useRef({ startMs: 0, endMs: 0, width: 0, durationMs: 0 });
  const [width, setWidth] = useState(0);

  const startResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderGrant: () => { dragStart.current = { startMs: Math.round(startSeconds * 1000), endMs: Math.round(endSeconds * 1000), width: trackWidth.current, durationMs: Math.floor(durationSeconds * 1000) }; },
        onPanResponderMove: (_e, gesture) => {
          const initial = dragStart.current;
          const next = draggedTrimMs('start', gesture.dx, initial.width, initial.durationMs, initial.startMs, initial.endMs);
          if (next) onChange(next.startMs / 1000, next.endMs / 1000);
        },
      }),
    [durationSeconds, startSeconds, endSeconds, onChange],
  );

  const endResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderGrant: () => { dragStart.current = { startMs: Math.round(startSeconds * 1000), endMs: Math.round(endSeconds * 1000), width: trackWidth.current, durationMs: Math.floor(durationSeconds * 1000) }; },
        onPanResponderMove: (_e, gesture) => {
          const initial = dragStart.current;
          const next = draggedTrimMs('end', gesture.dx, initial.width, initial.durationMs, initial.startMs, initial.endMs);
          if (next) onChange(next.startMs / 1000, next.endMs / 1000);
        },
      }),
    [durationSeconds, startSeconds, endSeconds, onChange],
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
    playOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' },
    playButton: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.95)', justifyContent: 'center', alignItems: 'center' },
    playGlyph: { fontSize: 27, color: '#241E1A', marginLeft: 4 },
    progressSummary: { gap: spacing.sm },
    progressText: { fontSize: 14, fontWeight: '700', color: colors.accent },
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
    rowPreview: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2, minHeight: 44 },
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
    deleteButton: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
    deleteTitle: { fontSize: 22, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
    deleteBody: { fontSize: 15, color: colors.textMuted, lineHeight: 23, marginBottom: spacing.md },
    deleteError: { fontSize: 14, color: colors.danger, marginBottom: spacing.md },
    confirmDelete: { minHeight: 48, paddingVertical: 14, paddingHorizontal: 20, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
    confirmDeleteText: { fontSize: 16, fontWeight: '700' },
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
      paddingBottom: insetBottom + spacing.edgeGap + spacing.footerGap,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.background,
    },
    actionButton: { flex: 1, paddingHorizontal: spacing.sm },
    actionButtonText: { fontSize: 14.5 },
  });
}
