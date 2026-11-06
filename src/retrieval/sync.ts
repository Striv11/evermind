import type { Archive } from '../archive/schema';
import type { UnlockedVault } from '../vault/vault';
import type { VaultStorage } from '../vault/storage';
import type { Embedder, EmbedProgress } from './embed';
import { loadIndexSnapshot, saveIndexSnapshot } from './persist';
import { SemanticIndex } from './search';

export interface SyncResult {
  index: SemanticIndex;
  /** Chunk vectors taken from the stored snapshot. */
  reused: number;
  /** Chunk vectors computed now. */
  embedded: number;
}

/**
 * Bring the semantic index up to date with the archive: load the encrypted snapshot,
 * embed only chunks whose text changed, and store the new snapshot if anything changed.
 * A failure to persist never loses the in-memory index (it is derived data).
 */
export async function syncIndex(
  vault: UnlockedVault<Archive>,
  storage: VaultStorage,
  embedder: Embedder,
  onProgress?: EmbedProgress,
): Promise<SyncResult> {
  const cache = await loadIndexSnapshot(vault, storage);
  const index = await SemanticIndex.build(vault.data.memories, embedder, { cache, onProgress });
  const embedded = index.size - index.reused;
  const cacheSize = cache?.entries.length ?? 0;
  if (embedded > 0 || cacheSize !== index.size) {
    await saveIndexSnapshot(vault, storage, index.snapshot()).catch(() => undefined);
  }
  return { index, reused: index.reused, embedded };
}
