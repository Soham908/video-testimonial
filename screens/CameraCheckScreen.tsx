import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAudioPlayer } from 'expo-audio';
import { playQuestionAudio } from '../playQuestionAudio';
import { useTheme } from '../theme/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PaletteColors } from '../theme/palettes';
import type { Spacing } from '../theme/spacing';
import type { Radius } from '../theme/radius';
import type { Typography } from '../theme/typography';
import { Toggle } from '../components/ui/Toggle';
import { Button } from '../components/ui/Button';
import { Chip } from '../components/ui/Chip';
import { PopupSheet } from '../components/ui/Modal';
import { containsDevanagari, devanagariFontFamily } from '../theme/fonts';
import { useStrings } from '../i18n/useStrings';
import { useFirstRunTip } from '../useFirstRunTip';

interface Props {
  questionNumber: number;
  totalQuestions: number;
  // Shown during question playback and countdown, in the same position
  // as the question text during recording.
  questionText: string;
  prompts?: string[];
  autoStart: boolean;
  onToggleAutoStart: (next: boolean) => void;
  /** True once alignment has locked and noise is clear (or overridden). */
  checksReady: boolean;
  countingDown: boolean;
  countdownReady: boolean;
  prepareQuestionAudio: () => Promise<void>;
  onQuestionAudioComplete: () => void;
  countdownSeconds: number;
  onStartRecording: () => void;
  // Cached local question audio, with the API playback URL as fallback.
  voPlaybackUrl?: string;
  readQuestionAloud: boolean;
  onToggleReadQuestionAloud: (next: boolean) => void;
}

