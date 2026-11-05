import { describe, expect, it } from 'vitest';
import type { EpisodicMemory } from '../archive/schema';
import { demoArchive } from '../demo/persona';
import { chunkMemory } from './chunk';
import { HashingEmbedder } from './embed';
import { DEMO_EVAL } from './evalset';
import { SemanticIndex } from './search';
import { loadIndexSnapshot, saveIndexSnapshot } from './persist';
import { createVault } from '../vault/vault';
import { MemoryStorage } from '../vault/storage';
import { FlatIndex, HnswIndex, normalize } from './vector';

const mem = (text: string, extra: Partial<EpisodicMemory> = {}): EpisodicMemory => ({
  id: 'x',
  date: '2001-02-03',
  text,
  sourceId: 's',
  ...extra,
});

describe('chunker', () => {
  it('keeps short memories whole, with metadata', () => {
    const [c, ...rest] = chunkMemory(mem('A short one.', { people: ['p1'] }));
    expect(rest).toHaveLength(0);
    expect(c).toMatchObject({
      id: 'x#0',
      memoryId: 'x',
      date: '2001-02-03',
      people: ['p1'],
      index: 0,
    });
  });

  it('splits long text on sentences, respects the cap and overlaps', () => {
    const text = Array.from(
      { length: 12 },
      (_, i) => `Sentence number ${i} has exactly seven words.`,
    ).join(' ');
    const chunks = chunkMemory(mem(text), { maxWords: 20, overlapWords: 8 });
    expect(chunks.length).toBeGreaterThan(2);
    for (const c of chunks) expect(c.text.split(' ').length).toBeLessThanOrEqual(20);
    for (let i = 1; i < chunks.length; i++) {
      const tail = chunks[i - 1]!.text.split(' ').slice(-8).join(' ');
      expect(chunks[i]!.text.startsWith(tail)).toBe(true);
    }
    // every sentence appears in at least one chunk
    for (let i = 0; i < 12; i++)
      expect(chunks.some((c) => c.text.includes(`number ${i} `))).toBe(true);
  });

  it('cuts a single huge sentence by words and handles empty text', () => {
    const chunks = chunkMemory(mem('word '.repeat(100).trim()), { maxWords: 30, overlapWords: 0 });
    expect(chunks.map((c) => c.text.split(' ').length)).toEqual([30, 30, 30, 10]);
    expect(chunkMemory(mem('   '))).toEqual([]);
  });
});

function randomVectors(n: number, dim: number, seed: number) {
  let s = seed;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296) * 2 - 1;
  // clustered data is closer to real embeddings than uniform noise; centres are fixed so
  // queries and data share clusters
  let c = 1;
  const crnd = () => ((c = (Math.imul(c, 1664525) + 1013904223) >>> 0) / 4294967296) * 2 - 1;
  const centers = Array.from({ length: 20 }, () => Float32Array.from({ length: dim }, crnd));
  return Array.from({ length: n }, (_, i) =>
    normalize(Float32Array.from(centers[i % 20]!, (x) => x + 0.5 * rnd())),
  );
}

describe('vector indexes', () => {
  it('flat index returns exact cosine ranking and rejects bad dimensions', () => {
    const idx = new FlatIndex();
    idx.add('a', Float32Array.of(1, 0));
    idx.add('b', Float32Array.of(0, 2));
    idx.add('c', Float32Array.of(1, 1));
    expect(idx.search(Float32Array.of(0.9, 0.1), 3).map((r) => r.id)).toEqual(['a', 'c', 'b']);
    expect(() => idx.add('d', Float32Array.of(1, 0, 0))).toThrow(/dimensions/);
    expect(new FlatIndex().search(Float32Array.of(1), 3)).toEqual([]);
  });

  it('HNSW agrees with exact search (recall@10 >= 0.9) and is deterministic', () => {
    const vecs = randomVectors(1500, 32, 7);
    const flat = new FlatIndex();
    const a = new HnswIndex();
    const b = new HnswIndex();
    vecs.forEach((v, i) => {
      flat.add(`v${i}`, v);
      a.add(`v${i}`, v);
      b.add(`v${i}`, v);
    });
    const queries = randomVectors(40, 32, 99);
    let hit = 0;
    for (const q of queries) {
      const truth = new Set(flat.search(q, 10).map((r) => r.id));
      const got = a.search(q, 10).map((r) => r.id);
      hit += got.filter((id) => truth.has(id)).length;
      expect(got).toEqual(b.search(q, 10).map((r) => r.id));
    }
    expect(hit / (queries.length * 10)).toBeGreaterThanOrEqual(0.9);
  });
});

