import { useEffect, useMemo, useState } from 'react';
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
  // Real distributor identity (auth.ts / distributorProfile.ts) - null/
  // undefined while still loading, or in principle if a distributor
  // genuinely has none set. The fallbacks below (generic avatar, "Add your
  // name", "Not available yet") stay in place for exactly that case, not
  // just for pre-launch placeholder purposes.
  distributorId: string | null;
  distributorName?: string;
  distributorPhone?: string;
  /** "Consent and privacy" row (design 9C) - re-opens the consent gate for reference. */
  onOpenConsent?: () => void;
  /** Clears the stored session and returns to the login screen. */
  onLogout?: () => void;
}

// Truncated, not fabricated - the backend only has a UUID, no short
// human-friendly code (see the gap notes below), so this is a real prefix
// of the real id rather than an invented "AA-4521"-style code.
function formatDistributorId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

// Design 9C + 9D - the two earlier layouts merged: who you are at the top,
// the reel-name card that appears on your videos in the middle with one
// edit action, account rows and settings below.
//
// reelName/reelBusiness/years are a real product feature (what shows on the
// person's finished video, editable independent of their account name) but
// have no backend persistence yet - local-only state, matching DECISIONS.md's
// "mock data first" order. reelName starts blank and is pre-filled from the
// real distributorName once it loads (see the effect below) rather than at
// useState-init time, since the fetch resolves after first render - still
// freely editable after that. reelBusiness/years have no real source to
// pre-fill from (business/years_as_distributor exist on the backend now too,
// but are internal-test-phase-only fields this screen deliberately doesn't
// consume yet) and stay blank until the person fills them in themselves.
export function ProfileScreen({ distributorId, distributorName, distributorPhone, onOpenConsent, onLogout }: Props) {
  const { colors, spacing, radius, typography } = useTheme();
  const styles = useMemo(() => makeStyles(colors, spacing, radius, typography), [colors, spacing, radius, typography]);

  const [editing, setEditing] = useState(false);
  const [reelName, setReelName] = useState('');
  const [reelBusiness, setReelBusiness] = useState('');
  const [showYears, setShowYears] = useState(false);
  const [years, setYears] = useState('');
  // Settings-only mock toggles - no notification/network-policy backend
  // wired yet, same "mock data first" order as the rest of this screen.
  const [notifyOnReady, setNotifyOnReady] = useState(true);
  const [wifiOnly, setWifiOnly] = useState(false);

  // Runs once distributorName actually arrives (it's fetched async, so it's
  // never present on first render). Only fires while reelName is still at
  // its untouched default - never overwrites a name the person has already
  // typed or deliberately cleared.
  useEffect(() => {
    if (distributorName && reelName === '') {
      setReelName(distributorName);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [distributorName]);

  const initials = reelName
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const hasReelDetails = reelName.length > 0 || reelBusiness.length > 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Profile</Text>

      <View style={styles.header}>
        <View style={styles.avatar}>
          {initials ? <Text style={styles.avatarText}>{initials}</Text> : <GenericAvatarGlyph />}
        </View>
        <View>
          <Text style={styles.name}>{reelName || 'Add your name'}</Text>
          {reelBusiness.length > 0 && <Text style={styles.role}>{reelBusiness}</Text>}
        </View>
      </View>

      <View style={styles.reelCard}>
        <Text style={styles.reelCardLabel}>What appears on your videos</Text>
        {hasReelDetails ? (
          <>
            {reelName.length > 0 && <Text style={styles.reelCardValue}>{reelName}</Text>}
            {reelBusiness.length > 0 && <Text style={styles.reelCardValue}>{reelBusiness}</Text>}
            {showYears && years.length > 0 && (
              <Text style={styles.reelCardValue}>Distributor for {years} years</Text>
            )}
          </>
        ) : (
          <Text style={styles.reelCardEmpty}>Nothing set yet - add your name and business below.</Text>
        )}
        <Text style={styles.editLink} onPress={() => setEditing(true)}>
          Edit these details
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Account</Text>
        <View style={{ gap: spacing.sm }}>
          <ListRow title="Phone" subtitle={distributorPhone ?? 'Not available yet'} />
          <ListRow
            title="Distributor ID"
            subtitle={distributorId ? formatDistributorId(distributorId) : 'Loading…'}
          />
          {reelBusiness.length > 0 && (
            <ListRow
              title="Distributor for"
              subtitle={years.length > 0 ? `${reelBusiness} · ${years} years` : reelBusiness}
            />
          )}
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

// Same "nothing set yet" convention as HomeScreen's own copy of this glyph
// (duplicated rather than shared - both are small, screen-local
// presentational helpers, matching how PlayGlyph is already defined
// separately in HomeScreen.tsx and HelpScreen.tsx).
function GenericAvatarGlyph() {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors.accentStrong, marginBottom: 3 }} />
      <View style={{ width: 34, height: 18, borderTopLeftRadius: 17, borderTopRightRadius: 17, backgroundColor: colors.accentStrong }} />
    </View>
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
    content: {
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.xl + spacing.topExtra,
      paddingBottom: spacing.xxl,
      gap: spacing.lg,
    },
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
    reelCardEmpty: { ...typography.body, fontSize: 14, color: colors.textFaint, lineHeight: 20 },
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
