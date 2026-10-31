import type { Emotion, EmotionScore } from '../archive/schema';

/**
 * Lexicon-based emotion scoring. Deterministic and fast, so it always runs; an
 * optional on-device model (see model.ts) can refine it. Handles simple negation
 * ("not happy") and intensifiers ("really scared").
 */
const LEXICON: Record<Exclude<Emotion, 'neutral'>, string[]> = {
  joy: [
    'happy',
    'happiest',
    'joy',
    'fun',
    'laugh',
    'laughed',
    'laughing',
    'excited',
    'amazing',
    'wonderful',
    'great',
    'best',
    'delighted',
    'smile',
    'smiled',
    'celebrate',
    'celebrated',
    'enjoy',
    'enjoyed',
    'thrilled',
    'awesome',
    'cheerful',
    'khush',
    'maza',
  ],
  love: [
    'love',
    'loved',
    'loving',
    'adore',
    'dear',
    'darling',
    'hug',
    'hugged',
    'kiss',
    'care',
    'cared',
    'caring',
    'close',
    'together',
    'affection',
    'heart',
    'pyaar',
    'pyar',
  ],
  gratitude: [
    'grateful',
    'thankful',
    'thanks',
    'thank',
    'blessed',
    'lucky',
    'appreciate',
    'appreciated',
    'fortunate',
    'shukriya',
    'dhanyavad',
  ],
  pride: [
    'proud',
    'achieved',
    'accomplished',
    'won',
    'win',
    'succeeded',
    'success',
    'earned',
    'built',
    'topped',
    'award',
    'promoted',
    'graduated',
  ],
  hope: [
    'hope',
    'hoping',
    'dream',
    'dreams',
    'wish',
    'someday',
    'future',
    'believe',
    'optimistic',
    'looking forward',
    'plan',
    'aspire',
    'goal',
  ],
  nostalgia: [
    'remember',
    'remembered',
    'childhood',
    'used to',
    'back then',
    'those days',
    'old days',
    'miss',
    'missed',
    'grew up',
    'when i was',
    'memories',
    'yaad',
  ],
  sadness: [
    'sad',
    'cry',
    'cried',
    'crying',
    'tears',
    'lonely',
    'alone',
    'lost',
    'loss',
    'died',
    'death',
    'passed away',
    'grief',
    'heartbroken',
    'depressed',
    'hurt',
    'broke',
    'pain',
    'empty',
    'dukh',
  ],
  fear: [
    'afraid',
    'scared',
    'fear',
    'terrified',
    'anxious',
    'anxiety',
    'worried',
    'worry',
    'nervous',
    'panic',
    'frightened',
    'unsafe',
    'darr',
    'dar',
  ],
  anger: [
    'angry',
    'mad',
    'furious',
    'hate',
    'hated',
    'annoyed',
    'frustrated',
    'unfair',
    'rage',
    'fight',
    'fought',
    'shouted',
    'yelled',
    'betrayed',
    'gussa',
  ],
  regret: [
    'regret',
    'regrets',
    'should have',
    'wish i had',
    "shouldn't have",
    'mistake',
    'mistakes',
    'sorry',
    'if only',
    'guilt',
    'guilty',
    'ashamed',
    'never told',
  ],
};

const NEGATORS = new Set([
  'not',
  'no',
  'never',
  "didn't",
  "don't",
  "wasn't",
  "isn't",
  'wasnt',
  'didnt',
  'dont',
  'nahi',
  'nahin',
]);
const INTENSIFIERS = new Set([
  'very',
  'really',
  'so',
  'extremely',
  'truly',
  'deeply',
  'incredibly',
  'bahut',
]);

export function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
}

/** Scores sum to 1 across the returned labels; strongest first. Empty signal -> neutral. */
export function scoreEmotions(text: string, arousal?: number): EmotionScore[] {
  const tokens = tokenize(text);
  const raw = new Map<Emotion, number>();
  const add = (e: Emotion, w: number) => raw.set(e, (raw.get(e) ?? 0) + w);

  for (const [emotion, words] of Object.entries(LEXICON) as [Emotion, string[]][]) {
    for (const w of words) {
      const parts = w.split(' ');
      for (let i = 0; i + parts.length <= tokens.length; i++) {
        if (!parts.every((p, k) => tokens[i + k] === p)) continue;
        const window = tokens.slice(Math.max(0, i - 3), i);
        const negated = window.some((t) => NEGATORS.has(t));
        const boost = window.some((t) => INTENSIFIERS.has(t)) ? 1.5 : 1;
        // "not happy" reads as mild sadness; other negations just cancel the cue.
        if (negated) {
          if (emotion === 'joy') add('sadness', 0.5);
        } else add(emotion, boost * (parts.length > 1 ? 1.25 : 1));
      }
    }
  }

  // Tone of voice: high arousal amplifies intense emotions, low arousal the quiet ones.
  if (arousal !== undefined && raw.size > 0) {
    for (const [e, v] of raw) {
      const intense = e === 'anger' || e === 'fear' || e === 'joy' || e === 'pride';
      const quiet = e === 'sadness' || e === 'nostalgia' || e === 'regret';
      const k = intense ? 0.5 + arousal : quiet ? 1.5 - arousal : 1;
      raw.set(e, v * k);
    }
  }

  const total = [...raw.values()].reduce((a, b) => a + b, 0);
  if (total === 0) return [{ label: 'neutral', score: 1 }];
  return [...raw.entries()]
    .map(([label, v]) => ({ label, score: round(v / total) }))
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
}

const round = (x: number) => Math.round(x * 1000) / 1000;

/** Merge two distributions (e.g. lexicon and model) with weight `w` on `b`. */
export function blend(a: EmotionScore[], b: EmotionScore[], w: number): EmotionScore[] {
  const m = new Map<Emotion, number>();
  for (const { label, score } of a) m.set(label, (m.get(label) ?? 0) + score * (1 - w));
  for (const { label, score } of b) m.set(label, (m.get(label) ?? 0) + score * w);
  const total = [...m.values()].reduce((x, y) => x + y, 0) || 1;
  return [...m.entries()]
    .map(([label, v]) => ({ label, score: round(v / total) }))
    .filter((e) => e.score >= 0.01)
    .sort((x, y) => y.score - x.score || x.label.localeCompare(y.label));
}

export function dominant(emotions: EmotionScore[] | undefined): Emotion {
  return emotions?.[0]?.label ?? 'neutral';
}
