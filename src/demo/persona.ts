import { AI_DISCLOSURE, ARCHIVE_FORMAT, ARCHIVE_VERSION, type Archive } from '../archive/schema';

/**
 * "Wren Calloway" is entirely fictional: a made-up retired lighthouse keeper turned beekeeper.
 * Any resemblance to a real person is coincidental. Used for demo mode and tests.
 */
export function demoArchive(): Archive {
  const t = '2026-01-01T00:00:00Z';
  return {
    format: ARCHIVE_FORMAT,
    version: ARCHIVE_VERSION,
    createdAt: t,
    subject: { displayName: 'Wren Calloway (fictional)', isFictional: true },
    aiDisclosure: AI_DISCLOSURE,
    sources: [
      { id: 's-journal', kind: 'demo', label: 'Sample journal', importedAt: t },
      { id: 's-chat', kind: 'demo', label: 'Sample chat with Odile', importedAt: t },
      { id: 's-interview', kind: 'demo', label: 'Sample life interview', importedAt: t },
    ],
    people: [
      { id: 'p-odile', name: 'Odile', relation: 'sister' },
      { id: 'p-tam', name: 'Tam Reyes', relation: 'harbour-master, old friend' },
      { id: 'p-juno', name: 'Juno', relation: 'granddaughter' },
    ],
    memories: [
      {
        id: 'm1',
        date: '1971-06-14',
        text: 'First summer at Skerry Point. Odile and I raced up the 112 steps of the lighthouse every morning until the keeper, old Mr. Hale, started timing us with his pocket watch.',
        sourceId: 's-interview',
        people: ['p-odile'],
        place: 'Skerry Point',
        tags: ['childhood'],
      },
      {
        id: 'm2',
        date: '1983-11-02',
        text: 'Took the keeper post at Skerry Point. Hale handed me the brass key and said the light does not care how you feel, it only needs you to show up. I have tried to live by that.',
        sourceId: 's-journal',
        place: 'Skerry Point',
        tags: ['work', 'values'],
      },
      {
        id: 'm3',
        date: '1991-03-09',
        text: 'The great storm. Tam Reyes rowed out at midnight to help me hand-crank the lamp when the generator failed. We did not sleep for two days and never spoke of it again, which is how I knew we were friends.',
        sourceId: 's-journal',
        people: ['p-tam'],
        place: 'Skerry Point',
        tags: ['friendship'],
      },
      {
        id: 'm4',
        date: '1998-08-21',
        text: 'Regret: I missed Odile’s wedding because I would not leave the light for one night. Nobody would have died. I chose duty over my sister and I still wince about it.',
        sourceId: 's-interview',
        people: ['p-odile'],
        tags: ['regret'],
      },
      {
        id: 'm5',
        date: '2009-05-30',
        text: 'The light was automated today. Strange to be made redundant by a photocell. I walked the 112 steps one last time and counted every one.',
        sourceId: 's-journal',
        place: 'Skerry Point',
        tags: ['work', 'loss'],
      },
      {
        id: 'm6',
        date: '2012-04-15',
        text: 'Bought four hives from a retiring farmer. Bees keep a strict schedule, like a lamp. I think that is why I took to them.',
        sourceId: 's-journal',
        tags: ['beekeeping'],
      },
      {
        id: 'm7',
        date: '2019-07-04',
        text: 'Juno’s first jar of honey, which she labelled "WREN’S BEST (MOSTLY JUNO’S)". I framed the label.',
        sourceId: 's-chat',
        people: ['p-juno'],
        tags: ['family', 'beekeeping'],
      },
      {
        id: 'm8',
        date: '2023-09-12',
        text: 'Told Odile I was sorry about the wedding, twenty-five years late. She laughed and said she had forgiven me in 1999 and was waiting for me to catch up.',
        sourceId: 's-chat',
        people: ['p-odile'],
        tags: ['regret', 'family'],
      },
    ],
    facts: [
      {
        id: 'f1',
        subject: 'Wren',
        predicate: 'worked as',
        object: 'lighthouse keeper at Skerry Point',
        confidence: 0.95,
        sourceIds: ['s-journal'],
      },
      {
        id: 'f2',
        subject: 'Wren',
        predicate: 'believes',
        object: 'showing up matters more than how you feel',
        confidence: 0.85,
        sourceIds: ['s-journal', 's-interview'],
      },
      {
        id: 'f3',
        subject: 'Wren',
        predicate: 'keeps',
        object: 'bees',
        confidence: 0.9,
        sourceIds: ['s-journal'],
      },
      {
        id: 'f4',
        subject: 'Wren',
        predicate: 'regrets',
        object: 'missing Odile’s wedding',
        confidence: 0.9,
        sourceIds: ['s-interview', 's-chat'],
      },
      {
        id: 'f5',
        subject: 'Odile',
        predicate: 'is sister of',
        object: 'Wren',
        confidence: 1,
        sourceIds: ['s-interview'],
      },
      {
        id: 'f6',
        subject: 'Tam Reyes',
        predicate: 'is friend of',
        object: 'Wren',
        confidence: 0.9,
        sourceIds: ['s-journal'],
      },
      {
        id: 'f7',
        subject: 'Wren',
        predicate: 'prefers',
        object: 'tea, strong, no sugar',
        confidence: 0.6,
        sourceIds: ['s-chat'],
      },
    ],
    voiceSamples: [
      {
        id: 'v1',
        text: 'Well, the tide waits for no one, and neither does the kettle. Come by Sunday?',
        sourceId: 's-chat',
        date: '2021-02-11',
      },
      {
        id: 'v2',
        text: 'Honestly? Do the dull thing well. The light never needed to be clever.',
        sourceId: 's-chat',
        date: '2022-06-03',
      },
      {
        id: 'v3',
        text: 'Bees are fine. Grumpy about the rain, same as me.',
        sourceId: 's-chat',
        date: '2023-10-19',
      },
    ],
    capsules: [
      {
        id: 'c1',
        createdAt: '2026-01-01T00:00:00Z',
        unlockAt: '2040-07-04T00:00:00Z',
        to: 'Juno',
        body: 'Fictional sample capsule: by now you will have labelled a thousand jars. Keep the first label framed.',
      },
    ],
    attachments: [],
  };
}
