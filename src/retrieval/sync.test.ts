import { describe, expect, it } from 'vitest';
import { demoArchive } from '../demo/persona';
import { MemoryStorage } from '../vault/storage';
import { createVault } from '../vault/vault';
import { HashingEmbedder } from './embed';
import { syncIndex } from './sync';

describe('syncIndex', () => {
  it('embeds everything the first time, then reuses the stored snapshot', async () => {
    const archive = demoArchive();
    archive.memories = archive.memories.slice(0, 6);
    const storage = new MemoryStorage();
    const { vault } = await createVault('pw', archive, 1000);
    const emb = new HashingEmbedder();

    const first = await syncIndex(vault, storage, emb);
    expect(first.reused).toBe(0);
    expect(first.embedded).toBe(first.index.size);
    expect(await storage.loadRecord('vector-index')).not.toBeNull();

    const second = await syncIndex(vault, storage, emb);
    expect(second.embedded).toBe(0);
    expect(second.reused).toBe(second.index.size);
  });

  it('re-embeds only a changed memory and persists the update', async () => {
    const archive = demoArchive();
    archive.memories = archive.memories.slice(0, 5);
    const storage = new MemoryStorage();
    const { vault } = await createVault('pw', archive, 1000);
    const emb = new HashingEmbedder();
    const first = await syncIndex(vault, storage, emb);

    vault.data.memories[0] = {
      ...vault.data.memories[0]!,
      text: 'A brand new story about a red kite over the harbour.',
    };
    const next = await syncIndex(vault, storage, emb);
    expect(next.embedded).toBeGreaterThan(0);
    expect(next.embedded).toBeLessThan(first.index.size);
    const third = await syncIndex(vault, storage, emb);
    expect(third.embedded).toBe(0);
  });

  it('removing a memory shrinks the stored index without embedding', async () => {
    const archive = demoArchive();
    archive.memories = archive.memories.slice(0, 5);
    const storage = new MemoryStorage();
    const { vault } = await createVault('pw', archive, 1000);
    const emb = new HashingEmbedder();
    const first = await syncIndex(vault, storage, emb);
    vault.data.memories.pop();
    const next = await syncIndex(vault, storage, emb);
    expect(next.embedded).toBe(0);
    expect(next.index.size).toBeLessThan(first.index.size);
    expect((await syncIndex(vault, storage, emb)).index.size).toBe(next.index.size);
  });
});
