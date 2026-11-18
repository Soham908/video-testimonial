import { forwardRef, useId, useState } from 'react';
import { InputAccessoryView, Keyboard, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { useStrings } from '../../i18n/useStrings';
import { PHONE_COUNTRIES, nationalPhone, phoneCountry, validPhone, type PhoneCountryCode } from '../../phoneNumbers';
import { PopupSheet } from './Modal';

interface Props {
  label: string; value: string; country: PhoneCountryCode;
  onChangeText: (value: string) => void; onCountryChange: (code: PhoneCountryCode) => void;
  disabled?: boolean; registering?: boolean; onNext: () => void;
}
export const PhoneNumberField = forwardRef<TextInput, Props>(function PhoneNumberField({ label, value, country, onChangeText, onCountryChange, disabled, registering = false, onNext }, ref) {
  const { colors, radius, typography } = useTheme();
  const { t } = useStrings();
  const [picker, setPicker] = useState(false), [touched, setTouched] = useState(false), [focused, setFocused] = useState(false);
  const accessory = useId();
  const selected = phoneCountry(country);
  const error = touched && value.length > 0 && !validPhone(value, country, registering);
  return <View style={{ marginBottom: 16 }}>
    <Text style={{ ...typography.label, color: colors.textFaint, marginBottom: 6 }}>{label}</Text>
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={t('phone.countryButton', { country: selected.name, prefix: '+' + selected.dialCode })} disabled={disabled} onPress={() => { Keyboard.dismiss(); setPicker(true); }} style={{ minHeight: 50, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface }}>
        <Text style={{ ...typography.body, fontSize: 13, color: colors.textMuted }}>{country}</Text><Text style={{ ...typography.body, fontSize: 15, color: colors.text, fontWeight: '600' }}>+{selected.dialCode}</Text><Text style={{ color: colors.textMuted }}>⌄</Text>
      </Pressable>
      <TextInput ref={ref} accessibilityLabel={label} value={value} onChangeText={text => onChangeText(nationalPhone(text, country))} inputAccessoryViewID={Platform.OS === 'ios' ? accessory : undefined} keyboardType="phone-pad" autoComplete="tel-national" textContentType="telephoneNumber" maxLength={selected.digits + selected.dialCode.length + 6} editable={!disabled} returnKeyType="next" submitBehavior="submit" onSubmitEditing={onNext} onFocus={() => setFocused(true)} onBlur={() => { setTouched(true); setFocused(false); }} style={{ ...typography.body, flex: 1, minHeight: 50, paddingHorizontal: 14, color: colors.text, borderWidth: 1.5, borderColor: error ? colors.danger : focused ? colors.accent : colors.border, borderRadius: radius.md, backgroundColor: focused ? colors.accentSoft : colors.surface }} />
    </View>
    {error && <Text accessibilityRole="alert" style={{ fontSize: 12, lineHeight: 18, marginTop: 6, color: colors.danger }}>{t(registering && country === 'IN' && value.length === 10 ? 'phone.indiaMobile' : 'phone.lengthError', { digits: selected.digits })}</Text>}
    {Platform.OS === 'ios' && <InputAccessoryView nativeID={accessory}><View style={{ backgroundColor: colors.surface, alignItems: 'flex-end', paddingHorizontal: 16 }}><Pressable accessibilityRole="button" onPress={onNext} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ fontSize: 15, fontWeight: '700', color: colors.accent }}>{t('authForm.nextField')}</Text></Pressable></View></InputAccessoryView>}
    <PopupSheet visible={picker} onDismiss={() => setPicker(false)} groupAccessibility={false}>
      <Text accessibilityRole="header" style={{ ...typography.title, fontSize: 19, color: colors.text, marginBottom: 12 }}>{t('phone.chooseCountry')}</Text>
      {PHONE_COUNTRIES.map(option => <Pressable key={option.code} accessibilityRole="radio" accessibilityState={{ selected: country === option.code }} onPress={() => { onCountryChange(option.code); onChangeText(''); setTouched(false); setPicker(false); }} style={{ minHeight: 48, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}><Text style={{ ...typography.body, fontSize: 14, color: colors.text, flex: 1 }}>{option.name}</Text><Text style={{ color: colors.accent, fontWeight: '600' }}>+{option.dialCode} {country === option.code ? '✓' : ''}</Text></Pressable>)}
    </PopupSheet>
  </View>;
});
