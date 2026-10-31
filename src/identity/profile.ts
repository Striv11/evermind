import type { Archive } from '../archive/schema';
import { tokenize } from '../insight/emotions';
import { DIMENSIONS, type DimensionId } from './dimensions';

/** One thing the system has learned about the person, with the memories that show it. */
export interface Trait {
  dimension: DimensionId;
  statement: string; // first person, specific
  evidence: string[]; // memory ids
  confidence: number; // 0..1
}

export interface BigFiveScore {
  score: number; // 0..1
  evidence: string[];
}

/** Derived understanding of the person. The model-facing Zod schema lives in profileSchema.ts. */
export interface IdentityProfile {
  summary: string;
  bigFive: Record<
    'openness' | 'conscientiousness' | 'extraversion' | 'agreeableness' | 'neuroticism',
    BigFiveScore
  >;
  traits: Trait[];
  speech: { style: string; phrases: string[] };
  gaps: string[];
  updatedAt: string;
  basedOnMemories: number;
}

const isStrArr = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string');
const DIM_IDS = new Set<string>(DIMENSIONS.map((d) => d.id));

/** Profile shape check for archives read from disk (the profile is derived, so it is optional). */
export function isProfile(v: unknown): v is IdentityProfile {
  if (typeof v !== 'object' || v === null) return false;
  const p = v as Record<string, unknown>;
  const big = p['bigFive'] as Record<string, unknown> | undefined;
  const speech = p['speech'] as Record<string, unknown> | undefined;
  return (
    typeof p['summary'] === 'string' &&
    typeof p['updatedAt'] === 'string' &&
    typeof p['basedOnMemories'] === 'number' &&
    isStrArr(p['gaps']) &&
    !!speech &&
    typeof speech['style'] === 'string' &&
    isStrArr(speech['phrases']) &&
    !!big &&
    ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism'].every((k) => {
      const b = big[k] as Record<string, unknown> | undefined;
      return !!b && typeof b['score'] === 'number' && isStrArr(b['evidence']);
    }) &&
    Array.isArray(p['traits']) &&
    p['traits'].every(
      (t: Record<string, unknown>) =>
        DIM_IDS.has(t?.['dimension'] as string) &&
        typeof t['statement'] === 'string' &&
        isStrArr(t['evidence']) &&
        typeof t['confidence'] === 'number',
    )
  );
}

/** Drop evidence ids that do not exist, and traits left with none. */
export function groundProfile(p: IdentityProfile, a: Archive): IdentityProfile {
  const ids = new Set(a.memories.map((m) => m.id));
  const keep = (ev: string[]) => ev.filter((id) => ids.has(id));
  return {
    ...p,
    traits: p.traits
      .map((t) => ({ ...t, evidence: keep(t.evidence), confidence: clamp(t.confidence) }))
      .filter((t) => t.evidence.length > 0),
    bigFive: Object.fromEntries(
      Object.entries(p.bigFive).map(([k, v]) => [
        k,
        { score: clamp(v.score), evidence: keep(v.evidence) },
      ]),
    ) as IdentityProfile['bigFive'],
  };
}

const clamp = (x: number) => Math.min(1, Math.max(0, Number.isFinite(x) ? x : 0));

export interface Coverage {
  id: DimensionId;
  label: string;
  score: number; // 0..1
  evidence: number;
}

/**
 * How much of each dimension is captured. Evidence = memories tagged with the
 * dimension's themes + learned traits in it (weighted by confidence); for "How
 * you talk" it is minutes of the person's own words. Saturates toward the target.
 */
export function coverage(a: Archive): { overall: number; dimensions: Coverage[] } {
  const profile = a.identity;
  const words = a.voiceSamples.reduce((n, v) => n + tokenize(v.text).length, 0);
  const dims = DIMENSIONS.map((d) => {
    let evidence = 0;
    if (d.id === 'voice')
      evidence = words / 130; // ~1 unit per minute of speech
    else {
      evidence +=
        a.memories.filter((m) => m.themes?.some((t) => (d.themes as string[]).includes(t))).length *
        0.6;
      evidence += (profile?.traits ?? [])
        .filter((t) => t.dimension === d.id)
        .reduce((n, t) => n + 0.5 + t.confidence, 0);
      if (d.id === 'personality' && profile)
        evidence += Object.values(profile.bigFive).filter((b) => b.evidence.length).length * 1.5;
      if (d.id === 'emotions')
        evidence +=
          a.memories.filter((m) => m.emotions?.[0] && m.emotions[0].label !== 'neutral').length *
          0.4;
    }
    const score = 1 - Math.exp((-2.3 * evidence) / d.target); // 90% at target
    return {
      id: d.id,
      label: d.label,
      score: Math.round(score * 100) / 100,
      evidence: Math.round(evidence * 10) / 10,
    };
  });
  const overall = Math.round((dims.reduce((s, d) => s + d.score, 0) / dims.length) * 100) / 100;
  return { overall, dimensions: dims };
}

/** Question for the weakest dimension that has not been asked yet (offline interviewer). */
export function nextQuestion(a: Archive): { dimension: DimensionId; question: string } | null {
  const asked = new Set((a.interview ?? []).map((q) => q.question));
  const ranked = coverage(a).dimensions.sort((x, y) => x.score - y.score);
  for (const c of ranked) {
    const d = DIMENSIONS.find((x) => x.id === c.id)!;
    const q = d.questions.find((q) => !asked.has(q));
    if (q) return { dimension: d.id, question: q };
  }
  return null;
}
