import type { Archive, EpisodicMemory, SemanticFact } from '../archive/schema';
import type { Embedder } from '../retrieval/embed';
import { dot } from '../retrieval/vector';

/** A fact candidate before ids are assigned. `memoryIds` is the provenance. */
export interface Triple {
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
  memoryIds: string[];
}

const FIRST_PERSON: Record<string, string> = {
  love: 'loves',
  loved: 'loves',
  like: 'likes',
  enjoy: 'enjoys',
  hate: 'dislikes',
  fear: 'fears',
  feared: 'fears',
  miss: 'misses',
  missed: 'missed',
  believe: 'believes',
  regret: 'regrets',
  keep: 'keeps',
  kept: 'keeps',
  trust: 'trusts',
  value: 'values',
};

/** Sentence-initial journal fragments with an implied "I": "Bought four hives." */
const FRAGMENT: Record<string, string> = {
  bought: 'bought',
  took: 'took',
  built: 'built',
  met: 'met',
  married: 'married',
  started: 'started',
  founded: 'founded',
  learned: 'learned',
  adopted: 'adopted',
};

const clean = (s: string) =>
  s
    .replace(/\s+/g, ' ')
    .replace(/^(?:the|a|an|my)\s+/i, (m) => (m.toLowerCase() === 'my ' ? 'my ' : ''))
    .replace(/[\s"“”,;:.!?-]+$/g, '')
    .trim();

const sentences = (text: string) =>
  text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

function fromSentence(s: string): Array<{ predicate: string; object: string; confidence: number }> {
  const out: Array<{ predicate: string; object: string; confidence: number }> = [];
  const verbs = Object.keys(FIRST_PERSON).join('|');
  const first = new RegExp(`\\bI (?:still |always |really )?(${verbs})\\s+([^.,;!?]{3,60})`, 'i');
  const m = first.exec(s);
  if (m)
    out.push({
      predicate: FIRST_PERSON[m[1]!.toLowerCase()]!,
      object: clean(m[2]!),
      confidence: 0.7,
    });

  const reg = /^regret:\s*(.{4,80}?)(?:[.!?]|$)/i.exec(s);
  if (reg) {
    const obj = clean(reg[1]!.replace(/^I\s+/i, ''));
    out.push({ predicate: 'regrets', object: obj, confidence: 0.75 });
  }

  const frag = new RegExp(`^(${Object.keys(FRAGMENT).join('|')})\\s+([^.,;!?]{3,60})`, 'i').exec(s);
  if (frag)
    out.push({
      predicate: FRAGMENT[frag[1]!.toLowerCase()]!,
      object: clean(frag[2]!),
      confidence: 0.65,
    });

  const role = /\bI (?:am|was|became) (?:a|an|the)\s+([^.,;!?]{3,40})/i.exec(s);
  if (role) out.push({ predicate: 'worked as', object: clean(role[1]!), confidence: 0.55 });
  return out;
}

/**
 * Rule-based extraction. Every triple points at the memories it came from, so the graph UI can
 * show the evidence, and nothing is produced that the text or its metadata does not support.
 */
export function extractTriples(a: Archive): Triple[] {
  const subject = a.subject.displayName.replace(/\s*\(.*\)\s*$/, '').split(/\s+/)[0] || 'Me';
  const people = new Map(a.people.map((p) => [p.id, p]));
  const out: Triple[] = [];
  const add = (m: EpisodicMemory, t: Omit<Triple, 'memoryIds'>) =>
    out.push({ ...t, memoryIds: [m.id] });

  for (const m of a.memories) {
    for (const id of m.people ?? []) {
      const p = people.get(id);
      if (!p) continue;
      if (p.relation) {
        const rel = p.relation.split(',')[0]!.trim();
        add(m, { subject: p.name, predicate: `is ${rel} of`, object: subject, confidence: 0.9 });
      } else add(m, { subject, predicate: 'knows', object: p.name, confidence: 0.6 });
    }
    if (m.place) add(m, { subject, predicate: 'was at', object: m.place, confidence: 0.8 });
    for (const s of sentences(m.text))
      for (const t of fromSentence(s)) if (t.object.length >= 3) add(m, { subject, ...t });
  }
  return mergeExact(out);
}

const key = (t: Pick<Triple, 'subject' | 'predicate' | 'object'>) =>
  [t.subject, t.predicate, t.object].map((s) => s.toLowerCase()).join('\u0000');

/** Same triple from several memories becomes one with combined provenance and higher confidence. */
function mergeExact(ts: Triple[]): Triple[] {
  const by = new Map<string, Triple>();
  for (const t of ts) {
    const prev = by.get(key(t));
    if (!prev) by.set(key(t), { ...t, memoryIds: [...t.memoryIds] });
    else {
      for (const id of t.memoryIds) if (!prev.memoryIds.includes(id)) prev.memoryIds.push(id);
      prev.confidence = Math.min(0.99, 1 - (1 - prev.confidence) * (1 - t.confidence * 0.5));
    }
  }
  return [...by.values()];
}

/**
 * Embedding-assisted pass: triples with the same subject and predicate whose objects are
 * near-duplicates ("missing Odile's wedding" vs "missed Odile's wedding") are merged.
 */
export async function mergeSimilar(
  ts: Triple[],
  embedder: Embedder,
  threshold = 0.8,
): Promise<Triple[]> {
  if (ts.length < 2) return ts;
  const vecs = await embedder.embed(ts.map((t) => t.object));
  const kept: Array<{ t: Triple; v: Float32Array }> = [];
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i]!;
    const v = vecs[i]!;
    const twin = kept.find(
      (k) =>
        k.t.subject.toLowerCase() === t.subject.toLowerCase() &&
        k.t.predicate === t.predicate &&
        dot(k.v, v) >= threshold,
    );
    if (!twin) kept.push({ t: { ...t, memoryIds: [...t.memoryIds] }, v });
    else {
      for (const id of t.memoryIds) if (!twin.t.memoryIds.includes(id)) twin.t.memoryIds.push(id);
      twin.t.confidence = Math.max(twin.t.confidence, t.confidence);
    }
  }
  return kept.map((k) => k.t);
}

/** Turns triples into archive facts. `sourceIds` is derived from the provenance memories. */
export function toFacts(a: Archive, ts: Triple[], idPrefix = 'x'): SemanticFact[] {
  const src = new Map(a.memories.map((m) => [m.id, m.sourceId]));
  return ts.map((t, i) => ({
    id: `${idPrefix}${i + 1}`,
    subject: t.subject,
    predicate: t.predicate,
    object: t.object,
    confidence: Math.round(t.confidence * 100) / 100,
    sourceIds: [...new Set(t.memoryIds.map((id) => src.get(id)!).filter(Boolean))],
    memoryIds: t.memoryIds,
  }));
}

/**
 * Archive with extracted facts added. Hand-written facts win: an extracted triple that matches
 * one only contributes its provenance, and the originals are never altered otherwise.
 */
export function withExtractedFacts(a: Archive, extra: Triple[] = extractTriples(a)): Archive {
  const facts = a.facts.map((f) => ({ ...f }));
  const byKey = new Map(facts.map((f) => [key(f), f]));
  const fresh: Triple[] = [];
  for (const t of extra) {
    const f = byKey.get(key(t));
    if (!f) fresh.push(t);
    else f.memoryIds = [...new Set([...(f.memoryIds ?? []), ...t.memoryIds])];
  }
  return { ...a, facts: [...facts, ...toFacts(a, fresh, 'x')] };
}
