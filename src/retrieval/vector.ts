/** One interface over exact and approximate nearest-neighbour search. Vectors are unit length. */
export interface VectorIndex {
  readonly size: number;
  add(id: string, vector: Float32Array): void;
  /** Highest cosine similarity first. */
  search(query: Float32Array, k: number): { id: string; score: number }[];
}

export function normalize(v: Float32Array): Float32Array {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i]! / n;
  return out;
}

export function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!;
  return s;
}

function checkDim(expected: number | null, v: Float32Array) {
  if (expected !== null && v.length !== expected)
    throw new Error(`vector has ${v.length} dimensions, index expects ${expected}`);
}

/** Exact search by scanning everything. Best below a few thousand vectors. */
export class FlatIndex implements VectorIndex {
  private ids: string[] = [];
  private vecs: Float32Array[] = [];
  private dim: number | null = null;

  get size() {
    return this.ids.length;
  }

  add(id: string, vector: Float32Array) {
    checkDim(this.dim, vector);
    this.dim = vector.length;
    this.ids.push(id);
    this.vecs.push(normalize(vector));
  }

  search(query: Float32Array, k: number) {
    if (!this.size || k <= 0) return [];
    checkDim(this.dim, query);
    const q = normalize(query);
    return this.vecs
      .map((v, i) => ({ id: this.ids[i]!, score: dot(q, v) }))
      .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1))
      .slice(0, k);
  }
}

/** Seeded PRNG so graph construction is reproducible. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface HnswOptions {
  /** Max links per node on upper layers (layer 0 allows 2*m). */
  m?: number;
  efConstruction?: number;
  efSearch?: number;
  seed?: number;
}

/** Hierarchical Navigable Small World graph (Malkov & Yashunin), cosine similarity. */
export class HnswIndex implements VectorIndex {
  private ids: string[] = [];
  private vecs: Float32Array[] = [];
  /** links[node][layer] = neighbour node numbers */
  private links: number[][][] = [];
  private entry = -1;
  private top = -1;
  private dim: number | null = null;
  private readonly m: number;
  private readonly efC: number;
  private readonly efS: number;
  private readonly rand: () => number;

  constructor(opts: HnswOptions = {}) {
    this.m = opts.m ?? 16;
    this.efC = opts.efConstruction ?? 100;
    this.efS = opts.efSearch ?? 64;
    this.rand = mulberry32(opts.seed ?? 42);
  }

  get size() {
    return this.ids.length;
  }

  private sim(a: number, q: Float32Array) {
    return dot(this.vecs[a]!, q);
  }

  /** Best-first search within one layer; returns candidates sorted best first. */
  private searchLayer(q: Float32Array, entries: number[], ef: number, layer: number) {
    const seen = new Set(entries);
    const cand = entries.map((n) => ({ n, s: this.sim(n, q) }));
    const best = [...cand];
    const byBest = (a: { s: number }, b: { s: number }) => b.s - a.s;
    cand.sort(byBest);
    best.sort(byBest);
    while (cand.length) {
      const c = cand.shift()!;
      const worst = best[best.length - 1]!;
      if (best.length >= ef && c.s < worst.s) break;
      for (const nb of this.links[c.n]![layer] ?? []) {
        if (seen.has(nb)) continue;
        seen.add(nb);
        const s = this.sim(nb, q);
        if (best.length < ef || s > best[best.length - 1]!.s) {
          const item = { n: nb, s };
          insertSorted(cand, item);
          insertSorted(best, item);
          if (best.length > ef) best.pop();
        }
      }
    }
    return best;
  }

  add(id: string, vector: Float32Array) {
    checkDim(this.dim, vector);
    this.dim = vector.length;
    const v = normalize(vector);
    const node = this.ids.length;
    const level = Math.floor(-Math.log(1 - this.rand()) / Math.log(this.m));
    this.ids.push(id);
    this.vecs.push(v);
    this.links.push(Array.from({ length: level + 1 }, () => []));
    if (this.entry < 0) {
      this.entry = node;
      this.top = level;
      return;
    }
    let eps = [this.entry];
    for (let l = this.top; l > level; l--) eps = [this.searchLayer(v, eps, 1, l)[0]!.n];
    for (let l = Math.min(level, this.top); l >= 0; l--) {
      const found = this.searchLayer(v, eps, this.efC, l);
      const cap = l === 0 ? this.m * 2 : this.m;
      const chosen = found.slice(0, this.m).map((f) => f.n);
      this.links[node]![l] = chosen;
      for (const nb of chosen) {
        const list = this.links[nb]![l]!;
        list.push(node);
        if (list.length > cap) {
          const nv = this.vecs[nb]!;
          list.sort((a, b) => dot(nv, this.vecs[b]!) - dot(nv, this.vecs[a]!));
          list.length = cap;
        }
      }
      eps = found.map((f) => f.n);
    }
    if (level > this.top) {
      this.top = level;
      this.entry = node;
    }
  }

  search(query: Float32Array, k: number) {
    if (this.entry < 0 || k <= 0) return [];
    checkDim(this.dim, query);
    const q = normalize(query);
    let eps = [this.entry];
    for (let l = this.top; l > 0; l--) eps = [this.searchLayer(q, eps, 1, l)[0]!.n];
    return this.searchLayer(q, eps, Math.max(this.efS, k), 0)
      .slice(0, k)
      .map((r) => ({ id: this.ids[r.n]!, score: r.s }));
  }
}

function insertSorted(arr: { s: number }[], item: { s: number }) {
  let i = arr.length;
  while (i > 0 && arr[i - 1]!.s < item.s) i--;
  arr.splice(i, 0, item);
}

/** Exact below the threshold, HNSW above it. */
export function createIndex(expectedSize: number, threshold = 2000): VectorIndex {
  return expectedSize > threshold ? new HnswIndex() : new FlatIndex();
}