describe('semantic search over the demo persona', () => {
  it('reaches recall@5 of 1 and recall@1 >= 0.7 with the hashing embedder', async () => {
    const memories = demoArchive().memories;
    const idx = await SemanticIndex.build(memories, new HashingEmbedder());
    let at1 = 0;
    let at5 = 0;
    for (const { q, memoryId } of DEMO_EVAL) {
      const hits = await idx.search(q, 5);
      if (hits[0]?.memoryId === memoryId) at1++;
      if (hits.some((h) => h.memoryId === memoryId)) at5++;
    }
    const n = DEMO_EVAL.length;
    if (process.env.BENCH)
      console.log(`recall@1 ${(at1 / n).toFixed(2)}  recall@5 ${(at5 / n).toFixed(2)}  (n=${n})`);
    expect(at5 / n).toBe(1);
    expect(at1 / n).toBeGreaterThanOrEqual(0.7);
  });

  it('de-duplicates hits per memory', async () => {
    const long = mem('Lighthouse keeper. '.repeat(60), { id: 'long' });
    const idx = await SemanticIndex.build([long], new HashingEmbedder(), { maxWords: 20 });
    expect(idx.size).toBeGreaterThan(1);
    expect(await idx.search('lighthouse', 5)).toHaveLength(1);
  });

  it('snapshots round-trip and reuse vectors for unchanged chunks', async () => {
    const emb = new HashingEmbedder();
    const mems = demoArchive().memories.slice(0, 6);
    const first = await SemanticIndex.build(mems, emb);
    expect(first.reused).toBe(0);
    const snap = JSON.parse(JSON.stringify(first.snapshot()));

    const again = await SemanticIndex.build(mems, emb, { cache: snap });
    expect(again.reused).toBe(again.size);
    expect((await again.search('lighthouse', 3)).map((h) => h.memoryId)).toEqual(
      (await first.search('lighthouse', 3)).map((h) => h.memoryId),
    );

    const edited = [
      { ...mems[0]!, text: 'A brand new memory about bees and honey.' },
      ...mems.slice(1),
    ];
    const partial = await SemanticIndex.build(edited, emb, { cache: snap });
    expect(partial.reused).toBeGreaterThan(0);
    expect(partial.reused).toBeLessThan(partial.size);
  });

  it('ignores a snapshot from a different embedder', async () => {
    const mems = demoArchive().memories.slice(0, 3);
    const snap = (await SemanticIndex.build(mems, new HashingEmbedder(256))).snapshot();
    const idx = await SemanticIndex.build(mems, new HashingEmbedder(512), { cache: snap });
    expect(idx.reused).toBe(0);
  });

  it('persists the index encrypted in the vault and reuses it after reload', async () => {
    const emb = new HashingEmbedder();
    const mems = demoArchive().memories.slice(0, 6);
    const storage = new MemoryStorage();
    const { vault } = await createVault('pw', {}, 1000);
    expect(await loadIndexSnapshot(vault, storage)).toBeNull();

    const built = await SemanticIndex.build(mems, emb);
    await saveIndexSnapshot(vault, storage, built.snapshot());
    const stored = JSON.stringify(await storage.loadRecord('vector-index'));
    expect(stored).not.toContain(mems[0]!.text.slice(0, 20));

    const cache = await loadIndexSnapshot(vault, storage);
    const again = await SemanticIndex.build(mems, emb, { cache });
    expect(again.reused).toBe(again.size);
  });

  it('treats a corrupt stored index as absent so it is simply rebuilt', async () => {
    const storage = new MemoryStorage();
    const { vault } = await createVault('pw', {}, 1000);
    const snap = (
      await SemanticIndex.build(demoArchive().memories.slice(0, 2), new HashingEmbedder())
    ).snapshot();
    await saveIndexSnapshot(vault, storage, snap);
    const rec = (await storage.loadRecord('vector-index'))!;
    await storage.storeRecord({
      ...rec,
      ciphertext: rec.ciphertext.replace(/^./, (c) => (c === 'A' ? 'B' : 'A')),
    });
    expect(await loadIndexSnapshot(vault, storage)).toBeNull();
  });
});
