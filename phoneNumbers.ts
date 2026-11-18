export const PHONE_COUNTRIES = [
  { code: 'IN', name: 'India', dialCode: '91', digits: 10 },
  { code: 'US', name: 'United States / Canada', dialCode: '1', digits: 10 },
  { code: 'GB', name: 'United Kingdom', dialCode: '44', digits: 10 },
  { code: 'AE', name: 'United Arab Emirates', dialCode: '971', digits: 9 },
  { code: 'SG', name: 'Singapore', dialCode: '65', digits: 8 },
  { code: 'AU', name: 'Australia', dialCode: '61', digits: 9 },
] as const;
export type PhoneCountryCode = typeof PHONE_COUNTRIES[number]['code'];
export function phoneCountry(code: PhoneCountryCode) { return PHONE_COUNTRIES.find(country => country.code === code)!; }
export function nationalPhone(value: string, code: PhoneCountryCode): string {
  const country = phoneCountry(code);
  let digits = value.replace(/\D/g, '');
  if (value.trim().startsWith('+') && !digits.startsWith(country.dialCode)) return '';
  if ((value.trim().startsWith('+') || digits.length === country.digits + country.dialCode.length) && digits.startsWith(country.dialCode)) digits = digits.slice(country.dialCode.length);
  if ((code === 'GB' || code === 'AU' || code === 'AE') && digits.startsWith('0')) digits = digits.slice(1);
  return digits.slice(0, country.digits);
}
export function validPhone(value: string, code: PhoneCountryCode, registering = false): boolean {
  return new RegExp(`^\\d{${phoneCountry(code).digits}}$`).test(value) && (!registering || code !== 'IN' || /^[6-9]/.test(value));
}
