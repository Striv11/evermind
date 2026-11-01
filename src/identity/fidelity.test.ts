import { describe, expect, it } from 'vitest';
import { emptyArchive } from '../archive/schema';
import { validateArchive } from '../archive/validate';
import { ingestAudio } from '../insight/pipeline';
import { classifyDimension, fidelity, rate } from './fidelity';

const base = ingestAudio(emptyArchive('Asha'), {
  fileName: 's',
  recordedAt: '2026-10-31',
  chunks: [
    {
      text: 'My grandmother raised me in Pune and taught me that kindness is never wasted, and my mother agreed.',
      start: 0,
      end: 5,
    },
  ],
}).archive;
const now = new Date('2026-11-01T10:00:00Z');

describe('classifyDimension', () => {
  it('uses wording cues, then themes of cited memories, then a default', () => {
    expect(classifyDimension('Should I quit my job?', [], base)).toBe('decisions');
    expect(classifyDimension('Tell me a joke', [], base)).toBe('humor');
    const id = base.memories[0]!.id;
    const fam = { memories: [{ ...base.memories[0]!, themes: ['family', 'love'] }] };
    expect(classifyDimension('Tell me more', [id], fam)).toBe('people');
    expect(classifyDimension('Hmm', [], base)).toBe('opinions');
  });
});

describe('rate', () => {
  it('stores a "me" verdict without touching memories', () => {
    const r = rate(base, { question: 'Favorite food?', reply: 'Dal.', verdict: 'me', now });
    expect(r.memory).toBeUndefined();
    expect(r.archive.memories).toHaveLength(base.memories.length);
    expect(r.archive.fidelity).toHaveLength(1);
    expect(r.rating.dimension).toBe('tastes');
  });

  it('turns a correction into a tagged typed memory that validates', () => {
    const r = rate(base, {
      question: 'Should I quit my job?',
      reply: 'Yes, go for it.',
      verdict: 'not-me',
      correction: '  I would never quit without six months of savings. Safety first.  ',
      now,
    });
    expect(r.memory?.tags).toEqual(['correction']);
    expect(r.memory?.text).toBe('I would never quit without six months of savings. Safety first.');
    expect(r.archive.memories).toHaveLength(base.memories.length + 1);
    expect(r.archive.sources.at(-1)?.kind).toBe('typed');
    expect(validateArchive(r.archive).ok).toBe(true);
  });

  it('ignores a correction on a "me" verdict and drops unknown citations', () => {
    const r = rate(base, {
      question: 'x',
      reply: 'y',
      verdict: 'me',
      correction: 'should be ignored',
      citations: ['nope', base.memories[0]!.id],
      now,
    });
    expect(r.rating.correction).toBeUndefined();
    expect(r.rating.citations).toEqual([base.memories[0]!.id]);
    expect(r.archive.memories).toHaveLength(base.memories.length);
  });
});

describe('fidelity', () => {
  it('is null until rated, then the share of "me" per dimension', () => {
    expect(fidelity(base).overall).toBeNull();
    let a = base;
    for (const [q, v] of [
      ['Should I move abroad?', 'me'],
      ['Should I buy a house?', 'not-me'],
      ['Should I switch teams?', 'me'],
      ['Tell me a joke', 'not-me'],
    ] as const)
      a = rate(a, { question: q, reply: '…', verdict: v, now }).archive;
    const f = fidelity(a);
    expect(f.total).toBe(4);
    expect(f.overall).toBe(0.5);
    expect(f.dimensions.find((d) => d.id === 'decisions')).toMatchObject({ rated: 3, score: 0.67 });
    expect(f.dimensions.find((d) => d.id === 'humor')).toMatchObject({ rated: 1, score: 0 });
    expect(f.dimensions.find((d) => d.id === 'values')?.score).toBeNull();
  });
});

describe('archive validation of fidelity', () => {
  it('accepts valid ratings and rejects malformed or duplicate ones', () => {
    const a = rate(base, { question: 'q', reply: 'r', verdict: 'me', now }).archive;
    expect(validateArchive(a).ok).toBe(true);
    const r0 = a.fidelity![0]!;
    const bad = validateArchive({ ...a, fidelity: [r0, { ...r0 }] });
    expect(bad.ok).toBe(false);
    const bad2 = validateArchive({ ...a, fidelity: [{ ...r0, verdict: 'maybe' }] });
    expect(bad2.ok).toBe(false);
    expect(validateArchive({ ...a, fidelity: 'x' }).ok).toBe(false);
  });
});
