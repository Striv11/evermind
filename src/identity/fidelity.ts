/**
 * Fidelity loop: the user judges twin replies ("that's me" / "not me"), optionally
 * with what they would really say. Corrections become first-person memories, and
 * the verdicts give a per-dimension fidelity score showing where the twin is weakest.
 */
import type { Archive, EpisodicMemory } from '../archive/schema';
import { ingestAudio } from '../insight/pipeline';
import { classifyThemes } from '../insight/themes';
import { DIMENSIONS, type DimensionId } from './dimensions';

export type Verdict = 'me' | 'not-me';

export interface FidelityRating {
  id: string;
  question: string;
  reply: string;
  dimension: DimensionId;
  verdict: Verdict;
  /** What the person would really say; only for "not-me". */
  correction?: string;
  /** Memory ids the reply cited. */
  citations: string[];
  ratedAt: string; // ISO 8601
}

const CUES: [DimensionId, RegExp][] = [
  ['decisions', /\b(should i|decide|decision|choose|choice|risk|quit|take the job)\b/i],
  ['humor', /\b(funny|joke|laugh|hilarious|prank)\b/i],
  ['tastes', /\b(favou?rite|music|song|food|movie|film|book|eat|cook)\b/i],
  ['beliefs', /\b(god|fate|karma|afterlife|meaning of life|die|death|faith)\b/i],
  ['legacy', /\b(remember(ed)? (you|me)|legacy|pass on|advice for (my )?(kids|children))\b/i],
  ['emotions', /\b(afraid|scared|angry|happiest|sad|regret|grief|cry)\b/i],
  ['personality', /\b(introvert|extrovert|stress(ed)?|conflict|planner|spontaneous)\b/i],
  ['values', /\b(values?|principles?|never do|matters most|integrity)\b/i],
];

/** Which dimension a question probes: wording cues first, then themes of the question and its cited memories. */
export function classifyDimension(
  question: string,
  citations: string[],
  a: Pick<Archive, 'memories'>,
): DimensionId {
  for (const [id, re] of CUES) if (re.test(question)) return id;
  const themes = [
    ...classifyThemes(question),
    ...a.memories.filter((m) => citations.includes(m.id)).flatMap((m) => m.themes ?? []),
  ];
  let best: DimensionId = 'opinions';
  let bestN = 0;
  for (const d of DIMENSIONS) {
    const n = themes.filter((t) => (d.themes as string[]).includes(t)).length;
    if (n > bestN) [best, bestN] = [d.id, n];
  }
  return best;
}

export interface RateInput {
  question: string;
  reply: string;
  verdict: Verdict;
  correction?: string;
  citations?: string[];
  now?: Date;
}

export interface RateResult {
  archive: Archive;
  rating: FidelityRating;
  /** The memory created from a correction, if any. */
  memory?: EpisodicMemory;
}

let counter = 0;

/** Record a verdict. A non-empty correction on "not-me" is saved as a typed memory. */
export function rate(a: Archive, input: RateInput): RateResult {
  const now = input.now ?? new Date();
  const citations = (input.citations ?? []).filter((id) => a.memories.some((m) => m.id === id));
  const correction = input.verdict === 'not-me' ? input.correction?.trim() : undefined;
  let archive = a;
  let memory: EpisodicMemory | undefined;
  if (correction) {
    const r = ingestAudio(
      a,
      {
        fileName: `Correction: ${input.question.slice(0, 80)}`,
        kind: 'typed',
        recordedAt: now.toISOString().slice(0, 10),
        chunks: [{ text: correction, start: 0, end: 0 }],
      },
      { now },
    );
    memory = r.memories[0] && { ...r.memories[0], tags: ['correction'] };
    archive = {
      ...r.archive,
      memories: r.archive.memories.map((m) => (m.id === memory?.id ? memory : m)),
    };
  }
  const rating: FidelityRating = {
    id: `fid-${now.getTime().toString(36)}-${(counter++).toString(36)}`,
    question: input.question,
    reply: input.reply,
    dimension: classifyDimension(input.question, citations, a),
    verdict: input.verdict,
    ...(correction ? { correction } : {}),
    citations,
    ratedAt: now.toISOString(),
  };
  return {
    archive: { ...archive, fidelity: [...(archive.fidelity ?? []), rating] },
    rating,
    memory,
  };
}

export interface FidelityScore {
  id: DimensionId;
  label: string;
  rated: number;
  /** Share of "that's me" verdicts, or null when nothing was rated yet. */
  score: number | null;
}

/** Per-dimension share of "that's me" verdicts, and the overall share. */
export function fidelity(a: Pick<Archive, 'fidelity'>): {
  overall: number | null;
  total: number;
  dimensions: FidelityScore[];
} {
  const all = a.fidelity ?? [];
  const dimensions = DIMENSIONS.map((d) => {
    const rs = all.filter((r) => r.dimension === d.id);
    const me = rs.filter((r) => r.verdict === 'me').length;
    return {
      id: d.id,
      label: d.label,
      rated: rs.length,
      score: rs.length ? Math.round((me / rs.length) * 100) / 100 : null,
    };
  });
  const me = all.filter((r) => r.verdict === 'me').length;
  return {
    overall: all.length ? Math.round((me / all.length) * 100) / 100 : null,
    total: all.length,
    dimensions,
  };
}

export function isRating(v: unknown): v is FidelityRating {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r['id'] === 'string' &&
    r['id'] !== '' &&
    typeof r['question'] === 'string' &&
    typeof r['reply'] === 'string' &&
    (r['verdict'] === 'me' || r['verdict'] === 'not-me') &&
    DIMENSIONS.some((d) => d.id === r['dimension']) &&
    (r['correction'] === undefined || typeof r['correction'] === 'string') &&
    Array.isArray(r['citations']) &&
    r['citations'].every((c) => typeof c === 'string') &&
    typeof r['ratedAt'] === 'string' &&
    !Number.isNaN(Date.parse(r['ratedAt']))
  );
}
