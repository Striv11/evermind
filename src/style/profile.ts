import type { VoiceSample } from '../archive/schema';

/** Deterministic stylometric profile of someone's own writing. No network, no randomness. */
export interface StyleProfile {
  sampleCount: number;
  wordCount: number;
  avgSentenceLength: number;
  sentenceLengthStd: number;
  /** Moving-average type/token ratio (window 50), robust to text length. 0..1 */
  vocabRichness: number;
  /** Per 100 words. */
  punctuation: Record<
    'comma' | 'exclaim' | 'question' | 'ellipsis' | 'dash' | 'semicolon' | 'quote',
    number
  >;
  emojiPer100: number;
  /** Share of samples that start with a lowercase letter. */
  lowercaseStart: number;
  /** Share of letters that are upper case. */
  capsRatio: number;
  signaturePhrases: string[];
  /** Relative frequency of each function word (sums to <= 1 over the word list). */
  functionWords: Record<string, number>;
}

export const FUNCTION_WORDS = [
  'the',
  'and',
  'but',
  'or',
  'so',
  'well',
  'just',
  'really',
  'very',
  'honestly',
  'maybe',
  'always',
  'never',
  'i',
  'me',
  'my',
  'we',
  'you',
  'it',
  'that',
  'this',
  'not',
  'no',
  'yes',
  'to',
  'of',
  'in',
  'on',
  'for',
  'with',
  'is',
  'was',
  'are',
  'be',
  'a',
  'an',
  'if',
  'then',
  'because',
  'like',
  'neither',
  'same',
] as const;

const STOP = new Set(['the', 'a', 'an', 'and', 'of', 'to', 'in', 'is', 'it', 'i', 'that', 'was']);
const EMOJI = /\p{Extended_Pictographic}/gu;

export const words = (t: string): string[] =>
  t.toLowerCase().match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu) ?? [];

function sentences(t: string): string[] {
  return t
    .split(/(?<=[.!?…])\s+|\n+/u)
    .map((s) => s.trim())
    .filter((s) => words(s).length > 0);
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const round = (n: number) => Math.round(n * 1000) / 1000;

function mattr(ws: string[], win = 50): number {
  if (!ws.length) return 0;
  if (ws.length <= win) return new Set(ws).size / ws.length;
  const counts = new Map<string, number>();
  let distinct = 0;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i]!;
    if (!counts.get(w)) distinct++;
    counts.set(w, (counts.get(w) ?? 0) + 1);
    if (i >= win) {
      const o = ws[i - win]!;
      const c = counts.get(o)! - 1;
      counts.set(o, c);
      if (!c) distinct--;
    }
    if (i >= win - 1) {
      sum += distinct / win;
      n++;
    }
  }
  return sum / n;
}

/** Bi/trigrams used in at least two different samples, at least one non-stop word. */
function signature(samples: string[], max = 8): string[] {
  const seen = new Map<string, Set<number>>();
  samples.forEach((s, idx) => {
    const ws = words(s);
    for (const n of [2, 3]) {
      for (let i = 0; i + n <= ws.length; i++) {
        const g = ws.slice(i, i + n);
        if (g.every((w) => STOP.has(w))) continue;
        const k = g.join(' ');
        if (!seen.has(k)) seen.set(k, new Set());
        seen.get(k)!.add(idx);
      }
    }
  });
  return [...seen.entries()]
    .filter(([, s]) => s.size >= 2)
    .sort(
      (a, b) =>
        b[1].size - a[1].size ||
        b[0].split(' ').length - a[0].split(' ').length ||
        a[0].localeCompare(b[0]),
    )
    .slice(0, max)
    .map(([k]) => k);
}

