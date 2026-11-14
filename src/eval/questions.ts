/**
 * Eval set for the demo persona (src/demo/persona.ts). In-scope questions name the one memory that
 * answers them; out-of-scope questions must be abstained on. Written by hand, paraphrasing rather
 * than copying memory text, and mixing direct, indirect and "why/how did it feel" phrasings.
 */
export interface InScope {
  q: string;
  memoryId: string;
}

export const IN_SCOPE: InScope[] = [
  // m1: childhood race up the lighthouse
  { q: 'Who timed you running up the lighthouse stairs?', memoryId: 'm1' },
  { q: 'What did you do with your sister as a child?', memoryId: 'm1' },
  { q: 'How many steps does the lighthouse have?', memoryId: 'm1' },
  { q: 'What was your first summer at Skerry Point like?', memoryId: 'm1' },
  { q: 'Who was Mr. Hale and what did his pocket watch do?', memoryId: 'm1' },
  { q: 'What did you and Odile race every morning?', memoryId: 'm1' },
  // m2: keeper post, brass key
  { q: 'What advice did the old keeper give about showing up?', memoryId: 'm2' },
  { q: 'Who gave you the brass key?', memoryId: 'm2' },
  { q: 'When did you take the keeper post?', memoryId: 'm2' },
  { q: 'What does the light not care about?', memoryId: 'm2' },
  { q: 'What principle have you tried to live by?', memoryId: 'm2' },
  { q: 'What did Hale hand you on your first day as keeper?', memoryId: 'm2' },
  // m3: the great storm
  { q: 'When did the generator fail?', memoryId: 'm3' },
  { q: 'Which friend rowed out at midnight?', memoryId: 'm3' },
  { q: 'Tell me about the great storm.', memoryId: 'm3' },
  { q: 'How did you keep the lamp turning without power?', memoryId: 'm3' },
  { q: 'How long did you go without sleep after the storm?', memoryId: 'm3' },
  { q: 'How did you know Tam Reyes was a real friend?', memoryId: 'm3' },
  // m4: missed the wedding
  { q: 'What do you regret about the wedding?', memoryId: 'm4' },
  { q: 'Why did you choose duty over family?', memoryId: 'm4' },
  { q: 'Why did you miss your sister’s wedding?', memoryId: 'm4' },
  { q: 'What do you still wince about?', memoryId: 'm4' },
  { q: 'Would anyone have died if you left the light for one night?', memoryId: 'm4' },
  { q: 'What is your biggest regret?', memoryId: 'm4' },
  // m5: automation
  { q: 'How did it feel when the lighthouse was automated?', memoryId: 'm5' },
  { q: 'What replaced you with a photocell?', memoryId: 'm5' },
  { q: 'What did you do on your last day at the light?', memoryId: 'm5' },
  { q: 'When were you made redundant?', memoryId: 'm5' },
  { q: 'Did you count the steps one last time?', memoryId: 'm5' },
  { q: 'What happened to your job when the light became automatic?', memoryId: 'm5' },
  // m6: bees
  { q: 'Where did you get your hives?', memoryId: 'm6' },
  { q: 'Why did you take to keeping bees?', memoryId: 'm6' },
  { q: 'How many hives did you buy?', memoryId: 'm6' },
  { q: 'What do bees have in common with a lamp?', memoryId: 'm6' },
  { q: 'Who sold you your first beehives?', memoryId: 'm6' },
  { q: 'When did you start beekeeping?', memoryId: 'm6' },
  // m7: Juno's honey
  { q: 'What was written on the first honey jar label?', memoryId: 'm7' },
  { q: 'What did Juno make?', memoryId: 'm7' },
  { q: 'What did you do with the honey jar label?', memoryId: 'm7' },
  { q: 'Tell me about your granddaughter’s first jar of honey.', memoryId: 'm7' },
  { q: 'Whose best honey is it, mostly?', memoryId: 'm7' },
  { q: 'Did you frame anything from Juno?', memoryId: 'm7' },
  // m8: apology to Odile
  { q: 'When did you apologise to Odile?', memoryId: 'm8' },
  { q: 'Had your sister forgiven you long ago?', memoryId: 'm8' },
  { q: 'How did Odile react when you said sorry?', memoryId: 'm8' },
  { q: 'How many years late was your apology?', memoryId: 'm8' },
  { q: 'When had Odile forgiven you?', memoryId: 'm8' },
  { q: 'Did you ever tell your sister you were sorry?', memoryId: 'm8' },
];

/** Questions the persona's memories cannot answer. */
export const OUT_OF_SCOPE: string[] = [
  'What is your favourite programming language?',
  'How do you feel about cryptocurrency?',
  'Who won the football world cup?',
  'What is the capital of Mongolia?',
  'Describe your experience at university studying physics.',
  'What car do you drive?',
  'Do you like skiing in the Alps?',
  'Tell me about your job at the bank.',
  'What is the square root of 144?',
  'Which political party do you vote for?',
  'What did you eat for breakfast this morning?',
  'Have you ever been to Tokyo?',
  'What is your opinion on electric scooters?',
  'Who is your favourite film director?',
  'How do I install Python on Windows?',
  'What medication do you take?',
  'Where did you go to high school?',
  'Do you play the violin?',
  'What do you think of social media?',
  'How tall is Mount Everest?',
];
