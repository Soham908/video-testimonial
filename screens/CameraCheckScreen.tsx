import { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useVideoPlayer } from 'expo-video';
import { useTheme } from '../theme/ThemeContext';
import type { PaletteColors } from '../theme/palettes';
import type { Spacing } from '../theme/spacing';
import type { Radius } from '../theme/radius';
import type { Typography } from '../theme/typography';
import { Toggle } from '../components/ui/Toggle';
import { Button } from '../components/ui/Button';
import { PopupSheet } from '../components/ui/Modal';
import { containsDevanagari, devanagariFontFamily } from '../theme/fonts';
import { useStrings } from '../i18n/useStrings';
import { useFirstRunTip } from '../useFirstRunTip';

interface Props {
  questionNumber: number;
  totalQuestions: number;
  // Shown once countingDown is true, in the same place/style RecordingScreen
  // shows it - reinforces the question that was just read aloud (or is
  // being read aloud right now, if readQuestionAloud is on) instead of it
  // only ever being audio, or only appearing once recording actually starts.
  questionText: string;
  autoStart: boolean;
  onToggleAutoStart: (next: boolean) => void;
  /** True once alignment has locked and noise is clear (or overridden). */
  checksReady: boolean;
  countingDown: boolean;
  countdownSeconds: number;
  onStartRecording: () => void;
  // The current question's own vo_playback_url (API_CONTRACT.md), same
  // source QuestionBriefScreen's "Read to me" uses - a fresh presigned S3
  // URL, not a bundled/local clip. undefined while questions are still
  // loading.
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
  autoStart,
  onToggleAutoStart,
  checksReady,
  countingDown,
  countdownSeconds,
  onStartRecording,
  voPlaybackUrl,
  readQuestionAloud,
  onToggleReadQuestionAloud,
}: Props) {
  const { colors, spacing, radius, typography } = useTheme();
  const styles = useMemo(() => makeStyles(colors, spacing, radius, typography), [colors, spacing, radius, typography]);
  const { t } = useStrings();

  // First-time-only pointer explaining the alignment circle - real tester
  // feedback was that it wasn't obvious what to do with it. Only eligible
  // while the checks screen itself is up (not during the countdown, which
  // reuses this same component) so it can't pop up moments before
  // recording starts.
  const cameraCheckTip = useFirstRunTip('cameraCheckAlignment', !countingDown);

  // null (not just undefined) while there's nothing to play - useVideoPlayer
  // accepts a null source and stays inert, same fallback QuestionBriefScreen's
  // "Read to me" uses.
  const audioSource = voPlaybackUrl ?? null;
  const player = useVideoPlayer(audioSource);

  // The underlying native call can throw synchronously with "Cannot use
  // shared object that was already released" - same root cause and same
  // defensive pattern as useAmbientNoiseCheck.ts's safeStop() (see that
  // file's comment for the full mechanism), just for VideoPlayer instead
  // of AudioRecorder. useVideoPlayer releases its native player
  // automatically on unmount; there's no ordering guarantee that this
  // effect's own cleanup runs before that happens - most reliably hit right
  // when the countdown ends, since that's the same render that unmounts
  // this component (phase flips away from 'cameraCheck'/'countdown').
  function safePause() {
    try {
      player.pause();
    } catch (error) {
      console.warn('[camera-check] VO pause failed', error);
    }
  }

  // Plays once per countdown, from the top, only while the preference is
  // on - not tied to whether it happened to still be playing from Question
  // Brief's "Read to me", since that's a different moment in the flow and
  // may not have been used at all. Stopped (not just paused) the instant
  // the countdown ends and 'recording' actually starts (CLAUDE.md: no
  // simultaneous playback + record, mic pickup would otherwise catch the
  // tail of this over the person's own answer) - countingDown flipping to
  // false covers both that transition and a cancelled countdown alike.
  useEffect(() => {
    if (audioSource == null) return;
    if (!countingDown || !readQuestionAloud) {
      safePause();
      return;
    }
    try {
      player.currentTime = 0;
      player.play();
    } catch (error) {
      console.warn('[camera-check] VO play failed', error);
    }
    return safePause;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countingDown, readQuestionAloud, audioSource]);

  return (
    <View style={styles.container} pointerEvents="box-none">
      <View style={styles.topBar} pointerEvents="box-none">
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

      <View style={styles.bottomBar} pointerEvents="box-none">
        {countingDown ? (
          <View style={styles.countdownRow}>
            <View style={styles.countdownCircle}>
              <Text style={styles.countdownNumber}>{Math.max(countdownSeconds, 1)}</Text>
            </View>
            <Text style={styles.countdownLabel}>
              {t('cameraCheck.countdownLabel', { seconds: Math.max(countdownSeconds, 1) })}
            </Text>
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
    bottomBar: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: 30 },
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
