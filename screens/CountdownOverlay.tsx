import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, themeDark, typography } from '../theme';

interface Props {
  seconds?: number;
  onComplete: () => void;
}

// Real 5-second visual countdown per CLAUDE.md - recording hasn't started
// yet at this point, so this costs nothing in final video length.
export function CountdownOverlay({ seconds = 5, onComplete }: Props) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    setRemaining(seconds);
  }, [seconds]);

  useEffect(() => {
    if (remaining <= 0) {
      onComplete();
      return;
    }
    const timeout = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(timeout);
  }, [remaining, onComplete]);

  return (
    <View style={styles.overlay}>
      <Text style={styles.label}>Get ready…</Text>
      <Text style={styles.count}>{Math.max(remaining, 1)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(30,33,31,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    ...typography.subtitle,
    color: themeDark.textFaint,
    marginBottom: spacing.sm,
  },
  count: {
    fontSize: 96,
    fontWeight: '700',
    color: colors.accent,
    fontVariant: ['tabular-nums'],
  },
});
