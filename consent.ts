import { File, Paths } from 'expo-file-system';
import { POLICY_VERSION } from './legalDocuments';

// Consent (ConsentScreen) is a per-policy-version, per-account gate
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

interface ConsentRecord { distributorId: string; version: string; acceptedAt: string; }

function readConsentRecords(): ConsentRecord[] {
  const file = getConsentFile();
  if (!file.exists) return [];
  try {
    const parsed = JSON.parse(file.textSync());
    // Legacy ID-only acknowledgements cannot authorize the new AI disclosure.
    return Array.isArray(parsed) ? parsed.filter((entry): entry is ConsentRecord =>
      entry !== null && typeof entry === 'object' &&
      typeof entry.distributorId === 'string' && typeof entry.version === 'string' &&
      typeof entry.acceptedAt === 'string' && Number.isFinite(Date.parse(entry.acceptedAt))) : [];
  } catch {
    return [];
  }
}

export function hasConsented(distributorId: string): boolean {
  return readConsentRecords().some(record => record.distributorId === distributorId && record.version === POLICY_VERSION);
}

export function markConsented(distributorId: string): void {
  if (!distributorId.trim()) throw new Error('Cannot record consent without an account');
  const records = readConsentRecords().filter(record => record.distributorId !== distributorId);
  records.push({ distributorId, version: POLICY_VERSION, acceptedAt: new Date().toISOString() });
  const file = getConsentFile();
  if (!file.exists) file.create();
  file.write(JSON.stringify(records));
}
