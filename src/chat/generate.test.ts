import { describe, expect, it } from 'vitest';
import { demoArchive } from '../demo/persona';
import { HashingEmbedder } from '../retrieval/embed';
import { DEMO_EVAL } from '../retrieval/evalset';
import { SemanticIndex } from '../retrieval/search';
import { computeStyleProfile } from '../style/profile';
import {
  buildMessages,
  detectWebGpu,
  generateAnswer,
  loadWebLlmEngine,
  PERSONA_REFUSAL,
  type LlmEngine,
} from './generate';
import { ABSTAIN_TEXT } from './grounded';

const setup = async () => {
  const archive = demoArchive();
  return { archive, index: await SemanticIndex.build(archive.memories, new HashingEmbedder()) };
};
const fake = (parts: string[] | Error): LlmEngine => ({
  async *stream() {
    if (parts instanceof Error) throw parts;
    for (const p of parts) yield p;
  },
});
// First in-scope question whose retrieval answers (not abstains).
const pick = async (archive: ReturnType<typeof demoArchive>, index: SemanticIndex) => {
  for (const e of DEMO_EVAL) {
    const r = await generateAnswer(archive, index, e.q, { engine: fake(['x']) });
    if (!r.abstained) return { q: e.q, id: r.citations[0]!.memoryId };
  }
  throw new Error('no answerable question');
};

describe('generated answers', () => {
  it('streams model text, keeps retrieved citations and the AI label', async () => {
    const { archive, index } = await setup();
    const { q, id } = await pick(archive, index);
    const seen: string[] = [];
    const r = await generateAnswer(archive, index, q, {
      engine: fake(['I remember ', `it well [m:${id}].`]),
      onToken: (t) => seen.push(t),
    });
    expect(r.source).toBe('llm');
    expect(r.text).toBe(`I remember it well [m:${id}].`);
    expect(seen).toHaveLength(2);
    expect(r.citations.map((c) => c.memoryId)).toContain(id);
    expect(r.aiLabel).toBe('AI reconstruction');
  });

  it('strips invented citation ids and falls back when nothing valid is cited', async () => {
    const { archive, index } = await setup();
    const { q, id } = await pick(archive, index);
    const mixed = await generateAnswer(archive, index, q, {
      engine: fake([`Yes [m:${id}] and [m:fake99].`]),
    });
    expect(mixed.source).toBe('llm');
    expect(mixed.text).not.toContain('fake99');
    const none = await generateAnswer(archive, index, q, { engine: fake(['Sure [m:fake99].']) });
    expect(none.source).toBe('retrieval');
  });

  it('falls back to retrieval when the engine throws or is empty', async () => {
    const { archive, index } = await setup();
    const { q } = await pick(archive, index);
    for (const engine of [fake(new Error('gpu lost')), fake([])]) {
      const r = await generateAnswer(archive, index, q, { engine });
      expect(r.source).toBe('retrieval');
      expect(r.abstained).toBe(false);
      expect(r.citations.length).toBeGreaterThan(0);
    }
  });

  it('rejects output that claims to be human', async () => {
    const { archive, index } = await setup();
    const { q, id } = await pick(archive, index);
    const r = await generateAnswer(archive, index, q, {
      engine: fake([`I am the real person [m:${id}].`]),
    });
    expect(r.source).toBe('retrieval');
  });

  it('refuses persona claims without calling the model', async () => {
    const { archive, index } = await setup();
    let called = false;
    const engine: LlmEngine = {
      async *stream() {
        called = true;
        yield 'x';
      },
    };
    const r = await generateAnswer(archive, index, 'Are you really alive?', { engine });
    expect(r.text).toBe(PERSONA_REFUSAL);
    expect(called).toBe(false);
  });

  it('abstains without calling the model when retrieval finds nothing', async () => {
    const { archive, index } = await setup();
    let called = false;
    const engine: LlmEngine = {
      async *stream() {
        called = true;
        yield 'x';
      },
    };
    const r = await generateAnswer(archive, index, 'What is the capital of Mongolia?', { engine });
    expect(r.text).toBe(ABSTAIN_TEXT);
    expect(called).toBe(false);
  });

  it('puts style, memories and citation rules in the prompt', async () => {
    const { archive } = await setup();
    const style = computeStyleProfile(archive.voiceSamples ?? []);
    const [sys] = buildMessages('hi', [{ id: 'm1', date: '2020-01-01', text: 'Bees.' }], style);
    expect(sys!.content).toContain('[m:m1] (2020-01-01) Bees.');
    expect(sys!.content).toContain('AI reconstruction');
    expect(sys!.content).toContain('Cite each memory');
  });

  it('detects WebGPU and degrades to null engine', async () => {
    expect(await detectWebGpu({})).toBe(false);
    expect(await detectWebGpu({ gpu: { requestAdapter: async () => null } })).toBe(false);
    expect(
      await detectWebGpu({
        gpu: {
          requestAdapter: async () => {
            throw new Error('x');
          },
        },
      }),
    ).toBe(false);
    const ok = { gpu: { requestAdapter: async () => ({}) } };
    expect(await detectWebGpu(ok)).toBe(true);
    expect(await loadWebLlmEngine('m', () => {}, {})).toBeNull();
    expect(
      await loadWebLlmEngine(
        'm',
        () => {},
        ok,
        async () => {
          throw new Error('not installed');
        },
      ),
    ).toBeNull();
  });

  it('adapts a WebLLM-shaped module and reports progress', async () => {
    const progress: number[] = [];
    const engine = await loadWebLlmEngine(
      'm',
      (f) => progress.push(f),
      { gpu: { requestAdapter: async () => ({}) } },
      async () => ({
        CreateMLCEngine: async (
          _m: string,
          cfg: { initProgressCallback(p: { progress: number; text: string }): void },
        ) => {
          cfg.initProgressCallback({ progress: 0.5, text: 'dl' });
          return {
            chat: {
              completions: {
                create: async () =>
                  (async function* () {
                    yield { choices: [{ delta: { content: 'a' } }] };
                    yield { choices: [{ delta: {} }] };
                    yield { choices: [{ delta: { content: 'b' } }] };
                  })(),
              },
            },
          };
        },
      }),
    );
    expect(progress).toEqual([0.5]);
    let out = '';
    for await (const d of engine!.stream([])) out += d;
    expect(out).toBe('ab');
  });
});
