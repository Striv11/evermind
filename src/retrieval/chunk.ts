import type { EpisodicMemory } from '../archive/schema';

export interface Chunk {
  /** `${memoryId}#${n}` */
  id: string;
  memoryId: string;
  text: string;
  date: string;
  people: string[];
  /** Position of this chunk within its memory. */
  index: number;
}

export interface ChunkOptions {
  /** Target maximum words per chunk. */
  maxWords?: number;
  /** Words repeated from the end of the previous chunk. */
  overlapWords?: number;
}

const words = (s: string) => s.split(/\s+/).filter(Boolean);

/** Sentences, keeping terminal punctuation; falls back to the whole text. */
function sentences(text: string): string[] {
  const parts = text.match(/[^.!?\n]+(?:[.!?]+["')\]]*|\n+|$)/g);
  return (parts ?? [text]).map((s) => s.trim()).filter(Boolean);
}

/**
 * Split a memory into overlapping chunks on sentence boundaries. A sentence longer than
 * `maxWords` is cut by words. Every chunk carries the memory's date and people so a hit
 * can be filtered or cited without loading the memory.
 */
export function chunkMemory(m: EpisodicMemory, opts: ChunkOptions = {}): Chunk[] {
  const maxWords = Math.max(4, opts.maxWords ?? 80);
  const overlap = Math.min(Math.max(0, opts.overlapWords ?? 15), Math.floor(maxWords / 2));
  const units: string[][] = [];
  for (const s of sentences(m.text)) {
    const w = words(s);
    for (let i = 0; i < w.length; i += maxWords) units.push(w.slice(i, i + maxWords));
  }
  const out: string[][] = [];
  let cur: string[] = [];
  let fresh = 0; // words in `cur` not carried over from the previous chunk
  for (const u of units) {
    if (cur.length + u.length > maxWords && fresh > 0) {
      out.push(cur);
      cur = overlap ? cur.slice(-overlap) : [];
      fresh = 0;
      // the carried tail plus a long unit may still exceed the cap; drop overlap then
      if (cur.length + u.length > maxWords) cur = [];
    }
    cur = cur.concat(u);
    fresh += u.length;
  }
  if (fresh > 0) out.push(cur);
  return out.map((w, index) => ({
    id: `${m.id}#${index}`,
    memoryId: m.id,
    text: w.join(' '),
    date: m.date,
    people: m.people ?? [],
    index,
  }));
}

export const chunkAll = (memories: EpisodicMemory[], opts?: ChunkOptions): Chunk[] =>
  memories.flatMap((m) => chunkMemory(m, opts));
