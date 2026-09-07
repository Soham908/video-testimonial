import * as SecureStore from 'expo-secure-store';

// Same persistence mechanism ThemeContext/auth.ts already use for
// palette/font/JWT - no new dependency for a standing on/off preference
// that must survive across launches (this is a person's setting, not
// per-session/per-question state - session.ts intentionally doesn't cover
// it).
const READ_QUESTION_ALOUD_KEY = 'pref_read_question_aloud';

export async function getReadQuestionAloudPref(): Promise<boolean> {
  const stored = await SecureStore.getItemAsync(READ_QUESTION_ALOUD_KEY);
  // Default on - unset (fresh install, or a value written before this
  // preference existed) is not the same as an explicit "off".
  return stored === null ? true : stored === 'true';
}

export function setReadQuestionAloudPref(value: boolean): void {
  SecureStore.setItemAsync(READ_QUESTION_ALOUD_KEY, value ? 'true' : 'false').catch(() => {});
}

// Local-only language override (API_CONTRACT.md's GET /distributors/me/
// questions ?language=en|hi|mr) - the backend has no write-back for
// language_pref yet, so this only ever affects this device's own calls,
// never the distributor's stored record. Explicit codes only ('en'/'hi'/
// 'mr') - anything else (unset, or a value written before this preference
// existed) is treated as "no override," which is meaningfully different
// from defaulting to 'en': omitting the query param lets the backend fall
// through to the distributor's own stored language_pref instead of every
// distributor silently getting English regardless of their real
// preference (see questions.ts's fetchQuestions).
export type LanguageCode = 'en' | 'hi' | 'mr';
const LANGUAGE_KEY = 'pref_language';

export async function getLanguagePref(): Promise<LanguageCode | null> {
  const stored = await SecureStore.getItemAsync(LANGUAGE_KEY);
  return stored === 'en' || stored === 'hi' || stored === 'mr' ? stored : null;
}

export function setLanguagePref(value: LanguageCode): void {
  SecureStore.setItemAsync(LANGUAGE_KEY, value).catch(() => {});
}
