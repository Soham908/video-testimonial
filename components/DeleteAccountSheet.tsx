import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { useStrings } from '../i18n/useStrings';
import { Button } from './ui/Button';
import { KeyboardAwareScrollView } from './ui/KeyboardAwareScrollView';
import { BottomSystemBarBackground, SYSTEM_BAR_BACKGROUND } from '../theme/SystemBarFrame';
import { ApiError } from '../api';

export function DeleteAccountSheet({ visible, busy, onClose, onDelete }: {
  visible: boolean; busy: boolean; onClose: () => void; onDelete: (password: string) => Promise<void>;
}) {
  const { colors, spacing } = useTheme();
  const { t } = useStrings();
  const insets = useSafeAreaInsets();
  const [password, setPassword] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  useEffect(() => { if (!visible) { setPassword(''); setAcknowledged(false); setError(null); } }, [visible]);
  async function submit() {
    if (!password || !acknowledged || busy || submitting.current) return;
    submitting.current = true;
    setError(null);
    try { await onDelete(password); setPassword(''); }
    catch (failure) {
      setError(failure instanceof ApiError && failure.code === 'incorrect_password' ? t('deletion.wrongPassword') :
        failure instanceof ApiError && failure.status === 404 ? t('deletion.unavailable') : t('deletion.requestError'));
    } finally { submitting.current = false; }
  }
  return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { if (!busy) onClose(); }}>
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <KeyboardAwareScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: spacing.xl, paddingTop: insets.top + spacing.edgeGap + spacing.lg, paddingBottom: insets.bottom + spacing.edgeGap + spacing.footerGap, gap: spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 25, fontWeight: '700', flex: 1 }}>{t('deletion.title')}</Text>
          <Pressable accessibilityRole="button" disabled={busy} onPress={onClose} style={{ padding: 12 }}><Text style={{ color: colors.accent }}>{t('deletion.cancel')}</Text></Pressable>
        </View>
        <Text style={{ color: colors.text, fontSize: 16, lineHeight: 24 }}>{t('deletion.warning')}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 14, lineHeight: 21 }}>{t('deletion.timing')}</Text>
        <Text style={{ color: colors.text, fontWeight: '600' }}>{t('deletion.password')}</Text>
        <TextInput accessibilityLabel={t('deletion.password')} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} textContentType="password" editable={!busy} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.text, backgroundColor: colors.surface, padding: 16, fontSize: 17 }} />
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: acknowledged, disabled: busy }} onPress={() => setAcknowledged(value => !value)} disabled={busy} style={{ flexDirection: 'row', gap: 12, paddingVertical: 10 }}>
          <Text style={{ color: colors.accent, fontSize: 23 }}>{acknowledged ? '☑' : '☐'}</Text>
          <Text style={{ color: colors.text, flex: 1, lineHeight: 22 }}>{t('deletion.acknowledge')}</Text>
        </Pressable>
        {error && <Text accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Text>}
        <Button label={busy ? t('deletion.requesting') : t('deletion.confirm')} onPress={submit} disabled={busy || !password || !acknowledged} style={password && acknowledged ? { backgroundColor: colors.danger } : undefined} />
        <Button label={t('deletion.cancel')} variant="secondary" onPress={onClose} disabled={busy} />
      </KeyboardAwareScrollView>
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top + spacing.edgeGap, backgroundColor: SYSTEM_BAR_BACKGROUND }} />
      <BottomSystemBarBackground />
    </KeyboardAvoidingView>
  </Modal>;
}
