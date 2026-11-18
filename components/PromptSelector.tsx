import { useRef, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { useStrings } from '../i18n/useStrings';
import { PopupSheet } from './ui/Modal';
import { InfoButton } from './ui/InfoButton';
import { containsDevanagari, devanagariFontFamily } from '../theme/fonts';
import { MAX_CUSTOM_PROMPT_LENGTH, MAX_SELECTED_PROMPTS, type AddPromptResult, type PromptSelectionControl } from '../promptSelection';

export function PromptSelector({ options, selectedIds, onToggle, onAdd, onRemove, saveFailed, onBeginAdd, onEndAdd }: PromptSelectionControl & { onBeginAdd?: () => void; onEndAdd?: () => void }) {
  const { colors, radius, typography } = useTheme();
  const { t } = useStrings();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [message, setMessage] = useState<AddPromptResult | null>(null);
  const input = useRef<TextInput>(null);
  const full = selectedIds.length >= MAX_SELECTED_PROMPTS;
  const font = (value: string, weight = '400') => containsDevanagari(value) ? { fontFamily: devanagariFontFamily(weight) } : undefined;
  function close() { setEditing(false); setText(''); setMessage(null); Keyboard.dismiss(); onEndAdd?.(); }
  function add() {
    const result = onAdd(text);
    setMessage(result);
    if (result === 'selected' || result === 'unselected') { setEditing(false); setText(''); Keyboard.dismiss(); onEndAdd?.(); }
  }
  const error = message === 'empty' || message === 'duplicate' || message === 'tooLong';
  return (
    <View style={styles.container}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Text accessibilityLiveRegion="polite" style={[typography.caption, { color: colors.accent, fontSize: 12 }]}>{t('prompts.selectionSummary', { count: selectedIds.length, max: MAX_SELECTED_PROMPTS })}</Text>
        <InfoButton title={t('questionBrief.talkingPointsSectionTitle')}>{t('prompts.explanation', { max: MAX_SELECTED_PROMPTS })}</InfoButton>
      </View>
      <View style={styles.options}>
      {options.map(option => {
        const selected = selectedIds.includes(option.id);
        const disabled = full && !selected;
        return (
          <View key={option.id} style={[styles.row, { borderColor: selected ? colors.accent : colors.borderStrong, backgroundColor: selected ? colors.accentSoft : colors.surface, borderRadius: radius.md, flexBasis: option.custom || option.text.length > 28 ? '100%' : '47%' }]}>
            <Pressable accessibilityRole="checkbox" accessibilityLabel={option.text} accessibilityState={{ checked: selected, disabled }} disabled={disabled} onPress={() => { setMessage(null); onToggle(option.id); }} style={styles.option}>
              <View style={[styles.checkbox, { borderColor: selected ? colors.accent : colors.textFaint, backgroundColor: selected ? colors.accent : 'transparent' }]}>
                {selected && <Text style={{ color: colors.accentText, fontWeight: '800', fontSize: 14 }}>✓</Text>}
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[typography.body, { color: disabled ? colors.textMuted : colors.text, fontSize: 14, lineHeight: 20 }, font(option.text)]}>{option.text}</Text>
                {option.custom && <Text style={[typography.caption, { color: colors.textMuted }, font(t('prompts.yourPrompt'))]}>{t('prompts.yourPrompt')}</Text>}
              </View>
            </Pressable>
            {option.custom && <Pressable accessibilityRole="button" accessibilityLabel={t('prompts.remove', { prompt: option.text })} onPress={() => { setMessage(null); onRemove(option.id); }} style={styles.remove}><Text style={{ color: colors.textMuted, fontSize: 24 }}>×</Text></Pressable>}
          </View>
        );
      })}
      </View>
      <Text accessibilityLiveRegion="polite" style={[typography.caption, { color: colors.textMuted, lineHeight: 20 }, font(t(full ? 'prompts.limitHint' : 'prompts.optionalHint'))]}>{t(full ? 'prompts.limitHint' : 'prompts.optionalHint')}</Text>
      {message === 'unselected' && <Text accessibilityRole="alert" style={[typography.caption, { color: colors.accent, lineHeight: 20 }, font(t('prompts.addedUnselected'))]}>{t('prompts.addedUnselected')}</Text>}
      <Pressable accessibilityRole="button" onPress={() => { onBeginAdd?.(); setMessage(null); setEditing(true); }} style={[styles.addButton, { borderColor: colors.accent, borderRadius: radius.md }]}><Text style={[typography.button, { fontSize: 14, color: colors.accent }]}>{t('questionBrief.addPromptRow')}</Text></Pressable>
      <PopupSheet visible={editing} onDismiss={close} groupAccessibility={false} onShow={() => input.current?.focus()}>
      {editing && (
        <View style={[styles.form, { borderColor: colors.borderStrong, backgroundColor: colors.surface, borderRadius: radius.md }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={[typography.body, { color: colors.text, fontSize: 14, fontWeight: '700' }, font(t('prompts.inputLabel'), '700')]}>{t('prompts.inputLabel')}</Text>
            <Text style={[typography.caption, { color: colors.textMuted, fontSize: 12 }]}>{text.length}/{MAX_CUSTOM_PROMPT_LENGTH}</Text>
          </View>
          <Text style={[typography.caption, { color: colors.textMuted, fontSize: 12, lineHeight: 18 }, font(t('prompts.inputHint'))]}>{t('prompts.inputHint', { max: MAX_CUSTOM_PROMPT_LENGTH })}</Text>
          <TextInput ref={input} autoFocus accessibilityLabel={t('prompts.inputLabel')} placeholder={t('prompts.placeholder')} placeholderTextColor={colors.textFaint} value={text} onChangeText={value => { setText(value); setMessage(null); }} maxLength={MAX_CUSTOM_PROMPT_LENGTH} returnKeyType="done" onSubmitEditing={add} style={[typography.body, styles.input, { fontSize: 14, backgroundColor: colors.background, color: colors.text, borderColor: error ? colors.danger : colors.accent, borderRadius: radius.md }, font(text)]} />
          {error && <Text accessibilityRole="alert" style={[typography.caption, { color: colors.danger }, font(t(`prompts.${message}`))]}>{t(`prompts.${message}`, { max: MAX_CUSTOM_PROMPT_LENGTH })}</Text>}
          <View style={styles.formActions}>
            <Pressable accessibilityRole="button" onPress={close} style={styles.formButton}><Text style={[typography.button, { color: colors.textMuted, fontSize: 15 }, font(t('prompts.cancel'), '700')]}>{t('prompts.cancel')}</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={add} style={[styles.formButton, { backgroundColor: colors.accent, borderRadius: radius.md }]}><Text style={[typography.button, { color: colors.accentText, fontSize: 15 }, font(t('prompts.add'), '700')]}>{t('prompts.add')}</Text></Pressable>
          </View>
        </View>
      )}
      </PopupSheet>
      {saveFailed && <Text accessibilityRole="alert" style={[typography.caption, { color: colors.danger }, font(t('prompts.saveFailed'))]}>{t('prompts.saveFailed')}</Text>}
    </View>
  );
}
const styles = StyleSheet.create({
  container: { gap: 8 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexGrow: 1, flexDirection: 'row', alignItems: 'center', borderWidth: 1.5 },
  option: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, minHeight: 44 },
  checkbox: { width: 19, height: 19, borderWidth: 1.5, borderRadius: 5, alignItems: 'center', justifyContent: 'center' },
  remove: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  addButton: { borderWidth: 1.5, padding: 14, alignItems: 'center', minHeight: 48 },
  form: { gap: 10 },
  input: { borderWidth: 1, minHeight: 46, paddingHorizontal: 12, paddingVertical: 10 },
  formActions: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 10 },
  formButton: { paddingVertical: 12, paddingHorizontal: 18, minHeight: 44, justifyContent: 'center' },
});
