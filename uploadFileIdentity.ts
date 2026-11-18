import { File, FileMode } from 'expo-file-system';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { accountScope, ownsRecording, scopeIsCurrent, trackAccountTask } from './accountStorage';
import { MAX_SOURCE_BYTES } from './uploadProtocol';
import { t } from './i18n/useStrings';

export interface UploadFileIdentity { sizeBytes: number; sha256: string; md5: string }
export const HASH_CHUNK_BYTES = 256 * 1024;

// Fast native guard against accidental local substitution between awaits.
// MD5 is not the cryptographic commitment or evidence of server acceptance.
export function readLocalUploadGuard(filePath: string): { sizeBytes: number; md5: string } {
  if (!ownsRecording(filePath)) throw new Error(t('uploadApproval.wrongAccount'));
  const file = new File(filePath);
  if (!file.exists) throw new Error(t('uploadApproval.missingFile'));
  const sizeBytes = file.size, md5 = file.md5;
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_SOURCE_BYTES || !md5) throw new Error(t('uploadApproval.verifyFailed'));
  return { sizeBytes, md5 };
}

// File.slice() currently reads the whole source inside Expo. Read the handle
// instead: at most one bounded source chunk is visible to JavaScript at a time.
export async function readUploadFileIdentity(filePath: string, signal?: AbortSignal): Promise<UploadFileIdentity> {
  const scope = accountScope();
  const ensureCurrent = () => {
    if (signal?.aborted || scope.signal.aborted || !scopeIsCurrent(scope)) throw new Error(t('uploadApproval.accountChanged'));
  };
  async function read() {
    ensureCurrent();
    if (!ownsRecording(filePath, scope.owner)) throw new Error(t('uploadApproval.wrongAccount'));
    const file = new File(filePath);
    if (!file.exists) throw new Error(t('uploadApproval.missingFile'));
    const { sizeBytes, md5 } = readLocalUploadGuard(filePath);
    const hash = sha256.create();
    const handle = file.open(FileMode.ReadOnly);
    try {
      let readBytes = 0;
      if (handle.size !== sizeBytes) throw new Error(t('uploadApproval.fileChanged'));
      while (readBytes < sizeBytes) {
        ensureCurrent();
        const bytes = handle.readBytes(Math.min(HASH_CHUNK_BYTES, sizeBytes - readBytes));
        if (!bytes.length || bytes.length > HASH_CHUNK_BYTES || readBytes + bytes.length > sizeBytes) throw new Error(t('uploadApproval.fileChanged'));
        hash.update(bytes);
        readBytes += bytes.length;
        // A yield permits account changes and keeps the preparing screen usable.
        await new Promise<void>(resolve => setTimeout(resolve, 0));
      }
      ensureCurrent();
      if (handle.size !== sizeBytes || file.size !== sizeBytes || file.md5 !== md5) throw new Error(t('uploadApproval.fileChanged'));
      return { sizeBytes, md5, sha256: bytesToHex(hash.digest()) };
    } finally { try { handle.close(); } finally { hash.destroy(); } }
  }
  return trackAccountTask(scope.owner, read());
}
