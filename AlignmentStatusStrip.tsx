import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { AlignmentSignals } from './alignment';
import type { NoiseCheckStatus } from './useAmbientNoiseCheck';
import { colors, radius, spacing, themeDark, typography } from './theme';

type ItemStatus = 'checking' | 'good' | 'noisy';

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

// Thin, compact layer over the camera feed - all checks visible and live
// from the moment this mounts, each independently flipping checking->good
// as its own data resolves. Not a step-by-step wizard: nothing here needs
// a tap to acknowledge a pass. Only the noise row can additionally show an
// inline override action, since it's the one check the person can't
// necessarily fix just by repositioning.
export function AlignmentStatusStrip({
  visible,
  signals,
  noiseStatus,
  noiseSustained,
  noiseOverridden,
  onOverrideNoise,
}: Props) {
  if (!visible) return null;

  const showNoiseOverride =
    noiseStatus === 'noisy' && noiseSustained && !noiseOverridden;
  const noiseItemStatus: ItemStatus = noiseOverridden
    ? 'good'
    : noiseStatus === 'noisy'
      ? 'noisy'
      : noiseStatus;

  return (
    <View style={styles.container} pointerEvents="box-none">
      <StatusRow label="Centering" status={boolStatus(signals?.centered)} />
      <StatusRow label="Distance" status={boolStatus(signals?.distanceOk)} />
      <StatusRow label="Headroom" status={boolStatus(signals?.headroomOk)} />
      <StatusRow
        label="Noise"
        status={noiseItemStatus}
        action={
          showNoiseOverride
            ? { label: 'Continue anyway', onPress: onOverrideNoise }
            : undefined
        }
      />
    </View>
  );
}

function boolStatus(ok: boolean | undefined): ItemStatus {
  return ok ? 'good' : 'checking';
}

function StatusRow({
  label,
  status,
  action,
}: {
  label: string;
  status: ItemStatus;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View style={styles.row}>
      <View style={[styles.dot, dotStyleFor(status)]} />
      <Text style={styles.label}>{label}</Text>
      {action && (
        <Pressable style={styles.action} onPress={action.onPress} hitSlop={8}>
          <Text style={styles.actionText}>{action.label}</Text>
        </Pressable>
      )}
    </View>
  );
}

function dotStyleFor(status: ItemStatus) {
  if (status === 'good') return styles.dotGood;
  if (status === 'noisy') return styles.dotNoisy;
  return styles.dotChecking;
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: spacing.xl,
    left: spacing.md,
    backgroundColor: themeDark.chrome,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotChecking: {
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  dotGood: {
    backgroundColor: colors.accent,
  },
  dotNoisy: {
    backgroundColor: colors.warning,
  },
  label: {
    ...typography.caption,
    color: themeDark.textMuted,
  },
  action: {
    marginLeft: spacing.xs,
  },
  actionText: {
    ...typography.caption,
    color: colors.warning,
    textDecorationLine: 'underline',
    fontWeight: '600',
  },
});