export function computeStyleProfile(input: Array<string | VoiceSample>): StyleProfile {
  const texts = input.map((s) => (typeof s === 'string' ? s : s.text)).filter((t) => t.trim());
  const all = texts.join('\n');
  const ws = words(all);
  const n = Math.max(1, ws.length);
  const lens = texts.flatMap((t) => sentences(t).map((s) => words(s).length));
  const avg = mean(lens);
  const std = Math.sqrt(mean(lens.map((l) => (l - avg) ** 2)));
  const per100 = (re: RegExp) => ((all.match(re)?.length ?? 0) / n) * 100;
  const letters = all.match(/\p{L}/gu)?.length ?? 0;
  const upper = all.match(/\p{Lu}/gu)?.length ?? 0;
  const fw: Record<string, number> = {};
  for (const f of FUNCTION_WORDS) fw[f] = 0;
  for (const w of ws) if (w in fw) fw[w]! += 1 / n;
  for (const f of FUNCTION_WORDS) fw[f] = round(fw[f]!);
  return {
    sampleCount: texts.length,
    wordCount: ws.length,
    avgSentenceLength: round(avg),
    sentenceLengthStd: round(std),
    vocabRichness: round(mattr(ws)),
    punctuation: {
      comma: round(per100(/,/g)),
      exclaim: round(per100(/!/g)),
      question: round(per100(/\?/g)),
      ellipsis: round(per100(/…|\.{3}/g)),
      dash: round(per100(/[—–]|\s-\s/g)),
      semicolon: round(per100(/;/g)),
      quote: round(per100(/["“”]/g)),
    },
    emojiPer100: round(per100(EMOJI)),
    lowercaseStart: round(
      texts.length ? texts.filter((t) => /^\p{Ll}/u.test(t.trim())).length / texts.length : 0,
    ),
    capsRatio: round(letters ? upper / letters : 0),
    signaturePhrases: signature(texts),
    functionWords: fw,
  };
}

function cosine(a: number[], b: number[]): number {
  let d = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    d += a[i]! * b[i]!;
    na += a[i]! ** 2;
    nb += b[i]! ** 2;
  }
  return na && nb ? d / Math.sqrt(na * nb) : 0;
}

const closeness = (a: number, b: number, scale: number) => Math.max(0, 1 - Math.abs(a - b) / scale);

/**
 * How much `text` reads like the profile's author, 0..1. Blend of function-word cosine
 * similarity and closeness on sentence length, punctuation and emoji habits.
 */
export function styleSimilarity(profile: StyleProfile, text: string): number {
  const p = computeStyleProfile([text]);
  if (!p.wordCount || !profile.wordCount) return 0;
  const fw = cosine(
    FUNCTION_WORDS.map((f) => profile.functionWords[f] ?? 0),
    FUNCTION_WORDS.map((f) => p.functionWords[f] ?? 0),
  );
  const keys = Object.keys(profile.punctuation) as (keyof StyleProfile['punctuation'])[];
  const punct = mean(keys.map((k) => closeness(profile.punctuation[k], p.punctuation[k], 6)));
  const feats = mean([
    closeness(profile.avgSentenceLength, p.avgSentenceLength, 20),
    closeness(profile.emojiPer100, p.emojiPer100, 3),
    closeness(profile.capsRatio, p.capsRatio, 0.1),
    punct,
  ]);
  return round(0.5 * fw + 0.5 * feats);
}

export interface HeldOutScore {
  trained: number;
  heldOut: number;
  /** Mean similarity of the held-out samples to the profile. */
  own: number;
  /** Mean similarity of the supplied foreign texts, if any. */
  foreign: number | null;
}

/** Hold out every 4th sample, fit on the rest, score the held-out ones (and optional foreign texts). */
export function evaluateStyle(
  samples: Array<string | VoiceSample>,
  foreign: string[] = [],
): HeldOutScore {
  const texts = samples.map((s) => (typeof s === 'string' ? s : s.text));
  const held = texts.filter((_, i) => i % 4 === 3);
  const train = texts.filter((_, i) => i % 4 !== 3);
  const prof = computeStyleProfile(train);
  return {
    trained: train.length,
    heldOut: held.length,
    own: round(mean(held.map((t) => styleSimilarity(prof, t)))),
    foreign: foreign.length ? round(mean(foreign.map((t) => styleSimilarity(prof, t)))) : null,
  };
}

/** Prompt fragment describing how the person writes, for conditioning a generator. */
export function buildStylePrompt(p: StyleProfile): string {
  if (p.wordCount < 30)
    return 'Not enough writing samples to describe a style; write plainly and do not imitate.';
  const out: string[] = [];
  const len = p.avgSentenceLength;
  out.push(
    `Sentences average ${len.toFixed(0)} words (${len < 9 ? 'short and clipped' : len < 17 ? 'medium' : 'long and flowing'}).`,
  );
  const pu = p.punctuation;
  if (pu.question > 1.5) out.push('Often asks questions.');
  if (pu.exclaim > 1) out.push('Uses exclamation marks.');
  else if (pu.exclaim < 0.1) out.push('Almost never uses exclamation marks.');
  if (pu.ellipsis > 0.5) out.push('Trails off with ellipses.');
  if (pu.dash > 0.5) out.push('Likes dashes.');
  if (pu.semicolon > 0.3) out.push('Uses semicolons.');
  out.push(p.emojiPer100 > 0.5 ? 'Uses emoji.' : 'Does not use emoji.');
  if (p.lowercaseStart > 0.5) out.push('Often starts messages in lowercase.');
  if (p.signaturePhrases.length)
    out.push(`Characteristic phrases: ${p.signaturePhrases.map((s) => `"${s}"`).join(', ')}.`);
  out.push(
    'This describes writing style only. Never claim to be the person; label replies as an AI reconstruction.',
  );
  return out.join(' ');
}
