import type { Archive, EmotionScore, EpisodicMemory, Person, SourceKind } from '../archive/schema';
import { prosody, type Prosody } from '../audio/features';
import { scoreEmotions, tokenize } from './emotions';
import { classifyThemes, extractDate, extractPeople } from './themes';

/** One timestamped piece of a transcript, as produced by the speech recognizer. */
export interface TranscriptChunk {
  text: string;
  start: number; // seconds
  end: number;
}

export interface AudioInput {
  fileName: string;
  /** Defaults to "audio"; typed interview answers use "typed". */
  kind?: SourceKind;
  recordedAt: string; // ISO date, used when the speech names no date
  chunks: TranscriptChunk[];
  /** Mono PCM of the whole recording; enables tone-of-voice analysis. */
  pcm?: Float32Array;
  sampleRate?: number;
}

export interface Passage {
  text: string;
  start: number;
  end: number;
}

/**
 * Group recognizer chunks into memory-sized passages: close a passage at a long
 * pause, or at a sentence end once it is long enough, or when it gets too long.
 */
export function segment(chunks: TranscriptChunk[], minWords = 35, maxWords = 140): Passage[] {
  const out: Passage[] = [];
  let cur: Passage | null = null;
  let words = 0;
  const flush = () => {
    if (cur && cur.text.trim()) out.push({ ...cur, text: cur.text.trim().replace(/\s+/g, ' ') });
    cur = null;
    words = 0;
  };
  for (const c of chunks) {
    const t = c.text.trim();
    if (!t) continue;
    if (cur && c.start - cur.end > 2.5 && words >= 8) flush();
    if (!cur) cur = { text: '', start: c.start, end: c.end };
    cur.text += ' ' + t;
    cur.end = c.end;
    words += tokenize(t).length;
    if ((words >= minWords && /[.!?]["')\]]?$/.test(t)) || words >= maxWords) flush();
  }
  flush();
  // Fold a tiny trailing passage into the previous one.
  if (out.length > 1 && tokenize(out.at(-1)!.text).length < 8) {
    const last = out.pop()!;
    const prev = out.at(-1)!;
    prev.text += ' ' + last.text;
    prev.end = last.end;
  }
  return out;
}

export interface IngestOptions {
  birthYear?: number;
  now?: Date;
  /** Optional model-based emotion scores per passage text (see model.ts). */
  refine?: (text: string, lexicon: EmotionScore[]) => EmotionScore[];
}

export interface IngestResult {
  archive: Archive;
  memories: EpisodicMemory[];
  overall: Prosody | null;
}

let counter = 0;
const uid = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/** Turn one transcribed recording into sorted memories and add them to a copy of the archive. */
export function ingestAudio(
  archive: Archive,
  input: AudioInput,
  opts: IngestOptions = {},
): IngestResult {
  const now = opts.now ?? new Date();
  const sourceId = uid('src');
  const people = [...archive.people];
  const personId = (name: string, relation?: string): string => {
    const found = people.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (found) return found.id;
    const p: Person = { id: uid('person'), name, ...(relation ? { relation } : {}) };
    people.push(p);
    return p.id;
  };

  const passages = segment(input.chunks);
  const sr = input.sampleRate ?? 16000;
  const memories: EpisodicMemory[] = passages.map((p) => {
    const words = tokenize(p.text).length;
    const slice = input.pcm?.subarray(Math.floor(p.start * sr), Math.ceil(p.end * sr));
    const tone = slice && slice.length > sr * 0.5 ? prosody(slice, sr, words) : null;
    let emotions = scoreEmotions(p.text, tone?.arousal);
    if (opts.refine) emotions = opts.refine(p.text, emotions);
    const mentions = extractPeople(p.text);
    return {
      id: uid('mem'),
      date: extractDate(p.text, input.recordedAt, opts.birthYear),
      text: p.text,
      sourceId,
      emotions: emotions.slice(0, 3),
      themes: classifyThemes(p.text).slice(0, 3),
      ...(input.kind && input.kind !== 'audio'
        ? {}
        : { span: { start: round2(p.start), end: round2(p.end) } }),
      ...(mentions.length ? { people: mentions.map((m) => personId(m.name, m.relation)) } : {}),
    };
  });

  const overall =
    input.pcm && input.pcm.length > sr
      ? prosody(
          input.pcm,
          sr,
          input.chunks.reduce((n, c) => n + tokenize(c.text).length, 0),
        )
      : null;

  return {
    memories,
    overall,
    archive: {
      ...archive,
      sources: [
        ...archive.sources,
        {
          id: sourceId,
          kind: input.kind ?? 'audio',
          label: input.fileName,
          importedAt: now.toISOString(),
        },
      ],
      people,
      memories: [...archive.memories, ...memories],
      // Speech is the subject's own words, so every passage also trains the style model.
      voiceSamples: [
        ...archive.voiceSamples,
        ...memories.map((m) => ({ id: uid('voice'), text: m.text, sourceId, date: m.date })),
      ],
    },
  };
}

const round2 = (x: number) => Math.round(x * 100) / 100;
