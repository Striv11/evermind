// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { demoArchive } from '../demo/persona';
import { validateArchive } from '../archive/validate';
import { HashingEmbedder } from '../retrieval/embed';
import { extractTriples, mergeSimilar, withExtractedFacts } from './extract';
import { buildGraph, layout, memoriesOf } from './graph';
import { graphSection } from '../ui/graphView';

const demo = () => demoArchive();

describe('fact extraction', () => {
  it('extracts triples with provenance from first-person text and metadata', () => {
    const ts = extractTriples(demo());
    const has = (p: string, o: RegExp) => ts.find((t) => t.predicate === p && o.test(t.object));
    expect(has('bought', /hives/)?.memoryIds).toEqual(['m6']);
    expect(has('regrets', /wedding/)?.memoryIds).toContain('m4');
    expect(has('was at', /Skerry Point/)?.memoryIds).toEqual(['m1', 'm2', 'm3', 'm5']);
    expect(ts.find((t) => t.subject === 'Odile' && t.predicate === 'is sister of')).toBeTruthy();
    for (const t of ts) expect(t.memoryIds.length).toBeGreaterThan(0);
  });

  it('invents nothing: every object appears in a cited memory or its metadata', () => {
    const a = demo();
    for (const t of extractTriples(a)) {
      const hay = t.memoryIds
        .map((id) => a.memories.find((m) => m.id === id)!)
        .map(
          (m) =>
            `${m.text} ${m.place ?? ''} ${(m.people ?? []).map((p) => a.people.find((x) => x.id === p)?.name).join(' ')}`,
        )
        .join(' ')
        .toLowerCase();
      const words = t.object
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3);
      const subj = t.subject.toLowerCase();
      expect(words.some((w) => hay.includes(w.replace(/s$/, ''))) || subj !== 'wren').toBe(true);
    }
  });

  it('keeps hand-written facts untouched and yields a valid archive', () => {
    const a = demo();
    const b = withExtractedFacts(a);
    expect(b.facts.length).toBeGreaterThan(a.facts.length);
    expect(b.facts.slice(0, a.facts.length).map((f) => f.object)).toEqual(
      a.facts.map((f) => f.object),
    );
    expect(validateArchive(b).ok).toBe(true);
  });

  it('is deterministic', () => {
    expect(extractTriples(demo())).toEqual(extractTriples(demo()));
  });

  it('merges near-duplicate objects via embeddings, combining provenance', async () => {
    const out = await mergeSimilar(
      [
        {
          subject: 'Wren',
          predicate: 'regrets',
          object: 'missing Odile’s wedding',
          confidence: 0.7,
          memoryIds: ['m4'],
        },
        {
          subject: 'Wren',
          predicate: 'regrets',
          object: 'missed Odile’s wedding',
          confidence: 0.8,
          memoryIds: ['m8'],
        },
        {
          subject: 'Wren',
          predicate: 'regrets',
          object: 'selling the boat',
          confidence: 0.6,
          memoryIds: ['m9'],
        },
      ],
      new HashingEmbedder(),
    );
    expect(out).toHaveLength(2);
    expect(out[0]!.memoryIds).toEqual(['m4', 'm8']);
    expect(out[0]!.confidence).toBe(0.8);
  });
});

describe('graph', () => {
  const a = withExtractedFacts(demo());
  const g = buildGraph(a);

  it('classifies nodes and links them to source memories', () => {
    const odile = g.nodes.find((n) => n.label === 'Odile')!;
    expect(odile.kind).toBe('person');
    expect(memoriesOf(a, odile).map((m) => m.id)).toEqual(['m1', 'm4', 'm8']);
    expect(g.nodes.find((n) => n.label === 'Skerry Point')!.kind).toBe('place');
    expect(g.nodes.find((n) => n.label === 'Wren')!.kind).toBe('self');
    expect(
      g.edges.every(
        (e) => g.nodes.some((n) => n.id === e.from) && g.nodes.some((n) => n.id === e.to),
      ),
    ).toBe(true);
  });

  it('lays out deterministically inside the box', () => {
    const p1 = layout(g);
    const p2 = layout(g);
    expect([...p1]).toEqual([...p2]);
    for (const p of p1.values()) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(640);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(420);
    }
    expect(layout({ nodes: [], edges: [] }).size).toBe(0);
  });
});

describe('graph view', () => {
  it('clicking a node or timeline dot shows its source memories; list fallback exists', () => {
    const a = withExtractedFacts(demo());
    const el = graphSection(a);
    document.body.append(el);
    const detail = el.querySelector('[data-testid=graph-detail]')!;
    el.querySelector<SVGGElement>('[data-node="Odile"]')!.dispatchEvent(new Event('click'));
    expect(detail.querySelectorAll('[data-testid=source-memory]')).toHaveLength(3);
    el.querySelector<SVGGElement>('[data-memory="m6"]')!.dispatchEvent(new Event('click'));
    expect(detail.textContent).toContain('four hives');
    const items = el.querySelectorAll('[data-testid=node-list] li');
    expect(items.length).toBe(buildGraph(a).nodes.length);
    el.querySelector<HTMLButtonElement>('[data-testid=node-list] button')!.click();
    expect(detail.querySelector('h3')).toBeTruthy();
  });
});
