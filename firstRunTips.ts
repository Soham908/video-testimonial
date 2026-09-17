import { File, Paths } from 'expo-file-system';

// Lightweight "has this device already seen this contextual tip" flag,
// keyed by an arbitrary string id per call site - same file-based JSON
// pattern as consent.ts/session.ts. Deliberately device-level, not
// account-level (same reasoning as consent.ts): these are one-time UI
// pointers, not anything that needs to follow the distributor's account.
const TIPS_FILE_NAME = 'first-run-tips-seen.json';

function getTipsFile(): File {
  return new File(Paths.document, TIPS_FILE_NAME);
}

function readSeenTipIds(): string[] {
  const file = getTipsFile();
  if (!file.exists) return [];
  try {
    const parsed = JSON.parse(file.textSync());
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function hasSeenTip(tipId: string): boolean {
  return readSeenTipIds().includes(tipId);
}

export function markTipSeen(tipId: string): void {
  const ids = readSeenTipIds();
  if (ids.includes(tipId)) return;
  ids.push(tipId);
  const file = getTipsFile();
  if (!file.exists) file.create();
  file.write(JSON.stringify(ids));
}
