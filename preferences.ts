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
