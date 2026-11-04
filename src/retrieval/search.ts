import type { EpisodicMemory } from '../archive/schema';
import { chunkAll, type Chunk, type ChunkOptions } from './chunk';
import type { Embedder, EmbedProgress } from './embed';
import { createIndex, type VectorIndex } from './vector';
import { b64 } from '../vault/vault';

/** Serializable form of an index. Derived data: safe to drop, must only be stored encrypted. */
export interface IndexSnapshot {
  format: 'evermind-index';
  version: 1;
  embedder: string;
  dim: number;
  entries: { chunk: Chunk; vector: string }[];
}

export interface BuildOptions extends ChunkOptions {
  onProgress?: EmbedProgress;
  /** A previous snapshot: chunks whose text is unchanged reuse their vectors instead of re-embedding. */
  cache?: IndexSnapshot | null;
}

const toB64 = (v: Float32Array) => b64.encode(new Uint8Array(v.buffer, v.byteOffset, v.byteLength));
const fromB64 = (s: string) => {
  const bytes = b64.decode(s);
  return new Float32Array(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
};

export interface MemoryHit {
  memoryId: string;
  chunk: Chunk;
  score: number;
}

/** Chunks + embeddings + index, searched by meaning. Hits are de-duplicated per memory. */
export class SemanticIndex {
  private constructor(
    private readonly embedder: Embedder,
    private readonly index: VectorIndex,
    private readonly chunks: Map<string, Chunk>,
  ) {}

  static async build(
    memories: EpisodicMemory[],
    embedder: Embedder,
    opts: BuildOptions = {},
  ): Promise<SemanticIndex> {
    const chunks = chunkAll(memories, opts);
    const reusable = new Map<string, Float32Array>();
    const cache = opts.cache;
    if (
      cache &&
      cache.format === 'evermind-index' &&
      cache.embedder === embedder.name &&
      cache.dim === embedder.dim
    ) {
      for (const e of cache.entries) reusable.set(e.chunk.text, fromB64(e.vector));
    }
    const vectors: Float32Array[] = new Array(chunks.length);
    const todo: number[] = [];
    chunks.forEach((c, i) => {
      const hit = reusable.get(c.text);
      if (hit) vectors[i] = hit;
      else todo.push(i);
    });
    if (todo.length) {
      const fresh = await embedder.embed(
        todo.map((i) => chunks[i]!.text),
        opts.onProgress,
      );
      todo.forEach((i, j) => (vectors[i] = fresh[j]!));
    } else opts.onProgress?.(100);
    const index = createIndex(chunks.length);
    chunks.forEach((c, i) => index.add(c.id, vectors[i]!));
    const built = new SemanticIndex(embedder, index, new Map(chunks.map((c) => [c.id, c])));
    built.vectors = new Map(chunks.map((c, i) => [c.id, vectors[i]!]));
    built.reused = chunks.length - todo.length;
    return built;
  }

  /** Vectors by chunk id, kept for snapshots. */
  private vectors = new Map<string, Float32Array>();
  /** How many chunk vectors this build took from the cache. */
  reused = 0;

  snapshot(): IndexSnapshot {
    return {
      format: 'evermind-index',
      version: 1,
      embedder: this.embedder.name,
      dim: this.embedder.dim,
      entries: [...this.chunks.values()].map((chunk) => ({
        chunk,
        vector: toB64(this.vectors.get(chunk.id)!),
      })),
    };
  }

  get size() {
    return this.index.size;
  }

  async search(query: string, k = 5): Promise<MemoryHit[]> {
    const [q] = await this.embedder.embed([query]);
    const seen = new Set<string>();
    const hits: MemoryHit[] = [];
    for (const r of this.index.search(q!, k * 3)) {
      const chunk = this.chunks.get(r.id)!;
      if (seen.has(chunk.memoryId)) continue;
      seen.add(chunk.memoryId);
      hits.push({ memoryId: chunk.memoryId, chunk, score: r.score });
      if (hits.length === k) break;
    }
    return hits;
  }
}
