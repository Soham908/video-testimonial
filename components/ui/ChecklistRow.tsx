import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';

export type CheckStatus = 'pending' | 'checking' | 'good';

interface ChecklistRowProps {
  label: string;
  status: CheckStatus;
}

// One row of Camera Check's sequential checklist (Framing / Distance /
// Sound). Statuses reveal in order but resolve independently, per
// DECISIONS.md - each row just renders whatever status it's given.
export function ChecklistRow({ label, status }: ChecklistRowProps) {
  const background =
    status === 'good'
      ? 'rgba(255,255,255,0.07)'
      : status === 'checking'
        ? 'rgba(255,255,255,0.18)'
        : 'transparent';
  const borderColor = status === 'checking' ? 'rgba(255,255,255,0.34)' : 'rgba(255,255,255,0.12)';
  const textColor = status === 'pending' ? 'rgba(255,255,255,0.45)' : '#FFFFFF';

  return (
    <View style={[styles.row, { backgroundColor: background, borderColor, borderWidth: status === 'checking' ? 1 : status === 'pending' ? 1 : 0 }]}>
      <StatusMark status={status} />
      <Text style={[styles.label, { color: textColor, fontWeight: status === 'good' ? '600' : status === 'checking' ? '700' : '600' }]}>
        {label}
      </Text>
      {status === 'checking' && <Text style={styles.checkingLabel}>Checking</Text>}
    </View>
  );
}

function StatusMark({ status }: { status: CheckStatus }) {
  if (status === 'good') {
    return (
      <View style={[styles.dot, { backgroundColor: 'rgba(255,255,255,0.92)' }]}>
        <Text style={styles.check}>{'✓'}</Text>
      </View>
    );
  }
  if (status === 'checking') {
    return <View style={[styles.dot, styles.dotChecking]} />;
  }
  return <View style={[styles.dot, { backgroundColor: 'rgba(255,255,255,0.1)' }]} />;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 15,
  },
  dot: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  dotChecking: { borderWidth: 2, borderColor: 'rgba(255,255,255,0.45)' },
  check: { color: '#241E1A', fontSize: 11, fontWeight: '700' },
  label: { flex: 1, fontSize: 15.5 },
  checkingLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600' },
});
