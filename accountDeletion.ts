import { File, Paths } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import { apiDeleteWithToken, apiGetWithToken, ApiError, captureAuthSession, authSessionIsCurrent, type AuthSession } from './api';
import { authenticateDeletionOwner, logoutIfSession, storedAuthToken } from './auth';
import { activateAccount, currentAccount, accountGeneration, accountGenerationIsCurrent, removeAccountDirectory } from './accountStorage';
import type { PhoneCountryCode } from './phoneNumbers';

interface Intent { owner: string; accepted: boolean; id?: string; clientId?: string; }
interface Receipt { deletion: { status: string; requested_at: string; distributor_id: string; client_id: string }; }
export interface CleanupResult { owner: string; localSession: ReturnType<typeof accountGeneration> | null; authSession: AuthSession | null; }
export class DeletionRecoveryError extends Error {
  constructor(public owner: string, public needsSignIn = false, message = 'Could not verify the deletion request. Your recordings have been preserved.') { super(message); }
}
const intentFile = () => new File(Paths.document, 'account-deletion-pending.json');
const transfers = new Set<string>();
const clearing = new Set<string>();
const recoveries = new Map<string, Promise<'none' | 'accepted'>>();
const cleanups = new Map<string, Promise<CleanupResult>>();
let sequence = 0;
const validOwner = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value);
function readIntents(): Intent[] {
  const file = intentFile();
  if (!file.exists) return [];
  const value = JSON.parse(file.textSync());
  const entries = value?.version === 2 ? value.entries : [value];
  if (!Array.isArray(entries) || entries.length > 32 || entries.some(entry => !validOwner(entry?.owner) || typeof entry.accepted !== 'boolean' || (entry.id !== undefined && !/^[a-zA-Z0-9_-]{1,100}$/.test(entry.id)) || (entry.clientId !== undefined && !validOwner(entry.clientId))) || new Set(entries.map(entry => entry.owner)).size !== entries.length)
    throw new Error('Account deletion recovery needs attention. Your local files have been preserved.');
  return entries;
}
function writeIntents(entries: Intent[]): void {
  if (!entries.length) { const file = intentFile(); if (file.exists) file.delete(); return; }
  const temp = new File(Paths.document, 'account-deletion-pending.tmp');
  if (!temp.exists) temp.create();
  temp.write(JSON.stringify({ version: 2, entries }));
  temp.moveSync(intentFile(), { overwrite: true });
}
function idOf(intent: Intent): string { return intent.id ?? 'legacy'; }
function tokenKey(intent: Intent): string { return `account_deletion_${intent.owner}_${idOf(intent)}`; }
function saveIntent(intent: Intent): Intent {
  const all = readIntents(), existing = all.find(entry => entry.owner === intent.owner);
  if (existing?.clientId && intent.clientId && existing.clientId !== intent.clientId) throw new DeletionRecoveryError(intent.owner);
  // Acceptance is monotonic, including an older request settling after a retry.
  const next = existing ? { ...existing, accepted: existing.accepted || intent.accepted, clientId: existing.clientId ?? intent.clientId } : intent;
  if (!existing && all.length >= 32) throw new Error('Account recovery needs attention. Existing records were preserved.');
  writeIntents([...all.filter(entry => entry.owner !== intent.owner), next]);
  return next;
}
async function clearIntent(intent: Intent): Promise<void> {
  const all = readIntents(), existing = all.find(entry => entry.owner === intent.owner);
  if (!existing || idOf(existing) !== idOf(intent) || (existing.accepted && !intent.accepted)) return;
  clearing.add(intent.owner);
  try {
    await SecureStore.deleteItemAsync(tokenKey(intent));
    const latest = readIntents(), current = latest.find(entry => entry.owner === intent.owner);
    if (current && idOf(current) === idOf(intent) && (!current.accepted || intent.accepted)) writeIntents(latest.filter(entry => entry.owner !== intent.owner));
  } finally { clearing.delete(intent.owner); }
}
export function pendingAccountDeletion(owner?: string): Intent | null {
  const all = readIntents();
  if (owner !== undefined) return all.find(entry => entry.owner === owner) ?? null;
  return all.find(entry => entry.accepted) ?? all.find(entry => entry.owner === currentAccount()) ?? all[0] ?? null;
}
export function noteAcceptedAccountDeletion(owner: string): void {
  if (!validOwner(owner)) throw new Error('Invalid account recovery owner');
  saveIntent({ owner, accepted: true, id: `${Date.now().toString(36)}_${++sequence}` });
}
export async function rememberAccountDeletion(owner: string, token: string | null): Promise<void> {
  if (!validOwner(owner)) throw new Error('Invalid account recovery owner');
  const intent = saveIntent({ owner, accepted: false, id: `${Date.now().toString(36)}_${++sequence}` });
  if (token) await SecureStore.setItemAsync(tokenKey(intent), token);
}
function receiptMatches(value: Receipt, intent: Intent): boolean {
  const r = value?.deletion;
  return !!r && r.distributor_id === intent.owner && validOwner(r.client_id) && (!intent.clientId || r.client_id === intent.clientId) && ['pending', 'completed', 'needs_attention'].includes(r.status) && typeof r.requested_at === 'string' && Number.isFinite(Date.parse(r.requested_at));
}
async function verifyOwner(token: string, owner: string): Promise<string> {
  const value = await apiGetWithToken<{auth: {distributor_id: string; client_id: string}}>('/me', token);
  if (value.auth?.distributor_id !== owner || !validOwner(value.auth?.client_id)) throw new DeletionRecoveryError(owner, true, 'Sign in to the account whose deletion is being checked. No account or recordings were changed.');
  return value.auth.client_id;
}
export async function requestAccountDeletion(password: string): Promise<void> {
  const owner = currentAccount();
  if (!owner) throw new Error('No signed-in account');
  if (transfers.has(owner) || clearing.has(owner) || recoveries.has(owner)) throw new Error('This deletion request is already being checked.');
  const scope = accountGeneration(), session = captureAuthSession();
  let intent = pendingAccountDeletion(owner) ?? saveIntent({ owner, accepted: false, id: `${Date.now().toString(36)}_${++sequence}_${Math.random().toString(36).slice(2)}` });
  if (intent.accepted) return;
  transfers.add(owner);
  try {
    if (!session.token) throw new DeletionRecoveryError(owner, true);
    const clientId = await verifyOwner(session.token, owner);
    intent = saveIntent({ ...intent, clientId });
    // Separate SecureStore proof survives ordinary logout/token expiry. Never
    // place the JWT or password in the filesystem journal or another account.
    await SecureStore.setItemAsync(tokenKey(intent), session.token);
    if (!accountGenerationIsCurrent(scope) || !authSessionIsCurrent(session)) throw new DeletionRecoveryError(owner);
    const receipt = await apiDeleteWithToken<Receipt>('/distributors/me', { password, confirmation: 'DELETE' }, session.token);
    if (!receiptMatches(receipt, intent)) throw new DeletionRecoveryError(owner);
    saveIntent({ ...intent, accepted: true });
  } catch (error) {
    if (error instanceof ApiError && [400, 401, 404, 429].includes(error.status) && !['token_expired', 'invalid_token', 'missing_token', 'account_deleted'].includes(error.code)) await clearIntent(intent);
    throw error;
  } finally { transfers.delete(owner); }
}
function removePersonalEntries(owner: string): void {
  const consent = new File(Paths.document, 'consent-state.json');
  if (consent.exists) {
    const records = JSON.parse(consent.textSync());
    if (!Array.isArray(records)) throw new Error('Could not safely clean consent records');
    consent.write(JSON.stringify(records.filter(record => typeof record === 'string' ? record !== owner : record?.distributorId !== owner)));
  }
  const prompts = new File(Paths.document, 'question-prompts.json');
  if (prompts.exists) {
    const data = JSON.parse(prompts.textSync());
    if (data.version !== 1 || !data.entries || typeof data.entries !== 'object') throw new Error('Could not safely clean prompt records');
    data.entries = Object.fromEntries(Object.entries(data.entries).filter(([key]) => JSON.parse(key)[0] !== owner));
    prompts.write(JSON.stringify(data));
  }
}
export async function finishLocalAccountDeletion(owner?: string): Promise<CleanupResult> {
  const intent = pendingAccountDeletion(owner);
  if (!intent?.accepted) throw new Error('Deletion has not been confirmed by the server');
  const running = cleanups.get(intent.owner);
  if (running) return running;
  const operation = (async (): Promise<CleanupResult> => {
    const proof = await SecureStore.getItemAsync(tokenKey(intent));
    let localSession: CleanupResult['localSession'] = null;
    let authSession: AuthSession | null = null;
    if (currentAccount() === intent.owner) {
      activateAccount(null);
      localSession = accountGeneration();
      const current = captureAuthSession();
      // Another login may have committed a token before activating its UI.
      if (proof && current.token === proof) authSession = await logoutIfSession(current);
    }
    await removeAccountDirectory(intent.owner);
    removePersonalEntries(intent.owner);
    await clearIntent(intent);
    return { owner: intent.owner, localSession, authSession };
  })();
  cleanups.set(intent.owner, operation);
  try { return await operation; }
  finally { if (cleanups.get(intent.owner) === operation) cleanups.delete(intent.owner); }
}
async function recoverIntent(owner?: string, recoveryToken?: string): Promise<'none' | 'accepted'> {
  let intent = pendingAccountDeletion(owner);
  if (!intent) return 'none';
  if (!intent.accepted) {
    if (transfers.has(intent.owner)) throw new DeletionRecoveryError(intent.owner);
    // A legacy intent has no dedicated proof. Its current stored token may be
    // tried only against the owner-bound receipt endpoint, never as global auth.
    const token = recoveryToken ?? await SecureStore.getItemAsync(tokenKey(intent)) ?? await storedAuthToken();
    if (!token) throw new DeletionRecoveryError(intent.owner, true);
    try {
      const receipt = await apiGetWithToken<Receipt>('/distributors/me/deletion', token);
      if (!receiptMatches(receipt, intent)) throw new DeletionRecoveryError(intent.owner, true);
      intent = saveIntent({ ...intent, accepted: true, clientId: receipt.deletion.client_id });
    } catch (error) {
      if (error instanceof ApiError && error.status === 404 && error.code === 'deletion_not_requested') {
        try { await verifyOwner(token, intent.owner); }
        catch { throw new DeletionRecoveryError(intent.owner, true); }
        // A held original response can still accept later. Keep that journal.
        if (transfers.has(intent.owner)) throw new DeletionRecoveryError(intent.owner, false, 'The earlier request is still being checked. Your recordings have been preserved.');
        // A 404 is only a snapshot: a request sent before an app restart or
        // transport timeout may still be accepted later. Resume this verified
        // owner, but retain its proof/journal for that later receipt.
        return 'none';
      }
      if (error instanceof ApiError && ['token_expired', 'invalid_token', 'missing_token'].includes(error.code)) throw new DeletionRecoveryError(intent.owner, true);
      throw error;
    }
  }
  await finishLocalAccountDeletion(intent.owner);
  return 'accepted';
}
export async function reauthenticateAccountDeletion(owner: string, phone: string, password: string, country: PhoneCountryCode) {
  const credentials = await authenticateDeletionOwner(owner, phone, password, country);
  const intent = pendingAccountDeletion(owner);
  if (!intent) throw new DeletionRecoveryError(owner);
  await SecureStore.setItemAsync(tokenKey(intent), credentials.token);
  const result = await recoverAccountDeletion(owner, credentials.token);
  return { result, credentials };
}

export async function recoverAccountDeletion(owner?: string, recoveryToken?: string): Promise<'none' | 'accepted'> {
  const intent = pendingAccountDeletion(owner);
  if (!intent) return 'none';
  const running = recoveries.get(intent.owner);
  if (running) return running;
  const operation = recoverIntent(intent.owner, recoveryToken);
  recoveries.set(intent.owner, operation);
  try { return await operation; }
  finally { if (recoveries.get(intent.owner) === operation) recoveries.delete(intent.owner); }
}
