import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { useStrings } from '../../i18n/useStrings';
import { PopupSheet } from './Modal';

export function InfoButton({ title, children }: { title: string; children: string }) {
  const [open, setOpen] = useState(false);
  const { colors, typography } = useTheme();
  const { t } = useStrings();
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={t('sharedUi.moreInfo', { title })} hitSlop={4} onPress={() => setOpen(true)} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 14, fontWeight: '700', color: colors.accent }}>i</Text></View>
    </Pressable>
    <PopupSheet visible={open} onDismiss={() => setOpen(false)} groupAccessibility={false}>
      <Text accessibilityRole="header" style={{ ...typography.title, fontSize: 19, color: colors.text, marginBottom: 12 }}>{title}</Text>
      <Text style={{ ...typography.body, fontSize: 14, lineHeight: 21, color: colors.textMuted }}>{children}</Text>
      <Pressable accessibilityRole="button" onPress={() => setOpen(false)} style={{ alignSelf: 'flex-end', minHeight: 44, padding: 12, marginTop: 12 }}><Text style={{ color: colors.accent, fontWeight: '700' }}>{t('legal.close')}</Text></Pressable>
    </PopupSheet>
  </>;
}
