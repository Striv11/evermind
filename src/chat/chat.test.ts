import { describe, expect, it } from 'vitest';
import { demoArchive } from '../demo/persona';
import { HashingEmbedder } from '../retrieval/embed';
import { DEMO_EVAL } from '../retrieval/evalset';
import { SemanticIndex } from '../retrieval/search';
import { ABSTAIN_TEXT, groundedAnswer } from './grounded';

/** Questions the demo persona's memories cannot answer. */
const OUT_OF_SCOPE = [
  'What is your favourite programming language?',
  'How do you feel about cryptocurrency?',
  'Who won the football world cup?',
  'What is the capital of Mongolia?',
  'Describe your experience at university studying physics.',
  'What car do you drive?',
  'Do you like skiing in the Alps?',
  'Tell me about your job at the bank.',
];

const setup = async () => {
  const archive = demoArchive();
  const index = await SemanticIndex.build(archive.memories, new HashingEmbedder());
  return { archive, index };
};

describe('grounded chat', () => {
  it('answers in-scope questions with the right citation and abstains out of scope', async () => {
    const { archive, index } = await setup();
    let cited = 0;
    for (const { q, memoryId } of DEMO_EVAL) {
      const r = await groundedAnswer(archive, index, q);
      if (!r.abstained && r.citations.some((c) => c.memoryId === memoryId)) cited++;
    }
    let abstained = 0;
    for (const q of OUT_OF_SCOPE)
      if ((await groundedAnswer(archive, index, q)).abstained) abstained++;
    if (process.env.BENCH)
      console.log(
        `grounded ${cited}/${DEMO_EVAL.length}, abstained ${abstained}/${OUT_OF_SCOPE.length}`,
      );
    expect(cited / DEMO_EVAL.length).toBeGreaterThanOrEqual(0.65);
    expect(abstained).toBe(OUT_OF_SCOPE.length);
  });

  it('quotes memory text, cites known ids and labels the reply', async () => {
    const { archive, index } = await setup();
    const r = await groundedAnswer(archive, index, 'Who gave you the brass key?');
    expect(r.aiLabel).toBe('AI reconstruction');
    expect(r.abstained).toBe(false);
    const ids = new Set(archive.memories.map((m) => m.id));
    for (const c of r.citations) {
      expect(ids.has(c.memoryId)).toBe(true);
      expect(r.text).toContain(archive.memories.find((m) => m.id === c.memoryId)!.text);
    }
  });

  it('is deterministic and labels abstentions too', async () => {
    const { archive, index } = await setup();
    const a = await groundedAnswer(archive, index, 'What is the capital of Mongolia?');
    const b = await groundedAnswer(archive, index, 'What is the capital of Mongolia?');
    expect(a).toEqual(b);
    expect(a.text).toBe(ABSTAIN_TEXT);
    expect(a.aiLabel).toBe('AI reconstruction');
    expect(a.citations).toEqual([]);
  });

  it('abstains on empty input and respects the threshold', async () => {
    const { archive, index } = await setup();
    expect((await groundedAnswer(archive, index, '   ')).abstained).toBe(true);
    expect(
      (await groundedAnswer(archive, index, 'Who gave you the brass key?', { threshold: 1.01 }))
        .abstained,
    ).toBe(true);
  });

  it('refuses off-limits topics and never quotes off-limits memories', async () => {
    const { archive, index } = await setup();
    archive.legacy = { access: 'owner', listeners: [], offLimits: ['wedding'], messages: [] };
    const refused = await groundedAnswer(archive, index, 'What do you regret about the wedding?');
    expect(refused.abstained).toBe(true);
    expect(refused.citations).toEqual([]);
    const r = await groundedAnswer(archive, index, 'Why did you choose duty over family?');
    for (const c of r.citations) {
      expect(archive.memories.find((m) => m.id === c.memoryId)!.text.toLowerCase()).not.toContain(
        'wedding',
      );
    }
  });
});
