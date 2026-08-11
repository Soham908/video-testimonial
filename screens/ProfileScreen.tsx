import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import type { PaletteColors } from '../theme/palettes';
import type { Spacing } from '../theme/spacing';
import type { Radius } from '../theme/radius';
import type { Typography } from '../theme/typography';
import { Button } from '../components/ui/Button';
import { ListRow } from '../components/ui/ListRow';
import { PopupSheet } from '../components/ui/Modal';

interface Props {
  /** "Consent and privacy" row (design 9C) - re-opens the consent gate for reference. */
  onOpenConsent?: () => void;
  /** Clears the stored session and returns to the login screen. */
  onLogout?: () => void;
}

// Design 9C + 9D - the two earlier layouts merged: who you are at the top,
// the reel-name card that appears on your videos in the middle with one
// edit action, account rows and settings below. Mock data only - no real
// account backend wired yet (DECISIONS.md's own "mock data first" order).
export function ProfileScreen({ onOpenConsent, onLogout }: Props) {
  const { colors, spacing, radius, typography } = useTheme();
  const styles = useMemo(() => makeStyles(colors, spacing, radius, typography), [colors, spacing, radius, typography]);

  const [editing, setEditing] = useState(false);
  const [reelName, setReelName] = useState('Mahesh Agrawal');
  const [reelBusiness, setReelBusiness] = useState('Agrawal Traders');
  const [showYears, setShowYears] = useState(true);
  const [years, setYears] = useState('6');
  // Settings-only mock toggles - no notification/network-policy backend
  // wired yet, same "mock data first" order as the rest of this screen.
  const [notifyOnReady, setNotifyOnReady] = useState(true);
  const [wifiOnly, setWifiOnly] = useState(false);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Profile</Text>

      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>MA</Text>
        </View>
        <View>
          <Text style={styles.name}>{reelName}</Text>
          <Text style={styles.role}>{reelBusiness} · Nagpur</Text>
        </View>
      </View>

      <View style={styles.reelCard}>
        <Text style={styles.reelCardLabel}>What appears on your videos</Text>
        <Text style={styles.reelCardValue}>{reelName}</Text>
        <Text style={styles.reelCardValue}>{reelBusiness}</Text>
        {showYears && <Text style={styles.reelCardValue}>Distributor for {years} years</Text>}
        <Text style={styles.editLink} onPress={() => setEditing(true)}>
          Edit these details
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Account</Text>
        <View style={{ gap: spacing.sm }}>
          <ListRow title="Phone" subtitle="+91 98765 43210" />
          <ListRow title="Distributor ID" subtitle="AA-4521" />
          <ListRow
            title="Distributor for"
            subtitle={`${reelBusiness} · ${years} years`}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Settings</Text>
        <View style={{ gap: spacing.sm }}>
          <ListRow
            title="Notify me when videos are ready"
            trailing={<Switch value={notifyOnReady} onValueChange={setNotifyOnReady} trackColor={{ true: colors.accent }} />}
          />
          <ListRow
            title="Upload on Wi-Fi only"
            trailing={<Switch value={wifiOnly} onValueChange={setWifiOnly} trackColor={{ true: colors.accent }} />}
          />
          <ListRow title="Language" subtitle="English" />
          <ListRow
            title="Consent and privacy"
            onPress={onOpenConsent}
            trailing={<Text style={styles.rowChevron}>›</Text>}
          />
        </View>
      </View>

      {onLogout && (
        <Text style={styles.logoutLink} onPress={onLogout}>
          Log out
        </Text>
      )}

      <Text style={styles.version}>v1.0</Text>

      <PopupSheet visible={editing} onDismiss={() => setEditing(false)}>
        <Text style={{ fontSize: 19, fontWeight: '700', color: colors.text, marginBottom: 4 }}>
          Edit these details
        </Text>
        <Text style={{ fontSize: 13, color: colors.textFaint, marginBottom: 18, lineHeight: 18 }}>
          Everything here shows on your finished video - nothing else does.
        </Text>

        <View style={{ gap: spacing.md }}>
          <Field label="Name" value={reelName} onChangeText={setReelName} styles={styles} />
          <Field label="Business" value={reelBusiness} onChangeText={setReelBusiness} styles={styles} />

          <View style={styles.yearsRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Show "Distributor for X years"</Text>
            </View>
            <Switch value={showYears} onValueChange={setShowYears} trackColor={{ true: colors.accent }} />
          </View>
          {showYears && <Field label="Years" value={years} onChangeText={setYears} styles={styles} keyboardType="number-pad" />}
        </View>

        <Button label="Save" onPress={() => setEditing(false)} style={{ marginTop: spacing.xl }} />
      </PopupSheet>
    </ScrollView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  styles,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  styles: ReturnType<typeof makeStyles>;
  keyboardType?: 'default' | 'number-pad';
}) {
  return (
    <View>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.fieldInput}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
      />
    </View>
  );
}

function makeStyles(colors: PaletteColors, spacing: Spacing, radius: Radius, typography: Typography) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.lg },
    title: { ...typography.title, fontSize: 24, color: colors.text },
    header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
    avatarText: { fontSize: 22, fontWeight: '700', color: colors.accentStrong },
    name: { fontSize: 19, fontWeight: '700', color: colors.text },
    role: { fontSize: 14, color: colors.textFaint, marginTop: 2 },
    reelCard: {
      borderWidth: 1.5,
      borderColor: colors.accent,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      padding: spacing.md,
      gap: 3,
    },
    reelCardLabel: {
      fontSize: 11.5,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
      color: colors.accent,
      fontWeight: '700',
      marginBottom: 4,
    },
    reelCardValue: { ...typography.body, fontSize: 15.5, fontWeight: '600', color: colors.text },
    editLink: { fontSize: 13.5, fontWeight: '700', color: colors.accent, marginTop: spacing.sm },
    section: { gap: spacing.sm },
    sectionLabel: {
      fontSize: 11.5,
      letterSpacing: 1.8,
      textTransform: 'uppercase',
      color: colors.textFaint,
      fontWeight: '700',
    },
    version: { textAlign: 'center', fontSize: 12, color: colors.textDisabled, marginTop: spacing.md },
    logoutLink: { textAlign: 'center', fontSize: 14.5, fontWeight: '700', color: colors.danger, marginTop: spacing.sm, padding: spacing.sm },
    rowChevron: { fontSize: 20, fontWeight: '700', color: colors.accent },
    fieldLabel: { fontSize: 12.5, fontWeight: '700', color: colors.textFaint, marginBottom: 6 },
    fieldInput: {
      ...typography.body,
      height: 46,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: radius.md,
      backgroundColor: colors.background,
      paddingHorizontal: spacing.sm + 4,
      color: colors.text,
    },
    yearsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  });
}
