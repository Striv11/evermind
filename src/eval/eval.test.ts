import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLD } from '../chat/grounded';
import { demoArchive } from '../demo/persona';
import { HashingEmbedder } from '../retrieval/embed';
import { SemanticIndex } from '../retrieval/search';
import { IN_SCOPE, OUT_OF_SCOPE } from './questions';
import { renderReport, runEval } from './run';

const DOC = new URL('../../docs/EVALS.md', import.meta.url);

const report = async () => {
  const archive = demoArchive();
  const embedder = new HashingEmbedder();
  const index = await SemanticIndex.build(archive.memories, embedder);
  return { r: await runEval(archive, index), embedder };
};

describe('eval set', () => {
  it('has at least 60 questions with valid memory ids and no duplicates', () => {
    expect(IN_SCOPE.length + OUT_OF_SCOPE.length).toBeGreaterThanOrEqual(60);
    const ids = new Set(demoArchive().memories.map((m) => m.id));
    for (const { memoryId } of IN_SCOPE) expect(ids.has(memoryId)).toBe(true);
    const all = [...IN_SCOPE.map((x) => x.q), ...OUT_OF_SCOPE];
    expect(new Set(all).size).toBe(all.length);
  });

  it('meets the quality floor', async () => {
    const { r } = await report();
    expect(r.recallAt[5]).toBeGreaterThanOrEqual(0.9);
    expect(r.recallAt[1]).toBeGreaterThanOrEqual(0.6);
    expect(r.groundingRate).toBeGreaterThanOrEqual(0.55);
    expect(r.wrongAnswerRate).toBeLessThanOrEqual(0.1);
    expect(r.abstentionPrecision).toBeGreaterThanOrEqual(0.6);
    expect(r.abstentionRecall).toBeGreaterThanOrEqual(0.9);
  });

  it('docs/EVALS.md matches the current results', async () => {
    const { r, embedder } = await report();
    const text = renderReport(r, embedder.name, DEFAULT_THRESHOLD);
    if (process.env.EVALS_WRITE) writeFileSync(DOC, text);
    expect(readFileSync(DOC, 'utf8')).toBe(text);
  });
});
