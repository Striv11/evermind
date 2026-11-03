/**
 * Guided life interview: a facet-level question bank with gap detection.
 *
 * Every dimension (see dimensions.ts) has facets such as "childhood" or "regret".
 * A facet counts as covered when the person's own memories already talk about it
 * (keyword match), so the interviewer first asks about what is missing, in the
 * weakest dimension, and never repeats a question. Pure and deterministic.
 */
import type { Archive } from '../archive/schema';
import { DIMENSIONS, type DimensionId } from './dimensions';
import { coverage } from './profile';

export interface FacetQuestion {
  dimension: DimensionId;
  facet: string;
  question: string;
  /** Lowercase stems; a memory mentioning any of them covers the facet. */
  cues: string[];
}

export const FACET_QUESTIONS: FacetQuestion[] = [
  {
    dimension: 'story',
    facet: 'childhood',
    cues: ['child', 'grew up', 'kid', 'little', 'parents'],
    question: 'What did an ordinary day look like when you were seven years old?',
  },
  {
    dimension: 'story',
    facet: 'school years',
    cues: ['school', 'teacher', 'classmate', 'college', 'universit'],
    question: 'Which teacher or classmate do you still remember, and why them?',
  },
  {
    dimension: 'story',
    facet: 'leaving home',
    cues: ['moved out', 'left home', 'moved to', 'hostel', 'first apartment'],
    question: 'What did you carry with you the day you left home for the first time?',
  },
  {
    dimension: 'story',
    facet: 'work life',
    cues: ['work', 'job', 'career', 'boss', 'office', 'profession'],
    question: 'What was your first real job, and what did it teach you about yourself?',
  },
  {
    dimension: 'story',
    facet: 'places lived',
    cues: ['village', 'city', 'town', 'neighbourhood', 'neighborhood', 'lived in', 'home town'],
    question: 'Which place has felt most like home, and what does it smell and sound like?',
  },
  {
    dimension: 'people',
    facet: 'family',
    cues: ['mother', 'father', 'mom', 'dad', 'sister', 'brother', 'grand', 'family'],
    question: 'What is a family tradition you hope never dies out?',
  },
  {
    dimension: 'people',
    facet: 'friends',
    cues: ['friend', 'buddy', 'best friend'],
    question: 'Tell me about a friend who showed up for you when it was hard.',
  },
  {
    dimension: 'people',
    facet: 'partners',
    cues: ['wife', 'husband', 'partner', 'spouse', 'girlfriend', 'boyfriend', 'married', 'love'],
    question: 'How did you meet the person you love most, and what did you notice first?',
  },
  {
    dimension: 'people',
    facet: 'mentors',
    cues: ['mentor', 'taught me', 'coach', 'guru', 'role model'],
    question: 'Who believed in you before you believed in yourself?',
  },
  {
    dimension: 'values',
    facet: 'lines you would not cross',
    cues: ['never lie', 'would never', 'wrong to', 'integrity', 'honest'],
    question: 'Where is your line between a white lie and a lie that matters?',
  },
  {
    dimension: 'emotions',
    facet: 'regret',
    cues: ['regret', 'wish i had', 'wish i had not', 'should have', 'mistake'],
    question: 'If you could redo one decision, which would it be, and what would you do instead?',
  },
  {
    dimension: 'emotions',
    facet: 'grief',
    cues: ['died', 'passed away', 'funeral', 'grief', 'lost my', 'miss her', 'miss him'],
    question: 'Who do you miss, and what would you say to them if you had ten minutes?',
  },
  {
    dimension: 'emotions',
    facet: 'fear',
    cues: ['afraid', 'scared', 'fear', 'anxious', 'worry'],
    question: 'What did you fear as a child, and what do you fear now?',
  },
  {
    dimension: 'tastes',
    facet: 'places',
    cues: ['favorite place', 'favourite place', 'beach', 'mountain', 'garden', 'travel'],
    question: 'Describe a place you could go back to a hundred times.',
  },
  {
    dimension: 'tastes',
    facet: 'food',
    cues: ['food', 'cook', 'recipe', 'dinner', 'breakfast', 'dish'],
    question: 'What recipe would you want your family to keep making after you?',
  },
  {
    dimension: 'legacy',
    facet: 'advice for loved ones',
    cues: ['advice', 'tell my', 'remember this', 'my children', 'grandchildren'],
    question: 'What is the one piece of advice you wish someone had given you at twenty?',
  },
  {
    dimension: 'legacy',
    facet: 'unfinished dreams',
    cues: ['dream', 'someday', 'one day i', 'bucket list', 'wish to'],
    question: 'What would you start tomorrow if you knew it would work?',
  },
  {
    dimension: 'decisions',
    facet: 'mistakes and lessons',
    cues: ['learned', 'lesson', 'mistake', 'failed', 'failure'],
    question: 'Tell me about a failure that turned out to be a gift.',
  },
];

/** Plain questions from the dimension banks, plus the facet questions, as one list. */
export interface Candidate extends Partial<Pick<FacetQuestion, 'facet' | 'cues'>> {
  dimension: DimensionId;
  question: string;
}

const candidates = (): Candidate[] => [
  ...FACET_QUESTIONS,
  ...DIMENSIONS.flatMap((d) => d.questions.map((question) => ({ dimension: d.id, question }))),
];

const covers = (a: Archive, cues: string[]) =>
  a.memories.some((m) => {
    const t = m.text.toLowerCase();
    return cues.some((c) => t.includes(c));
  });

export interface FacetGap {
  dimension: DimensionId;
  facet: string;
  covered: boolean;
}

/** Which facets of the capture map the person's own memories already touch. */
export function facetGaps(a: Archive): FacetGap[] {
  return FACET_QUESTIONS.map((f) => ({
    dimension: f.dimension,
    facet: f.facet,
    covered: covers(a, f.cues),
  }));
}

export interface Question {
  dimension: DimensionId;
  question: string;
  facet?: string;
}

/**
 * Next question: weakest dimension first; inside it, questions for uncovered facets,
 * then general questions, then facets already covered. Never repeats a question.
 */
export function nextQuestion(a: Archive): Question | null {
  const asked = new Set((a.interview ?? []).map((q) => q.question));
  const all = candidates();
  const rank = (c: Candidate) => (c.cues ? (covers(a, c.cues) ? 2 : 0) : 1);
  const ranked = coverage(a).dimensions.sort((x, y) => x.score - y.score);
  for (const dim of ranked) {
    const pool = all
      .filter((c) => c.dimension === dim.id && !asked.has(c.question))
      .map((c, i) => ({ c, i }))
      .sort((x, y) => rank(x.c) - rank(y.c) || x.i - y.i);
    const pick = pool[0]?.c;
    if (pick)
      return {
        dimension: pick.dimension,
        question: pick.question,
        ...(pick.facet ? { facet: pick.facet } : {}),
      };
  }
  return null;
}

/** How far along the interview is: questions asked out of everything in the bank. */
export function progress(a: Archive): { asked: number; total: number } {
  const bank = new Set(candidates().map((c) => c.question));
  const asked = new Set((a.interview ?? []).map((q) => q.question));
  return { asked: [...asked].filter((q) => bank.has(q)).length, total: bank.size };
}
