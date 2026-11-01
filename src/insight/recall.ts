import type { Archive, EpisodicMemory } from '../archive/schema';
import { allowedMemories, gateQuestion } from '../identity/legacy';
import { tokenize } from './emotions';

const STOP = new Set(
  'a an and are as at be but by did do does for from had has have how i in is it its me my of on or so that the their them then there they this to was we were what when where which who why will with you your about tell'.split(
    ' ',
  ),
);

const terms = (text: string) => tokenize(text).filter((t) => !STOP.has(t) && t.length > 1);

export interface Hit {
  memory: EpisodicMemory;
  score: number;
}

/** BM25 over memory texts plus their themes and emotion labels. */
export function search(memories: EpisodicMemory[], query: string, k = 3): Hit[] {
  const q = terms(query);
  if (!q.length || !memories.length) return [];
  const docs = memories.map((m) =>
    terms([m.text, ...(m.themes ?? []), ...(m.emotions?.map((e) => e.label) ?? [])].join(' ')),
  );
  const avg = docs.reduce((n, d) => n + d.length, 0) / docs.length;
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1);
  const N = docs.length;
  const k1 = 1.2;
  const b = 0.75;
  return docs
    .map((d, i) => {
      let s = 0;
      for (const t of q) {
        const f = d.filter((x) => x === t).length;
        if (!f) continue;
        const idf = Math.log(1 + (N - (df.get(t) ?? 0) + 0.5) / ((df.get(t) ?? 0) + 0.5));
        s += (idf * f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.length) / avg));
      }
      return { memory: memories[i]!, score: s };
    })
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

export interface TwinAnswer {
  text: string;
  citations: string[]; // memory ids
  abstained: boolean;
}

/**
 * Retrieval-only answer in the subject's own recorded words. Never invents
 * content: it quotes what was said, or says it does not remember.
 */
export function answer(archive: Archive, question: string, threshold = 0.3): TwinAnswer {
  const gate = gateQuestion(archive, question);
  if (!gate.ok) return { text: gate.reply, citations: [], abstained: true };
  const hits = search(allowedMemories(archive), question, 2).filter((h) => h.score >= threshold);
  if (!hits.length)
    return {
      text: "I don't remember talking about that. Tell me about it, and I'll keep it.",
      citations: [],
      abstained: true,
    };
  const [first, second] = hits;
  const parts = [first!.memory.text];
  if (second && second.score >= first!.score * 0.6) parts.push(second.memory.text);
  return { text: parts.join(' … '), citations: hits.map((h) => h.memory.id), abstained: false };
}

/** Spoken form of a twin reply: drop citation markers before text-to-speech. */
export const forSpeech = (text: string) => text.replace(/\s*\[m:[^\]]+\]/g, '').trim();
