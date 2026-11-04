import type { EpisodicMemory } from '../archive/schema';
import { chunkAll, type Chunk, type ChunkOptions } from './chunk';
import type { Embedder, EmbedProgress } from './embed';
import { createIndex, type VectorIndex } from './vector';

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
    opts: ChunkOptions & { onProgress?: EmbedProgress } = {},
  ): Promise<SemanticIndex> {
    const chunks = chunkAll(memories, opts);
    const vectors = await embedder.embed(
      chunks.map((c) => c.text),
      opts.onProgress,
    );
    const index = createIndex(chunks.length);
    chunks.forEach((c, i) => index.add(c.id, vectors[i]!));
    return new SemanticIndex(embedder, index, new Map(chunks.map((c) => [c.id, c])));
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
