import { tokenize } from './emotions';

/** Life areas used to sort memories. Order is the display order. */
export const THEMES = {
  childhood: [
    'child',
    'childhood',
    'kid',
    'school',
    'grew',
    'young',
    'little',
    'teenager',
    'playground',
    'toys',
    'bachpan',
  ],
  family: [
    'mother',
    'mom',
    'mum',
    'maa',
    'mummy',
    'father',
    'dad',
    'papa',
    'brother',
    'sister',
    'grandma',
    'grandmother',
    'grandpa',
    'grandfather',
    'nani',
    'nana',
    'dadi',
    'dada',
    'family',
    'parents',
    'uncle',
    'aunt',
    'cousin',
    'son',
    'daughter',
    'bhai',
    'didi',
  ],
  love: [
    'girlfriend',
    'boyfriend',
    'wife',
    'husband',
    'partner',
    'married',
    'wedding',
    'crush',
    'dating',
    'date',
    'relationship',
    'romance',
    'love',
  ],
  friends: ['friend', 'friends', 'buddy', 'mates', 'gang', 'dost', 'yaar', 'classmate', 'roommate'],
  work: [
    'work',
    'job',
    'career',
    'office',
    'boss',
    'startup',
    'company',
    'business',
    'project',
    'salary',
    'interview',
    'team',
    'client',
    'code',
    'coding',
    'founder',
  ],
  learning: [
    'college',
    'university',
    'exam',
    'exams',
    'study',
    'studied',
    'teacher',
    'class',
    'learned',
    'learn',
    'degree',
    'books',
    'book',
    'reading',
  ],
  health: [
    'health',
    'hospital',
    'sick',
    'ill',
    'doctor',
    'surgery',
    'gym',
    'running',
    'sleep',
    'body',
    'injury',
    'therapy',
  ],
  places: [
    'city',
    'village',
    'home',
    'house',
    'travel',
    'trip',
    'moved',
    'abroad',
    'country',
    'beach',
    'mountains',
    'train',
    'flight',
    'delhi',
    'mumbai',
    'bangalore',
    'bengaluru',
    'kolkata',
    'chennai',
    'hyderabad',
    'pune',
  ],
  beliefs: [
    'believe',
    'belief',
    'values',
    'god',
    'faith',
    'religion',
    'principle',
    'principles',
    'meaning',
    'purpose',
    'honest',
    'honesty',
    'kindness',
    'truth',
    'karma',
  ],
  fears: ['afraid', 'scared', 'fear', 'fears', 'anxious', 'worried', 'nightmare', 'phobia'],
  dreams: [
    'dream',
    'dreams',
    'goal',
    'goals',
    'someday',
    'future',
    'ambition',
    'want to',
    'bucket',
    'aspire',
  ],
  advice: [
    'advice',
    'lesson',
    'lessons',
    'learned that',
    'always remember',
    'never forget',
    'my advice',
    'if you',
    'promise me',
    'should always',
  ],
} as const;

export type Theme = keyof typeof THEMES;
export const THEME_LABELS: Record<Theme, string> = {
  childhood: 'Childhood',
  family: 'Family',
  love: 'Love & partners',
  friends: 'Friends',
  work: 'Work & ambition',
  learning: 'Learning',
  health: 'Health & body',
  places: 'Places & travel',
  beliefs: 'Beliefs & values',
  fears: 'Fears',
  dreams: 'Dreams & goals',
  advice: 'Advice & lessons',
};

/** Themes mentioned at least once, strongest first. */
export function classifyThemes(text: string): Theme[] {
  const tokens = tokenize(text);
  const joined = ` ${tokens.join(' ')} `;
  const scores: [Theme, number][] = [];
  for (const [theme, words] of Object.entries(THEMES) as [Theme, readonly string[]][]) {
    let n = 0;
    for (const w of words) {
      if (w.includes(' ')) n += joined.split(` ${w} `).length - 1;
      else for (const t of tokens) if (t === w) n++;
    }
    if (n > 0) scores.push([theme, n]);
  }
  return scores.sort((a, b) => b[1] - a[1]).map(([t]) => t);
}

const RELATIONS = new Set([
  'mother',
  'mom',
  'mum',
  'maa',
  'father',
  'dad',
  'papa',
  'brother',
  'sister',
  'grandma',
  'grandmother',
  'grandpa',
  'grandfather',
  'nani',
  'nana',
  'dadi',
  'dada',
  'wife',
  'husband',
  'son',
  'daughter',
  'uncle',
  'aunt',
  'cousin',
  'friend',
  'boss',
  'teacher',
  'girlfriend',
  'boyfriend',
  'partner',
]);
const NOT_NAMES = new Set([
  'I',
  'I’m',
  "I'm",
  'The',
  'A',
  'An',
  'And',
  'But',
  'So',
  'Then',
  'When',
  'We',
  'My',
  'He',
  'She',
  'They',
  'It',
  'This',
  'That',
  'There',
  'Yes',
  'No',
  'Oh',
  'Okay',
  'OK',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
  'God',
  'English',
  'Hindi',
  'India',
]);

export interface PersonMention {
  name: string;
  relation?: string;
}

/**
 * People mentioned: relation phrases ("my mother", "my friend Rahul") and
 * capitalized names that do not start a sentence.
 */
export function extractPeople(text: string): PersonMention[] {
  const out = new Map<string, PersonMention>();
  const rel = /\b[Mm]y\s+(\w+)(?:\s+([A-Z][a-z]+))?/g;
  for (const m of text.matchAll(rel)) {
    const relation = m[1]!.toLowerCase();
    if (!RELATIONS.has(relation)) continue;
    const name = m[2] && !NOT_NAMES.has(m[2]) ? m[2] : `my ${relation}`;
    out.set(name.toLowerCase(), { name, relation });
  }
  for (const m of text.matchAll(/(?<![.!?]\s|^)\b([A-Z][a-z]{2,})\b/g)) {
    const name = m[1]!;
    if (NOT_NAMES.has(name) || out.has(name.toLowerCase())) continue;
    if (Object.values(THEMES).some((ws) => (ws as readonly string[]).includes(name.toLowerCase())))
      continue;
    out.set(name.toLowerCase(), { name });
  }
  return [...out.values()];
}

/**
 * Best-effort date for a memory: an explicit year ("in 2014"), or an age
 * ("when I was 12") resolved against the birth year, else the fallback.
 */
export function extractDate(text: string, fallback: string, birthYear?: number): string {
  const year = text.match(/\b(19[4-9]\d|20[0-4]\d)\b/);
  if (year) return `${year[1]}-01-01`;
  // Speech recognizers usually write small numbers as words ("when I was eight").
  const age = text.match(
    new RegExp(
      `\\b(?:when i was|at age|aged|i was)\\s+(\\d{1,2}|${Object.keys(AGES).join('|')})\\b`,
      'i',
    ),
  );
  if (age && birthYear) {
    const n = /^\d+$/.test(age[1]!) ? Number(age[1]) : AGES[age[1]!.toLowerCase()]!;
    return `${birthYear + n}-01-01`;
  }
  return fallback;
}

const AGES: Record<string, number> = Object.fromEntries(
  'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty'
    .split(' ')
    .map((w, i) => [w, i + 1]),
);
