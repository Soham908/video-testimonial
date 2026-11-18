import { Directory, File, Paths } from 'expo-file-system';

let owner: string | null = null;
let generation = 0;
let controller = new AbortController();
const tasks = new Map<string, Set<Promise<unknown>>>();
export interface AccountScope { owner: string; generation: number; signal: AbortSignal; }
export function activateAccount(id: string | null): void {
  if (id !== null && !/^[a-zA-Z0-9_-]{1,80}$/.test(id)) throw new Error('Invalid local account scope');
  const previous = controller;
  owner = id;
  generation++;
  controller = new AbortController();
  previous.abort();
}
export function currentAccount(): string | null { return owner; }
export function accountGeneration(): {owner: string | null; generation: number} { return {owner, generation}; }
export function accountGenerationIsCurrent(value: {owner: string | null; generation: number}): boolean {
  return owner === value.owner && generation === value.generation;
}
export function accountScope(): AccountScope {
  if (!owner) throw new Error('No active local account');
  return { owner, generation, signal: controller.signal };
}
export function scopeIsCurrent(scope: AccountScope): boolean {
  return owner === scope.owner && generation === scope.generation;
}
export function accountDirectory(id = accountScope().owner): Directory {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) throw new Error('Invalid local account scope');
  return new Directory(Paths.document, 'accounts', id);
}
export function accountFile(name: string): File {
  const dir = accountDirectory();
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return new File(dir, name);
}
export function ownsRecording(uri: string, id = accountScope().owner): boolean {
  const prefix = new Directory(accountDirectory(id), 'recordings').uri.replace(/\/$/, '') + '/';
  if (!uri.startsWith(prefix)) return false;
  // Only our flat MP4 filenames are valid. Reject traversal (including encoded
  // traversal), sibling folders, query strings and arbitrary file references.
  return /^[a-zA-Z0-9_-][a-zA-Z0-9._-]*\.mp4$/.test(uri.slice(prefix.length));
}
export function trackAccountTask<T>(id: string, task: Promise<T>): Promise<T> {
  const pending = tasks.get(id) ?? new Set();
  tasks.set(id, pending);
  pending.add(task);
  void task.finally(() => { pending.delete(task); if (!pending.size) tasks.delete(id); }).catch(() => {});
  return task;
}
export async function settleAccountTasks(id: string): Promise<void> {
  // A generation change prevents any new transfer starting for this account.
  while (tasks.get(id)?.size) await Promise.allSettled([...tasks.get(id)!]);
}
export async function removeAccountDirectory(id: string): Promise<void> {
  await settleAccountTasks(id);
  const dir = accountDirectory(id);
  if (dir.exists) dir.delete();
  // Legacy root recordings have no verifiable owner. Preserve them, never
  // assign them to the next login or erase them as somebody else's data.
}
