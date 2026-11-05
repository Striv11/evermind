import type { UnlockedVault, SealedRecord } from '../vault/vault';
import type { VaultStorage } from '../vault/storage';
import type { IndexSnapshot } from './search';

export const INDEX_RECORD = 'vector-index';

/** Encrypt the snapshot under the vault key and store it next to the envelope. */
export async function saveIndexSnapshot(
  vault: UnlockedVault<unknown>,
  storage: VaultStorage,
  snapshot: IndexSnapshot,
): Promise<void> {
  await storage.storeRecord(await vault.sealRecord(INDEX_RECORD, snapshot));
}

/**
 * Load the stored snapshot, or null if there is none or it cannot be trusted.
 * The index is derived data, so a corrupt record just means "re-embed", never a failure.
 */
export async function loadIndexSnapshot(
  vault: UnlockedVault<unknown>,
  storage: VaultStorage,
): Promise<IndexSnapshot | null> {
  const rec: SealedRecord | null = await storage.loadRecord(INDEX_RECORD);
  if (!rec) return null;
  try {
    const snap = await vault.openRecord<IndexSnapshot>(rec);
    return snap?.format === 'evermind-index' && snap.version === 1 ? snap : null;
  } catch {
    return null;
  }
}
