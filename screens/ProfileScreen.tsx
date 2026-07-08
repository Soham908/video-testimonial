import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';

// Design screen 2c. Entirely placeholder/static for now - no real account
// system exists yet (CLAUDE.md doesn't define one).
export function ProfileScreen() {
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <Text style={styles.title}>Profile</Text>

      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>RK</Text>
        </View>
        <View>
          <Text style={styles.name}>Ramesh Kumar</Text>
          <Text style={styles.role}>Distributor</Text>
        </View>
      </View>

      <View style={styles.infoCard}>
        <View style={[styles.infoRow, styles.infoRowDivider]}>
          <Text style={styles.infoLabel}>Phone</Text>
          <Text style={styles.infoValue}>+91 98765 43210</Text>
        </View>
        <View style={[styles.infoRow, styles.infoRowDivider]}>
          <Text style={styles.infoLabel}>Distributor ID</Text>
          <Text style={styles.infoValue}>AA-4521</Text>
        </View>
        <View style={[styles.infoRow, styles.infoRowDivider]}>
          <Text style={styles.infoLabel}>Company</Text>
          <Text style={styles.infoValue}>Your company</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Language</Text>
          <Text style={styles.infoValue}>English</Text>
        </View>
      </View>

      <Pressable style={styles.helpCard}>
        <View style={styles.helpIcon}>
          <Text style={styles.helpIconText}>?</Text>
        </View>
        <Text style={styles.helpLabel}>Help & support</Text>
        <View style={styles.chevron} />
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  title: {
    ...typography.title,
    fontSize: 24,
    color: colors.text,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.lg - 4,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    ...typography.body,
    fontSize: 22,
    fontWeight: '700',
    color: colors.accentStrong,
  },
  name: {
    ...typography.body,
    fontSize: 19,
    fontWeight: '700',
    color: colors.text,
  },
  role: {
    ...typography.body,
    fontSize: 14,
    color: colors.textFaint,
    marginTop: 2,
  },
  infoCard: {
    marginTop: spacing.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
  },
  infoRow: {
    gap: 3,
    paddingVertical: spacing.md - 2,
  },
  infoRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.canvas,
  },
  infoLabel: {
    ...typography.caption,
    fontSize: 12.5,
    fontWeight: '600',
    color: colors.textDisabled,
  },
  infoValue: {
    ...typography.body,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  helpCard: {
    marginTop: spacing.md - 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md - 4,
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  helpIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helpIconText: {
    ...typography.body,
    fontSize: 17,
    fontWeight: '700',
    color: colors.accentStrong,
  },
  helpLabel: {
    ...typography.body,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },
  chevron: {
    width: 9,
    height: 9,
    borderRightWidth: 2.5,
    borderTopWidth: 2.5,
    borderColor: colors.textDisabled,
    transform: [{ rotate: '45deg' }],
  },
});
