import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { AlignmentSignals } from './alignment';
import type { NoiseCheckStatus } from './useAmbientNoiseCheck';
import { useTheme } from './theme/ThemeContext';
import type { Spacing } from './theme/spacing';
import { ChecklistRow, type CheckStatus } from './components/ui/ChecklistRow';
import { useStrings } from './i18n/useStrings';

interface Props {
  visible: boolean;
  signals: AlignmentSignals | null;
  noiseStatus: NoiseCheckStatus;
  // Only show the override affordance once noise has been bad for a
  // sustained stretch (not a single spike) - see useAmbientNoiseCheck.
  noiseSustained: boolean;
  noiseOverridden: boolean;
  onOverrideNoise: () => void;
}

// Reveal order/timing is a pure UI staging device - each row's underlying
// signal is already live and computed in parallel the moment it appears
// (DECISIONS.md: "checks revealed one at a time, executed in parallel").
// Framing/Distance are omitted from the mockup's row -> which sub-signal
// mapping isn't 1:1, so this combines centered+headroomOk into "Framing"
// and distanceOk alone into "Distance". Light/brightness is intentionally
// not a row here - that detection was never built (see DECISIONS.md).
const REVEAL_DELAYS_MS = { framing: 0, distance: 400, sound: 800 };

export function AlignmentStatusStrip({
  visible,
  signals,
  noiseStatus,
  noiseSustained,
  noiseOverridden,
  onOverrideNoise,
}: Props) {
  const { spacing } = useTheme();
  const styles = useMemo(() => makeStyles(spacing), [spacing]);
  const { t } = useStrings();

  const [revealed, setRevealed] = useState({ framing: false, distance: false, sound: false });

  useEffect(() => {
    if (!visible) {
      setRevealed({ framing: false, distance: false, sound: false });
      return;
    }
    const timers = (Object.keys(REVEAL_DELAYS_MS) as (keyof typeof REVEAL_DELAYS_MS)[]).map((key) =>
      setTimeout(() => setRevealed((prev) => ({ ...prev, [key]: true })), REVEAL_DELAYS_MS[key]),
    );
    return () => timers.forEach(clearTimeout);
  }, [visible]);

  if (!visible) return null;

  const framingStatus: CheckStatus = !revealed.framing
    ? 'pending'
    : signals?.centered && signals?.headroomOk
      ? 'good'
      : 'checking';
  const distanceStatus: CheckStatus = !revealed.distance ? 'pending' : signals?.distanceOk ? 'good' : 'checking';
  const soundGood = noiseOverridden || noiseStatus === 'good';
  const soundStatus: CheckStatus = !revealed.sound ? 'pending' : soundGood ? 'good' : 'checking';

  const showSkip = revealed.sound && noiseStatus === 'noisy' && noiseSustained && !noiseOverridden;

  return (
    <View style={styles.container} pointerEvents="box-none">
      <View style={styles.rows}>
        <ChecklistRow label={t('alignmentGuide.checklistFraming')} status={framingStatus} />
        <ChecklistRow label={t('alignmentGuide.checklistDistance')} status={distanceStatus} />
        <ChecklistRow label={t('alignmentGuide.checklistSound')} status={soundStatus} />
      </View>
      {showSkip && (
        <Pressable style={styles.skipRow} onPress={onOverrideNoise} hitSlop={8}>
          <Text style={styles.skipText}>{t('alignmentGuide.skipNoiseCheckButton')}</Text>
        </Pressable>
      )}
    </View>
  );
}

function makeStyles(spacing: Spacing) {
  return StyleSheet.create({
    container: {
      position: 'absolute',
      left: spacing.md + 4,
      right: spacing.md + 4,
      // Nudged down from 130 - was sitting close enough to the guidance
      // message above it (AlignmentGuideOverlay) to overlap on shorter
      // screens. The message no longer renders below the oval at all now,
      // but this still leaves a bit more breathing room above the
      // Start-recording button/countdown row below.
      bottom: 104,
    },
    rows: { gap: spacing.xs },
    skipRow: { alignItems: 'center', marginTop: spacing.md },
    skipText: { color: 'rgba(255,255,255,0.5)', fontSize: 14, fontWeight: '600' },
  });
}
