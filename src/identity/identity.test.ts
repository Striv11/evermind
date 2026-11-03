import { describe, expect, it } from 'vitest';
import { emptyArchive, type Archive } from '../archive/schema';
import { validateArchive } from '../archive/validate';
import { ingestAudio } from '../insight/pipeline';
import { forSpeech, interviewQuestion, personaSystem, speak, understand } from './brain';
import { DIMENSIONS } from './dimensions';
import { FACET_QUESTIONS, facetGaps, nextQuestion, progress } from './interview';
import { coverage, groundProfile, type IdentityProfile } from './profile';

const story = ingestAudio(emptyArchive('Asha'), {
  fileName: 's',
  recordedAt: '2026-10-31',
  chunks: [
    {
      text: 'My grandmother raised me in Pune and taught me that kindness is never wasted.',
      start: 0,
      end: 5,
    },
    {
      text: 'In 2019 I joined a startup. I was terrified but proud of my first project.',
      start: 9,
      end: 14,
    },
    {
      text: 'My advice to anyone I love: always be honest, and call your family.',
      start: 18,
      end: 22,
    },
  ],
}).archive;
const [m1, m2, m3] = story.memories;

const profile = (over: Partial<IdentityProfile> = {}): IdentityProfile => ({
  summary: 'I am a builder who was raised by my grandmother.',
  bigFive: {
    openness: { score: 0.8, evidence: [m2!.id] },
    conscientiousness: { score: 0.6, evidence: [] },
    extraversion: { score: 0.4, evidence: [] },
    agreeableness: { score: 0.7, evidence: [m1!.id] },
    neuroticism: { score: 0.5, evidence: [m2!.id] },
  },
  traits: [
    {
      dimension: 'values',
      statement: 'I value kindness above winning.',
      evidence: [m1!.id],
      confidence: 0.9,
    },
    {
      dimension: 'legacy',
      statement: 'I want my family to stay close.',
      evidence: [m3!.id],
      confidence: 0.7,
    },
  ],
  speech: { style: 'Warm, direct, mixes Hindi and English.', phrases: ['always be honest'] },
  gaps: ['What do you think about money?'],
  updatedAt: '2026-10-31T00:00:00Z',
  basedOnMemories: 3,
  ...over,
});

describe('capture map', () => {
  it('covers every dimension once, with questions', () => {
    expect(new Set(DIMENSIONS.map((d) => d.id)).size).toBe(12);
    for (const d of DIMENSIONS) expect(d.questions.length).toBeGreaterThan(1);
  });
  it('starts near zero and grows with memories and traits', () => {
    const empty = coverage(emptyArchive('x'));
    expect(empty.overall).toBe(0);
    const some = coverage(story);
    expect(some.overall).toBeGreaterThan(0);
    const withProfile = coverage({ ...story, identity: profile() });
    expect(withProfile.overall).toBeGreaterThan(some.overall);
    const values = withProfile.dimensions.find((d) => d.id === 'values')!;
    expect(values.score).toBeGreaterThan(0);
    expect(values.score).toBeLessThan(1);
  });
  it('asks about the weakest dimension and never repeats', () => {
    const q1 = nextQuestion(story)!;
    const weakest = coverage(story).dimensions.sort((a, b) => a.score - b.score)[0]!;
    expect(q1.dimension).toBe(weakest.id);
    const asked: Archive = {
      ...story,
      interview: [{ question: q1.question, dimension: q1.dimension, askedAt: '2026-10-31' }],
    };
    expect(nextQuestion(asked)!.question).not.toBe(q1.question);
    expect(validateArchive(asked).ok).toBe(true);
  });
});

describe('profile grounding', () => {
  it('drops invented evidence and traits with none left', () => {
    const p = profile({
      traits: [
        { dimension: 'values', statement: 'real', evidence: [m1!.id, 'fake'], confidence: 1.4 },
        { dimension: 'humor', statement: 'made up', evidence: ['nope'], confidence: 0.9 },
      ],
    });
    const g = groundProfile(p, story);
    expect(g.traits).toHaveLength(1);
    expect(g.traits[0]!.evidence).toEqual([m1!.id]);
    expect(g.traits[0]!.confidence).toBe(1);
    expect(validateArchive({ ...story, identity: g }).ok).toBe(true);
  });
  it('rejects a malformed profile in the archive', () => {
    const bad = { ...story, identity: { summary: 'x' } } as unknown as Archive;
    expect(validateArchive(bad).ok).toBe(false);
  });
});

describe('persona', () => {
  it('includes the profile, grounding rules and AI honesty', () => {
    const s = personaSystem({ ...story, identity: profile() });
    expect(s).toContain('AI reconstruction of Asha');
    expect(s).toContain('[m:<id>]');
    expect(s).toContain('I value kindness above winning.');
    expect(s).toContain('always be honest');
  });
  it('strips citations for speech', () => {
    expect(forSpeech('She raised me [m:mem-1]. I miss her [m:mem-2].')).toBe(
      'She raised me. I miss her.',
    );
  });
});

/** Fake Anthropic HTTP layer: records requests, returns canned messages. */
function fakeApi(reply: (body: Record<string, unknown>) => unknown) {
  const calls: Record<string, unknown>[] = [];
  const orig = globalThis.fetch;
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    calls.push(body);
    const out = reply(body);
    if (body.stream) {
      const events = out as string[];
      return new Response(events.join(''), { headers: { 'content-type': 'text/event-stream' } });
    }
    return new Response(JSON.stringify(out), { headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = orig) };
}

