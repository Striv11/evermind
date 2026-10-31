/**
 * The capture map: what "all of a person" means in Evermind. Twelve dimensions,
 * each with facets and a question bank. Coverage is measured per dimension so
 * the interviewer always works on the biggest gap.
 */
import type { Theme } from '../insight/themes';

export interface Dimension {
  id: DimensionId;
  label: string;
  why: string;
  facets: string[];
  /** Memory themes that count as evidence for this dimension. */
  themes: Theme[];
  /** Evidence units needed to call the dimension well covered. */
  target: number;
  questions: string[];
}

export type DimensionId =
  | 'story'
  | 'people'
  | 'values'
  | 'beliefs'
  | 'opinions'
  | 'personality'
  | 'emotions'
  | 'humor'
  | 'voice'
  | 'decisions'
  | 'tastes'
  | 'legacy';

export const DIMENSIONS: Dimension[] = [
  {
    id: 'story',
    label: 'Life story',
    why: 'The chapters of your life, in order, with places and turning points.',
    facets: [
      'childhood',
      'school years',
      'leaving home',
      'work life',
      'turning points',
      'places lived',
    ],
    themes: ['childhood', 'learning', 'work', 'places'],
    target: 24,
    questions: [
      'What is your earliest memory? Where were you and who was there?',
      'Describe the house you grew up in, room by room.',
      'What was a turning point that changed the direction of your life?',
      'What were you like as a teenager, and what did you care about?',
      'Tell me about the first time you lived away from home.',
      'What chapter of your life are you in right now, and how did you get here?',
    ],
  },
  {
    id: 'people',
    label: 'People',
    why: 'Who matters to you, how you met, and what each of them means to you.',
    facets: ['family', 'partners', 'friends', 'mentors', 'people you lost', 'people you hurt'],
    themes: ['family', 'love', 'friends'],
    target: 20,
    questions: [
      'Describe your mother or father the way only you could.',
      'Who is your oldest friend, and what is a story only the two of you know?',
      'Who taught you the most, and what did they teach you?',
      'Is there someone you lost touch with that you think about?',
      'Tell me about the people you love most and what you would want them to know.',
    ],
  },
  {
    id: 'values',
    label: 'Values',
    why: 'What you will and will not do, and why.',
    facets: [
      'what matters most',
      'lines you would not cross',
      'what you admire',
      'what you despise',
    ],
    themes: ['beliefs', 'advice'],
    target: 10,
    questions: [
      'What matters most to you in life, in order?',
      'What is something you would never do, even if nobody found out?',
      'What do you admire most in other people? What do you have no patience for?',
      'When have you stood up for something at a cost to yourself?',
    ],
  },
  {
    id: 'beliefs',
    label: 'Beliefs',
    why: 'How you think the world works: meaning, faith, fate, people.',
    facets: ['meaning of life', 'faith and spirituality', 'human nature', 'death'],
    themes: ['beliefs'],
    target: 8,
    questions: [
      'Do you believe in God, fate or karma? How did you come to believe that?',
      'Are people basically good? What made you think so?',
      'What do you think happens when we die?',
      'What gives your life meaning?',
    ],
  },
  {
    id: 'opinions',
    label: 'Opinions',
    why: 'Your stances on big and small things, so your twin can react like you to new questions.',
    facets: ['work and money', 'technology', 'society', 'relationships', 'education', 'hot takes'],
    themes: ['work', 'learning'],
    target: 14,
    questions: [
      'What is an opinion you hold that most people around you disagree with?',
      'What do you think about money: how much is enough, and what is it for?',
      'How do you feel about technology and AI changing the world?',
      'What would you change about how children are raised or educated?',
      'What makes a relationship last, in your view?',
    ],
  },
  {
    id: 'personality',
    label: 'Personality',
    why: 'Your temperament: how social, organized, curious, calm and agreeable you are.',
    facets: [
      'energy with people',
      'order vs spontaneity',
      'curiosity',
      'stress response',
      'conflict style',
    ],
    themes: [],
    target: 10,
    questions: [
      'After a long week, do you recharge with people or alone? Describe a perfect weekend.',
      'Are you a planner or do you go with the flow? Give me a recent example.',
      'How do you behave when you are stressed? What do people notice first?',
      'When someone disagrees with you strongly, what do you usually do?',
      'What do you get curious about that others find boring?',
    ],
  },
  {
    id: 'emotions',
    label: 'Emotional life',
    why: 'What moves you, what scares you, how you show and hide feelings.',
    facets: ['joy', 'fear', 'anger', 'grief', 'pride', 'regret'],
    themes: ['fears', 'health'],
    target: 12,
    questions: [
      'When were you happiest? Describe that moment in detail.',
      'What are you most afraid of, deep down?',
      'Tell me about a loss that changed you.',
      'What makes you angry faster than anything else?',
      'What do you regret, and what would you say about it now?',
    ],
  },
  {
    id: 'humor',
    label: 'Humor',
    why: 'What you find funny and how you joke; without it a twin feels hollow.',
    facets: ['what makes you laugh', 'how you tease', 'favorite jokes and stories'],
    themes: [],
    target: 6,
    questions: [
      'Tell me the funniest thing that ever happened to you.',
      'What kind of jokes do you make with your closest friends?',
      'Who is the funniest person you know, and why?',
    ],
  },
  {
    id: 'voice',
    label: 'How you talk',
    why: 'Your words, rhythm, catchphrases and languages; captured from everything you say.',
    facets: [
      'catchphrases',
      'languages you mix',
      'how you greet and sign off',
      'swearing and slang',
    ],
    themes: [],
    target: 40,
    questions: [
      'Talk freely for two minutes about your day, exactly the way you would to a close friend.',
      'What phrases do people tease you for saying all the time?',
    ],
  },
  {
    id: 'decisions',
    label: 'Decisions',
    why: 'How you choose, so your twin can advise like you would.',
    facets: [
      'big decisions you made',
      'how you weigh risk',
      'gut vs analysis',
      'mistakes and lessons',
    ],
    themes: ['advice', 'work'],
    target: 8,
    questions: [
      'Walk me through the biggest decision you ever made. What did you weigh?',
      'Do you trust your gut or think things through? When has each failed you?',
      'If a younger version of you asked whether to take a big risk, what would you ask them first?',
    ],
  },
  {
    id: 'tastes',
    label: 'Tastes',
    why: 'Food, music, films, places, small rituals: the texture of being you.',
    facets: ['food', 'music', 'books and films', 'places', 'daily rituals'],
    themes: ['places'],
    target: 8,
    questions: [
      'What food means home to you, and who made it best?',
      'Which songs would be on the soundtrack of your life?',
      'Describe your perfect ordinary day, from waking to sleep.',
    ],
  },
  {
    id: 'legacy',
    label: 'Legacy',
    why: 'What you want to be remembered for, and what you want to pass on.',
    facets: [
      'advice for loved ones',
      'unfinished dreams',
      'how to be remembered',
      'messages to deliver later',
    ],
    themes: ['dreams', 'advice'],
    target: 8,
    questions: [
      'What do you want people to remember about you?',
      'What advice would you give your future children or grandchildren?',
      'What dream have you not achieved yet?',
      'If you could leave one message to be opened in 20 years, who is it for and what does it say?',
    ],
  },
];

export const dimension = (id: DimensionId): Dimension => DIMENSIONS.find((d) => d.id === id)!;
