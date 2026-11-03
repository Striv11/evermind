import type { Archive, EpisodicMemory, Person } from '../archive/schema';
import { scoreEmotions, tokenize } from '../insight/emotions';
import { classifyThemes, extractDate, extractPeople } from '../insight/themes';
import type { ChatMessage } from './chat';
import { ImportError, parseDocument, type ParsedEntry } from './markdown';

export interface ImportFile {
  name: string;
  content: string;
}

export interface ImportOptions {
  now?: Date;
  birthYear?: number;
  /** Long entries are split on paragraph breaks into passages of about this many words. */
  maxWords?: number;
}

export interface ImportReport {
  archive: Archive;
  added: number;
  /** One line per file that could not be imported. */
  errors: string[];
  /** Entries that had no date anywhere and were given the import date. */
  undated: number;
}

let counter = 0;
const uid = (p: string) =>
  `${p}-${Date.now().toString(36)}-${(counter++).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/** Split text into paragraph-aligned passages no longer than maxWords (a single huge paragraph stays whole). */
export function chunkText(text: string, maxWords = 160): string[] {
  const out: string[] = [];
  let cur: string[] = [];
  let n = 0;
  for (const para of text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)) {
    const w = tokenize(para).length;
    if (cur.length && n + w > maxWords) {
      out.push(cur.join('\n\n'));
      cur = [];
      n = 0;
    }
    cur.push(para);
    n += w;
  }
  if (cur.length) out.push(cur.join('\n\n'));
  return out;
}

/** Parse each file and add its entries as memories (and the text as voice samples) to a copy of the archive. */
export function importDocuments(
  archive: Archive,
  files: ImportFile[],
  opts: ImportOptions = {},
): ImportReport {
  const now = opts.now ?? new Date();
  const today = now.toISOString().slice(0, 10);
  const people: Person[] = [...archive.people];
  const personId = (name: string, relation?: string) => {
    const found = people.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (found) return found.id;
    const p: Person = { id: uid('person'), name, ...(relation ? { relation } : {}) };
    people.push(p);
    return p.id;
  };

  const sources = [...archive.sources];
  const memories: EpisodicMemory[] = [];
  const voice = [...archive.voiceSamples];
  const errors: string[] = [];
  let undated = 0;

  for (const f of files) {
    let entries: ParsedEntry[];
    try {
      entries = parseDocument(f.name, f.content);
    } catch (e) {
      if (!(e instanceof ImportError)) throw e;
      errors.push(e.message);
      continue;
    }
    const sourceId = uid('src');
    sources.push({ id: sourceId, kind: 'markdown', label: f.name, importedAt: now.toISOString() });
    for (const e of entries) {
      if (!e.date) undated++;
      const baseDate = e.date ?? today;
      for (const part of chunkText(e.text, opts.maxWords)) {
        const mentions = extractPeople(part);
        // A year spoken inside an undated entry is still better than the import date.
        const date = e.date ? baseDate : extractDate(part, baseDate, opts.birthYear);
        memories.push({
          id: uid('mem'),
          date,
          text: part,
          sourceId,
          emotions: scoreEmotions(part).slice(0, 3),
          themes: classifyThemes(part).slice(0, 3),
          ...(e.tags.length ? { tags: e.tags } : {}),
          ...(mentions.length ? { people: mentions.map((m) => personId(m.name, m.relation)) } : {}),
        });
        voice.push({ id: uid('voice'), text: part, sourceId, date });
      }
    }
  }

  return {
    added: memories.length,
    errors,
    undated,
    archive: {
      ...archive,
      sources,
      people,
      memories: [...archive.memories, ...memories],
      voiceSamples: voice,
    },
  };
}

export interface ChatImportOptions extends ImportOptions {
  format: 'whatsapp' | 'telegram' | 'mbox';
  label: string;
  /** Own-author names (case-insensitive). Everyone else's messages are discarded. */
  self: string[];
  /** A day's messages become a memory only if they total at least this many words. */
  minMemoryWords?: number;
}

/**
 * Keep only the selected author's messages. Every message is a voice sample; days with enough
 * writing also become memories. Other people's words never enter the archive.
 */
export function importChat(
  archive: Archive,
  messages: ChatMessage[],
  opts: ChatImportOptions,
): ImportReport {
  const now = opts.now ?? new Date();
  const mine = new Set(opts.self.map((s) => s.toLowerCase()));
  const own = messages.filter((m) => mine.has(m.author.toLowerCase()));
  if (!own.length) {
    return {
      archive,
      added: 0,
      undated: 0,
      errors: [`${opts.label}: no messages by the selected author.`],
    };
  }
  const sourceId = uid('src');
  const voice = [...archive.voiceSamples];
  const byDay = new Map<string, string[]>();
  for (const m of own) {
    voice.push({ id: uid('voice'), text: m.text, sourceId, date: m.date });
    byDay.set(m.date, [...(byDay.get(m.date) ?? []), m.text]);
  }
  const people: Person[] = [...archive.people];
  const memories: EpisodicMemory[] = [];
  const min = opts.minMemoryWords ?? 25;
  for (const [date, lines] of [...byDay].sort(([a], [b]) => a.localeCompare(b))) {
    const text = lines.join('\n\n');
    if (tokenize(text).length < min) continue;
    for (const part of chunkText(text, opts.maxWords)) {
      const mentions = extractPeople(part);
      const ids = mentions.map((m) => {
        const found = people.find((p) => p.name.toLowerCase() === m.name.toLowerCase());
        if (found) return found.id;
        const p: Person = {
          id: uid('person'),
          name: m.name,
          ...(m.relation ? { relation: m.relation } : {}),
        };
        people.push(p);
        return p.id;
      });
      memories.push({
        id: uid('mem'),
        date,
        text: part,
        sourceId,
        emotions: scoreEmotions(part).slice(0, 3),
        themes: classifyThemes(part).slice(0, 3),
        ...(ids.length ? { people: ids } : {}),
      });
    }
  }
  return {
    added: memories.length + own.length,
    errors: [],
    undated: 0,
    archive: {
      ...archive,
      sources: [
        ...archive.sources,
        { id: sourceId, kind: opts.format, label: opts.label, importedAt: now.toISOString() },
      ],
      people,
      memories: [...archive.memories, ...memories],
      voiceSamples: voice,
    },
  };
}
