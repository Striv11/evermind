import { describe, expect, it } from 'vitest';
import { HashingEmbedder } from '../retrieval/embed';
import { createIndex, FlatIndex } from '../retrieval/vector';
import { createVault, unlockVault, DEFAULT_ITERATIONS } from '../vault/vault';
import { demoArchive } from '../demo/persona';

/** Budgets from PLAN.md day 12; the limits are the real ones, with no CI fudge factor. */
const BUDGET = { unlockMs: 1500, searchMs: 50, chunks: 10_000 };
/** Building 10k vectors takes ~30 s, so the full-size check is opt-in: `npm run bench:budgets`. */
const FULL = !!process.env.BENCH;
const CHUNKS = FULL ? BUDGET.chunks : 1500;

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

describe('performance budgets', () => {
  it(`vault unlock stays under ${BUDGET.unlockMs} ms at the default KDF cost`, async () => {
    const { envelope } = await createVault('correct horse', demoArchive(), DEFAULT_ITERATIONS);
    const times: number[] = [];
    for (let i = 0; i < 3; i++) {
      const t = performance.now();
      await unlockVault(JSON.parse(JSON.stringify(envelope)), 'correct horse');
      times.push(performance.now() - t);
    }
    expect(median(times)).toBeLessThan(BUDGET.unlockMs);
  });

  it(`search over ${CHUNKS} chunks stays under ${BUDGET.searchMs} ms`, async () => {
    const emb = new HashingEmbedder();
    // Seeded pseudo-random text over a 400-word vocabulary, so scores are not dominated by ties.
    let seed = 42;
    const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
    const word = () => `w${Math.floor(rnd() * 400)}x`;
    const texts = Array.from({ length: CHUNKS }, () => Array.from({ length: 12 }, word).join(' '));
    const vecs = await emb.embed(texts);
    const index = createIndex(CHUNKS);
    const flat = new FlatIndex();
    const built = performance.now();
    vecs.forEach((v, i) => index.add(`c${i}`, v));
    const buildMs = performance.now() - built;
    vecs.forEach((v, i) => flat.add(`c${i}`, v));
    const [q] = await emb.embed([texts[1234]!.split(' ').slice(0, 8).join(' ')]);
    index.search(q!, 15); // warm-up
    const times: number[] = [];
    for (let i = 0; i < 9; i++) {
      const t = performance.now();
      index.search(q!, 15);
      times.push(performance.now() - t);
    }
    console.log(
      `search ${index.constructor.name} @${CHUNKS}: median ${median(times).toFixed(1)} ms, build ${buildMs.toFixed(0)} ms`,
    );
    expect(median(times)).toBeLessThan(BUDGET.searchMs);
    // The approximate index must still find (most of) what exact search finds.
    const total = (rs: { score: number }[]) => rs.reduce((x, r) => x + r.score, 0);
    expect(total(index.search(q!, 10)) / total(flat.search(q!, 10))).toBeGreaterThan(0.95);
  }, 120_000);
});