// Chrome-only overlay, rendered as a SIBLING of <CameraAlignment/> (not a
// wrapper around it) - CameraAlignment must stay mounted continuously
// across cameraCheck -> countdown -> recording so the camera session never
// reinitializes mid-flow. AppFlow renders CameraAlignment once, at a stable
// tree position, and this chrome layers on top only while phase is
// 'cameraCheck'/'countdown'. CameraAlignment/alignment.ts/useAlignmentLock.ts
// are untouched - this only adds new UI (title bar, auto-start toggle, the
// start button/inline countdown) on top of what CameraAlignment already
// renders (the restyled AlignmentGuideOverlay + AlignmentStatusStrip).
export function CameraCheckScreen({
  questionNumber,
  totalQuestions,
  questionText,
  prompts = [],
  autoStart,
  onToggleAutoStart,
  checksReady,
  countingDown,
  countdownReady,
  prepareQuestionAudio,
  onQuestionAudioComplete,
  countdownSeconds,
  onStartRecording,
  voPlaybackUrl,
  readQuestionAloud,
  onToggleReadQuestionAloud,
}: Props) {
  const { colors, spacing, radius, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors, spacing, radius, typography), [colors, spacing, radius, typography]);
  const { t } = useStrings();

  // First-time-only pointer explaining the alignment circle - real tester
  // feedback was that it wasn't obvious what to do with it. Only eligible
  // while the checks screen itself is up (not during the countdown, which
  // reuses this same component) so it can't pop up moments before
  // recording starts.
  const cameraCheckTip = useFirstRunTip('cameraCheckAlignment', !countingDown);

  // Use the existing audio module for the audio-only question. Keep its
  // iOS session active on completion so pause/unmount cannot deactivate
  // the microphone session that VisionCamera is about to use.
  const audioSource = voPlaybackUrl ?? null;
  const player = useAudioPlayer(audioSource, { keepAudioSessionActive: true });
  const [audioStage, setAudioStage] = useState<'preparing' | 'playing' | 'failed' | 'complete'>('preparing');
  const [audioAttempt, setAudioAttempt] = useState(0);
  const [canSkipAudio, setCanSkipAudio] = useState(false);

  // Automatic native-object release may precede our unmount cleanup.
  function safePause() {
    try {
      player.pause();
    } catch (error) {
      console.warn('[camera-check] VO pause failed', error);
    }
  }

  // Complete sampling shutdown and the entire VO before releasing the
  // parent's countdown. A delayed/failed VO never silently starts capture.
  useEffect(() => {
    if (!countingDown) return;
    const cancellation = new AbortController();
    setAudioStage('preparing');
    setCanSkipAudio(false);
    (async () => {
      await prepareQuestionAudio();
      if (cancellation.signal.aborted) return;
      setCanSkipAudio(true);
      if (readQuestionAloud && audioSource != null) {
        setAudioStage('playing');
        if (audioAttempt > 0) player.replace(audioSource);
        await playQuestionAudio(player, cancellation.signal);
      }
      if (cancellation.signal.aborted) return;
      setAudioStage('complete');
      onQuestionAudioComplete();
    })().catch((error) => {
      if (cancellation.signal.aborted) return;
      console.warn('[camera-check] question preparation failed', error);
      setAudioStage('failed');
    });
    return () => {
      cancellation.abort();
      safePause();
    };
    // safePause only accesses this effect's player.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countingDown, readQuestionAloud, audioSource, audioAttempt, player, prepareQuestionAudio, onQuestionAudioComplete]);

  function skipQuestionAudio() {
    try {
      player.pause();
      setAudioStage('complete');
      onQuestionAudioComplete();
    } catch (error) {
      console.warn('[camera-check] VO skip failed', error);
    }
  }

  return (
    <View style={styles.container} pointerEvents="box-none">
      <View style={[styles.topBar, { top: insets.top + spacing.edgeGap + 16 }]} pointerEvents="box-none">
        {countingDown ? (
          // Same style/place RecordingScreen shows the question in, once
          // recording actually starts - the progress badge above it mirrors
          // RecordingScreen's own topRow (just without the rec dot/timer,
          // since recording hasn't started yet), so the question bubble
          // lands at the same vertical position here as it will the moment
          // 'recording' takes over, instead of sitting flush at the very
          // top with nothing above it.
          <>
            <View style={styles.countdownTopRow}>
              <View style={styles.progressBadge}>
                <Text style={styles.progressText}>
                  {questionNumber} of {totalQuestions}
                </Text>
              </View>
            </View>
            <View style={styles.questionBubble}>
              <Text
                style={[
                  styles.questionText,
                  containsDevanagari(questionText) && { fontFamily: devanagariFontFamily('800') },
                ]}
                numberOfLines={3}
              >
                {questionText}
              </Text>
            </View>
          </>
        ) : (
          <>
            <View>
              <Text style={styles.title}>{t('cameraCheck.title')}</Text>
              <Text style={styles.subtitle}>
                {t('cameraCheck.subtitle', { questionNumber, totalQuestions })}
              </Text>
            </View>
            {/* Its own row below the title, not squeezed into the title's
                corner - was hugging the top-right edge, low-contrast
                against a bright/plain background and hard to reach. Each
                toggle now has its own translucent pill for contrast and
                a real touch target that isn't right at the screen edge. */}
            <View style={styles.togglePillRow}>
              <View style={styles.togglePill}>
                <Text style={styles.toggleLabel}>{t('cameraCheck.autoStartLabel')}</Text>
                <Toggle value={autoStart} onValueChange={onToggleAutoStart} onDark />
              </View>
              <View style={styles.togglePill}>
                <Text style={styles.toggleLabel}>{t('cameraCheck.readQuestionAloudLabel')}</Text>
                <Toggle value={readQuestionAloud} onValueChange={onToggleReadQuestionAloud} onDark />
              </View>
            </View>
          </>
        )}
      </View>

      <View style={[styles.bottomBar, { bottom: insets.bottom + spacing.edgeGap + spacing.footerGap }]} pointerEvents="box-none">
        {countingDown && prompts.length > 0 && (
          <View style={styles.promptsRow} pointerEvents="none">
            {prompts.map((prompt) => <Chip key={prompt} label={prompt} onDark emphasis />)}
          </View>
        )}
        {countingDown && countdownReady ? (
          <View style={styles.countdownRow}>
            <View style={styles.countdownCircle}>
              <Text style={styles.countdownNumber}>{Math.max(countdownSeconds, 1)}</Text>
            </View>
            <Text style={styles.countdownLabel}>
              {t('cameraCheck.countdownLabel', { seconds: Math.max(countdownSeconds, 1) })}
            </Text>
          </View>
        ) : countingDown ? (
          <View style={styles.audioPreparation}>
            <Text style={styles.countdownLabel}>
              {t(audioStage === 'failed' ? (canSkipAudio ? 'cameraCheck.audioFailed' : 'cameraCheck.preparationFailed') :
                audioStage === 'playing' ? 'cameraCheck.listenToQuestion' : 'cameraCheck.preparingAudio')}
            </Text>
            {audioStage === 'failed' && (
              <>
                <Button label={t('cameraCheck.retryAudio')} onPress={() => setAudioAttempt((value) => value + 1)} />
                {canSkipAudio && <Button label={t('cameraCheck.skipAudio')} variant="secondary" onPress={skipQuestionAudio} />}
              </>
            )}
          </View>
        ) : (
          <Button
            label={checksReady ? t('cameraCheck.startRecordingButton') : t('cameraCheck.waitingForChecksButton')}
            onPress={onStartRecording}
            disabled={!checksReady}
          />
        )}
      </View>

      <PopupSheet visible={cameraCheckTip.visible} onDismiss={cameraCheckTip.dismiss}>
        <Text style={styles.tipTitle}>{t('cameraCheckTip.title')}</Text>
        <Text style={styles.tipBody}>{t('cameraCheckTip.body')}</Text>
        <Button label={t('cameraCheckTip.gotItButton')} onPress={cameraCheckTip.dismiss} />
      </PopupSheet>
    </View>
  );
}

function makeStyles(colors: PaletteColors, spacing: Spacing, radius: Radius, typography: Typography) {
  return StyleSheet.create({
    container: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    audioPreparation: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: 'rgba(0,0,0,0.7)' },
    tipTitle: { ...typography.title, fontSize: 19, color: colors.text, marginBottom: spacing.sm },
    tipBody: { ...typography.body, color: colors.textMuted, lineHeight: 22, marginBottom: spacing.lg },
    topBar: {
      position: 'absolute',
      top: 16,
      left: spacing.lg,
      right: spacing.lg,
      gap: spacing.sm + 2,
    },
    title: { color: '#FFFFFF', fontSize: 21, fontWeight: '700', letterSpacing: -0.3 },
    subtitle: { color: 'rgba(255,255,255,0.55)', fontSize: 13.5, marginTop: 4 },
    // A row of its own pills, not a right-aligned column squeezed beside
    // the title - each one has real background contrast instead of bare
    // text floating over whatever the camera happens to be showing.
    togglePillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    togglePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm - 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
      borderRadius: radius.pill,
      paddingVertical: spacing.xs + 2,
      paddingHorizontal: spacing.sm + 2,
    },
    toggleLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '600' },
    // Right-aligned regardless of what else is (or isn't) in the row -
    // RecordingScreen's own progressBadge sits here because it has a rec
    // indicator on the left pushing it there via space-between; there's no
    // rec indicator during countdown, so this is pinned there directly
    // instead of relying on a sibling that doesn't exist yet.
    countdownTopRow: { flexDirection: 'row', justifyContent: 'flex-end' },
    progressBadge: {
      backgroundColor: 'rgba(255,255,255,0.14)',
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md - 1,
      paddingVertical: spacing.sm + 1,
    },
    progressText: { fontSize: 12.5, fontWeight: '600', color: 'rgba(255,255,255,0.9)' },
    // Same treatment RecordingScreen uses for the question once recording
    // starts - deliberately identical so it reads as "the same question,"
    // not a different UI element.
    questionBubble: {
      backgroundColor: 'rgba(0,0,0,0.45)',
      borderRadius: radius.lg,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
    },
    questionText: {
      ...typography.title,
      fontSize: 22,
      fontWeight: '800',
      color: '#FFFFFF',
      lineHeight: 28,
    },
    bottomBar: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: 30, gap: spacing.md },
    promptsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    countdownRow: { alignItems: 'center', gap: spacing.sm },
    countdownCircle: {
      width: 58,
      height: 58,
      borderRadius: 29,
      borderWidth: 2,
      borderColor: 'rgba(255,255,255,0.4)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    countdownNumber: { color: '#FFFFFF', fontSize: 27, fontWeight: '700' },
    countdownLabel: { color: '#FFFFFF', fontSize: 15.5, fontWeight: '600' },
  });
}
