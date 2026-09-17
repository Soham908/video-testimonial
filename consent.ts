import { File, Paths } from 'expo-file-system';

// Consent (ConsentScreen) is meant to be a one-time-per-account gate
// (HeyGen-style, CLAUDE.md), not a per-login one - a distributor who
// already agreed shouldn't see the same legal gate (and the Onboarding
// intro that leads into it) again just for logging back in. Real tester
// feedback: logging out and back in showed the whole sequence again.
//
// There's no backend field for this yet (distributorProfile.ts has no
// consent column) - this is tracked locally, keyed by distributorId,
// mirroring session.ts's own file-based JSON persistence. That makes this
// a device-level record, not an account-level one: a reinstall or signing
// in on a different device will show consent again for the same
// distributor, until the backend grows a real consented_at field to make
// this authoritative server-side instead.
const CONSENT_FILE_NAME = 'consent-state.json';

function getConsentFile(): File {
  return new File(Paths.document, CONSENT_FILE_NAME);
}

function readConsentedIds(): string[] {
  const file = getConsentFile();
  if (!file.exists) return [];
  try {
    const parsed = JSON.parse(file.textSync());
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function hasConsented(distributorId: string): boolean {
  return readConsentedIds().includes(distributorId);
}

export function markConsented(distributorId: string): void {
  const ids = readConsentedIds();
  if (ids.includes(distributorId)) return;
  ids.push(distributorId);
  const file = getConsentFile();
  if (!file.exists) file.create();
  file.write(JSON.stringify(ids));
}
