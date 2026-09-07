import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import type { Spacing } from '../theme/spacing';
import type { Radius } from '../theme/radius';
import { Button } from '../components/ui/Button';
import { PopupSheet } from '../components/ui/Modal';
import { containsDevanagari, devanagariFontFamily } from '../theme/fonts';
import { useStrings } from '../i18n/useStrings';

interface Props {
  questionText: string;
  onRecordForReal: () => void;
  onBackToBrief: () => void;
}

// Chrome-only overlay - rendered as a SIBLING of <CameraAlignment/>, not a
// wrapper (see CameraCheckScreen's comment for why: CameraAlignment must
// not remount when swapping between rehearse/check/recording chrome).
// Mirrors the real recording screen (per DECISIONS.md) - full-sentence
// prompt instead of terse keywords, and deliberately non-gating: nothing
// here is a checklist to pass, since the whole point is zero-stakes
// practice. Structurally never persists anything - this screen never calls
// CameraAlignment's imperative startRecording()/stopRecording(), so there
// is no code path here that could ever save a rehearsal as a take (not
// just a UI label saying so).
export function RehearseScreen({ questionText, onRecordForReal, onBackToBrief }: Props) {
  const { colors, spacing, radius } = useTheme();
  const styles = useMemo(() => makeStyles(spacing, radius), [spacing, radius]);
  const [finishing, setFinishing] = useState(false);
  const { t } = useStrings();

  return (
    <View style={styles.container} pointerEvents="box-none">
      <View style={styles.topBanner} pointerEvents="none">
        <Text style={styles.topBannerText}>{t('rehearse.topBanner')}</Text>
      </View>

      <View style={styles.promptBox} pointerEvents="none">
        <Text style={[styles.promptText, containsDevanagari(questionText) && { fontFamily: devanagariFontFamily('600') }]}>
          {questionText}
        </Text>
      </View>

      <View style={styles.bottomBar}>
        <Button label={t('rehearse.finishButton')} onPress={() => setFinishing(true)} />
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

function makeStyles(spacing: Spacing, radius: Radius) {
  return StyleSheet.create({
    container: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    topBanner: {
      position: 'absolute',
      top: 16,
      left: spacing.lg,
      right: spacing.lg,
      alignItems: 'center',
    },
    topBannerText: {
      color: '#FFFFFF',
      fontSize: 12.5,
      fontWeight: '700',
      backgroundColor: 'rgba(0,0,0,0.45)',
      borderRadius: 999,
      paddingVertical: 6,
      paddingHorizontal: 14,
      overflow: 'hidden',
    },
    promptBox: {
      position: 'absolute',
      left: spacing.lg,
      right: spacing.lg,
      bottom: 120,
    },
    promptText: {
      color: '#FFFFFF',
      fontSize: 19,
      fontWeight: '600',
      textAlign: 'center',
      lineHeight: 26,
    },
    bottomBar: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: 30 },
  });
}
