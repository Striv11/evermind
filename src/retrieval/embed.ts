import { normalize } from './vector';

export type EmbedProgress = (pct: number, detail?: string) => void;

/** Turns texts into unit vectors. Implementations: hashing (instant, no model) and the neural worker. */
export interface Embedder {
  readonly name: string;
  readonly dim: number;
  embed(texts: string[], onProgress?: EmbedProgress): Promise<Float32Array[]>;
}

const STOP = new Set(
  'a an and are as at be but by did do does for from had has have how i in is it its me my of on or so that the their them then there they this to was we were what when where which who why will with you your'.split(
    ' ',
  ),
);

function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** Light stemming so "lighthouses"/"lighthouse" and "walked"/"walk" share a bucket. */
const stem = (w: string) => w.replace(/(ing|ed|es|s)$/, (m, _s, off) => (off >= 3 ? '' : m));

/**
 * Feature-hashed bag of words and bigrams. Deterministic, dependency-free and instant: used in
 * tests, the benchmark, and as the fallback when the neural model cannot be downloaded.
 */
export class HashingEmbedder implements Embedder {
  readonly name = 'hashing-v1';
  constructor(readonly dim = 512) {}

  embed(texts: string[], onProgress?: EmbedProgress): Promise<Float32Array[]> {
    const out = texts.map((t) => this.one(t));
    onProgress?.(100);
    return Promise.resolve(out);
  }

  private one(text: string): Float32Array {
    const toks = (text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [])
      .filter((w) => !STOP.has(w) && w.length > 1)
      .map(stem);
    const v = new Float32Array(this.dim);
    const bump = (feature: string, w: number) => {
      const h = fnv(feature);
      v[h % this.dim]! += (h & 0x80000000 ? -1 : 1) * w;
    };
    toks.forEach((t, i) => {
      bump(t, 1);
      if (i > 0) bump(`${toks[i - 1]} ${t}`, 0.5);
    });
    return normalize(v);
  }
}
