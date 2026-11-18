import { useEffect, useState } from 'react';
import { AppState, ScrollView, StyleSheet, Text, View } from 'react-native';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { useTheme } from '../theme/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../components/ui/Button';
import { PopupSheet } from '../components/ui/Modal';
import { containsDevanagari, devanagariFontFamily } from '../theme/fonts';
import { useStrings } from '../i18n/useStrings';
import { playQuestionAudio } from '../playQuestionAudio';

interface Props {
  questionText: string;
  voPlaybackUrl?: string;
  readQuestionAloud: boolean;
  onRecordForReal: () => void;
  onBackToBrief: () => void;
}

// Rehearsal uses the shared camera as a preview. Playback completion only
// changes the guidance on this screen.
export function RehearseScreen({ questionText, voPlaybackUrl, readQuestionAloud, onRecordForReal, onBackToBrief }: Props) {
  const { colors, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const [finishing, setFinishing] = useState(false);
  const [audioRequest, setAudioRequest] = useState<'play' | 'retry' | null>(
    readQuestionAloud && voPlaybackUrl ? 'play' : null,
  );
  const [audioFailed, setAudioFailed] = useState(false);
  const player = useAudioPlayer(voPlaybackUrl ?? null, { keepAudioSessionActive: true });
  const { t } = useStrings();

  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => {
      if (state !== 'active') setAudioRequest(null);
    });
    return () => listener.remove();
  }, []);

  useEffect(() => {
    const source = voPlaybackUrl;
    if (!audioRequest || !source) return;
    if (AppState.currentState && AppState.currentState !== 'active') {
      setAudioRequest(null);
      return;
    }
    const controller = new AbortController();
    async function play(questionAudioUrl: string) {
      try {
        await setAudioModeAsync({ playsInSilentMode: true });
        if (controller.signal.aborted) return;
        if (audioRequest === 'retry') player.replace(questionAudioUrl);
        await playQuestionAudio(player, controller.signal);
      } catch {
        if (!controller.signal.aborted) setAudioFailed(true);
      } finally {
        if (!controller.signal.aborted) setAudioRequest(null);
      }
    }
    void play(source);
    return () => controller.abort();
  }, [audioRequest, player, voPlaybackUrl]);

  function toggleQuestionAudio() {
    if (audioRequest) {
      setAudioRequest(null);
      return;
    }
    setAudioFailed(false);
    setAudioRequest(audioFailed ? 'retry' : 'play');
  }

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: insets.top + spacing.edgeGap + spacing.md,
          paddingBottom: insets.bottom + spacing.footerGap,
          paddingLeft: insets.left + spacing.md,
          paddingRight: insets.right + spacing.md,
          gap: spacing.md,
        },
      ]}
      pointerEvents="box-none"
    >
      <View style={styles.topBanner} pointerEvents="none">
        <Text style={styles.topBannerText}>{t('rehearse.topBanner')}</Text>
      </View>

      <View style={[styles.panel, { gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg }]}>
        <ScrollView style={styles.promptScroll}>
          <Text style={[styles.promptText, containsDevanagari(questionText) && { fontFamily: devanagariFontFamily('600') }]}>
            {questionText}
          </Text>
        </ScrollView>
        <Text style={styles.hint} accessibilityLiveRegion="polite">
          {t(audioRequest ? 'rehearse.listenHint' : audioFailed || !voPlaybackUrl ? 'rehearse.audioUnavailable' : 'rehearse.practiceHint')}
        </Text>
        {voPlaybackUrl && (
          <Button
            label={t(audioRequest ? 'rehearse.stopAudio' : 'rehearse.playQuestion')}
            onPress={toggleQuestionAudio}
            variant="quiet"
            textStyle={styles.audioButton}
          />
        )}
        <Button label={t('rehearse.finishButton')} onPress={() => {
          setAudioRequest(null);
          setFinishing(true);
        }} />
      </View>

      <PopupSheet visible={finishing} onDismiss={() => setFinishing(false)}>
        <Text style={{ fontSize: 19, fontWeight: '700', color: colors.text, marginBottom: 8 }}>
          {t('rehearse.popupTitle')}
        </Text>
        <Text style={{ fontSize: 14.5, color: colors.textMuted, lineHeight: 20, marginBottom: 20 }}>
          {t('rehearse.popupBody')}
        </Text>
        <View style={{ gap: 10 }}>
          <Button
            label={t('rehearse.popupRecordForRealButton')}
            onPress={() => {
              setFinishing(false);
              onRecordForReal();
            }}
          />
          <Button
            label={t('rehearse.popupBackToBriefButton')}
            variant="secondary"
            onPress={() => {
              setFinishing(false);
              onBackToBrief();
            }}
          />
        </View>
      </PopupSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, justifyContent: 'space-between' },
  topBanner: { alignItems: 'center' },
  topBannerText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 14,
    overflow: 'hidden',
    textAlign: 'center',
  },
  panel: { alignSelf: 'center', width: '100%', maxWidth: 560, flexShrink: 1, backgroundColor: 'rgba(0,0,0,0.75)' },
  promptScroll: { flexGrow: 0, flexShrink: 1 },
  promptText: { color: '#FFFFFF', fontSize: 17, fontWeight: '600', textAlign: 'center', lineHeight: 24 },
  hint: { color: '#E0E0E0', fontSize: 13, textAlign: 'center' },
  audioButton: { color: '#FFFFFF' },
});