const message = (text: string) => ({
  id: 'msg_1',
  type: 'message',
  role: 'assistant',
  model: 'claude-opus-5-5',
  content: [{ type: 'text', text }],
  stop_reason: 'end_turn',
  stop_details: null,
  usage: { input_tokens: 10, output_tokens: 10 },
});

describe('brain (Claude API, faked HTTP)', () => {
  it('understand(): sends all memories with a structured format and grounds the result', async () => {
    const { identity: _omit, ...raw } = { ...profile(), identity: undefined };
    void _omit;
    const api = fakeApi(() =>
      message(
        JSON.stringify({
          ...raw,
          traits: [
            ...raw.traits,
            { dimension: 'humor', statement: 'x', evidence: ['ghost'], confidence: 0.5 },
          ],
        }),
      ),
    );
    try {
      const p = await understand('sk-test', story);
      const req = api.calls[0]!;
      expect(req['model']).toBe('claude-opus-5-5');
      expect(JSON.stringify(req['messages'])).toContain(m2!.id);
      expect((req['output_config'] as { format: { type: string } }).format.type).toBe(
        'json_schema',
      );
      expect(req['fallbacks']).toBe('default');
      expect(p.traits.map((t) => t.statement)).not.toContain('x');
      expect(p.basedOnMemories).toBe(3);
    } finally {
      api.restore();
    }
  });
  it('interviewQuestion(): parses "dimension|question"', async () => {
    const api = fakeApi(() =>
      message('humor|What is the funniest thing your grandmother ever said?'),
    );
    try {
      const q = await interviewQuestion('sk-test', story);
      expect(q).toEqual({
        dimension: 'humor',
        question: 'What is the funniest thing your grandmother ever said?',
      });
    } finally {
      api.restore();
    }
  });
  it('speak(): streams text and keeps only real citations', async () => {
    const sse = (type: string, data: unknown) =>
      `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
    const api = fakeApi(() => [
      sse('message_start', {
        type: 'message_start',
        message: { ...message(''), content: [], stop_reason: null },
      }),
      sse('content_block_start', {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      }),
      sse('content_block_delta', {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: `Nani raised me in Pune [m:${m1!.id}]` },
      }),
      sse('content_block_delta', {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: ' and I miss her [m:fake].' },
      }),
      sse('content_block_stop', { type: 'content_block_stop', index: 0 }),
      sse('message_delta', {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn', stop_details: null },
        usage: { output_tokens: 12 },
      }),
      sse('message_stop', { type: 'message_stop' }),
    ]);
    try {
      let streamed = '';
      const r = await speak(
        'sk-test',
        { ...story, identity: profile() },
        [{ role: 'user', text: 'Who raised you?' }],
        (d) => (streamed += d),
      );
      expect(streamed).toContain('Nani raised me');
      expect(r.citations).toEqual([m1!.id]);
      const req = api.calls[0]!;
      expect(JSON.stringify(req['messages'])).toContain('grandmother');
      expect(JSON.stringify(req['system'])).toContain('AI reconstruction of Asha');
    } finally {
      api.restore();
    }
  });
});

describe('guided interview', () => {
  const withText = (text: string): Archive => ({
    ...story,
    memories: [...story.memories, { ...story.memories[0]!, id: 'mem-x', text }],
  });
  it('flags facets as covered only when memories mention them', () => {
    const none = facetGaps(emptyArchive('x'));
    expect(none.every((g) => !g.covered)).toBe(true);
    const gaps = facetGaps(withText('I deeply regret not calling my father more often.'));
    expect(gaps.find((g) => g.facet === 'regret')!.covered).toBe(true);
    expect(gaps.find((g) => g.facet === 'grief')!.covered).toBe(false);
  });
  it('asks about an uncovered facet before a covered one in the same dimension', () => {
    const empty = emptyArchive('x');
    const first = nextQuestion(empty)!;
    expect(first.facet).toBeDefined();
    const covered = withText('Regret, fear, a lot of grief; I was afraid and I lost my dad.');
    const q = nextQuestion({ ...covered, memories: covered.memories.slice(-1) })!;
    const g = facetGaps({ ...covered, memories: covered.memories.slice(-1) });
    if (q.facet) expect(g.find((x) => x.facet === q.facet)!.covered).toBe(false);
  });
  it('is resumable: asked questions persist and the whole bank is eventually exhausted', () => {
    let a = emptyArchive('x');
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const q = nextQuestion(a);
      if (!q) break;
      expect(seen.has(q.question)).toBe(false);
      seen.add(q.question);
      a = {
        ...a,
        interview: [...(a.interview ?? []), { ...q, askedAt: '2026-11-03' }],
      };
      expect(validateArchive(a).ok).toBe(true);
    }
    expect(nextQuestion(a)).toBeNull();
    const p = progress(a);
    expect(p.asked).toBe(p.total);
    expect(progress(emptyArchive('x')).asked).toBe(0);
  });
  it('covers the topics in the brief', () => {
    const facets = new Set(FACET_QUESTIONS.map((f) => f.facet));
    for (const f of ['childhood', 'regret', 'places', 'advice for loved ones', 'family'])
      expect(facets.has(f)).toBe(true);
  });
});
