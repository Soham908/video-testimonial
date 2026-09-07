import { useMemo, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { useStrings } from '../i18n/useStrings';
import type { PaletteColors } from '../theme/palettes';
import type { Spacing } from '../theme/spacing';
import type { Radius } from '../theme/radius';
import type { Typography } from '../theme/typography';
import { Button } from '../components/ui/Button';

interface Identity {
  name: string;
  business: string;
  city: string;
  phone: string;
}

interface Props {
  /** Mocked for now - would come from the invite token once deep-linking is wired. */
  identity?: Identity;
  onConfirm: () => void;
}

// Mock identity data (not translatable UI copy - a stand-in for what a
// real invite token will provide later), same convention as the rest of
// this file's placeholder data per i18n/strings.en.json's own _meta note.
const DEFAULT_IDENTITY: Identity = {
  name: 'Mahesh Agrawal',
  business: 'Agrawal Traders',
  city: 'Nagpur',
  phone: '+91 98XXX XXXXX',
};

const FIELD_ORDER: (keyof Identity)[] = ['name', 'business', 'city', 'phone'];

// A check, not a form - everything arrives filled in and read-only until
// something needs fixing. Each line corrects on its own (design screen 12).
export function IdentityConfirmScreen({ identity = DEFAULT_IDENTITY, onConfirm }: Props) {
  const { colors, spacing, radius, typography } = useTheme();
  const styles = useMemo(() => makeStyles(colors, spacing, radius, typography), [colors, spacing, radius, typography]);
  const { t } = useStrings();

  const [values, setValues] = useState(identity);
  const [editingField, setEditingField] = useState<keyof Identity | null>(null);

  const fieldLabels: Record<keyof Identity, string> = {
    name: t('identityConfirm.fieldLabelName'),
    business: t('identityConfirm.fieldLabelBusiness'),
    city: t('identityConfirm.fieldLabelCity'),
    phone: t('identityConfirm.fieldLabelPhone'),
  };

  return (
    <Pressable style={styles.container} onPress={Keyboard.dismiss}>
      <View>
        <Text style={styles.eyebrow}>{t('identityConfirm.eyebrow')}</Text>
        <Text style={styles.title}>{t('identityConfirm.title')}</Text>
        <Text style={styles.subtitle}>{t('identityConfirm.subtitle')}</Text>

        <View style={styles.fieldsGroup}>
          {FIELD_ORDER.map((field) => (
            <View key={field} style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>{fieldLabels[field]}</Text>
              {editingField === field ? (
                <TextInput
                  style={styles.fieldInput}
                  value={values[field]}
                  onChangeText={(text) => setValues((v) => ({ ...v, [field]: text }))}
                  onBlur={() => setEditingField(null)}
                  autoFocus
                />
              ) : (
                <Text style={styles.fieldValue} onPress={() => setEditingField(field)}>
                  {values[field]} <Text style={styles.editHint}>· {t('identityConfirm.editHint')}</Text>
                </Text>
              )}
            </View>
          ))}
        </View>

        <Button label={t('identityConfirm.confirmButton')} onPress={onConfirm} style={{ marginTop: spacing.xl }} />
      </View>
    </Pressable>
  );
}

function makeStyles(colors: PaletteColors, spacing: Spacing, radius: Radius, typography: Typography) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      padding: spacing.xl,
      paddingTop: spacing.xxl + spacing.topExtra,
      paddingBottom: spacing.xxl,
    },
    eyebrow: {
      fontSize: 12.5,
      fontWeight: '700',
      letterSpacing: 1.5,
      textTransform: 'uppercase',
      color: colors.accent,
      marginBottom: spacing.sm - 2,
    },
    title: { ...typography.title, fontSize: 26, color: colors.text },
    subtitle: { ...typography.body, color: colors.textMuted, marginTop: spacing.xs, lineHeight: 22 },
    fieldsGroup: { marginTop: spacing.xl, gap: spacing.sm },
    fieldRow: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    fieldLabel: { ...typography.caption, color: colors.textFaint, marginBottom: 4 },
    fieldValue: { ...typography.body, fontWeight: '600', color: colors.text },
    fieldInput: { ...typography.body, fontWeight: '600', color: colors.text, padding: 0 },
    editHint: { ...typography.caption, fontWeight: '600', color: colors.accent },
  });
}
