import type { Archive } from './schema';

export interface MergeResult {
  archive: Archive;
  added: number;
  skipped: number;
}

type Keyed = { id: string };

function mergeList<T extends Keyed>(
  base: T[],
  incoming: T[],
): { list: T[]; added: number; skipped: number } {
  const seen = new Set(base.map((x) => x.id));
  const list = [...base];
  let added = 0;
  let skipped = 0;
  for (const item of incoming) {
    if (seen.has(item.id)) skipped++;
    else {
      seen.add(item.id);
      list.push(item);
      added++;
    }
  }
  return { list, added, skipped };
}

/**
 * Merge an imported archive into the current one. Records whose id already exists are kept as
 * they are (the local copy wins), so importing the same bundle twice changes nothing.
 * Subject, disclosure, identity and legacy policy of the local archive are never overwritten.
 */
export function mergeArchive(base: Archive, incoming: Archive): MergeResult {
  let added = 0;
  let skipped = 0;
  const take = <T extends Keyed>(a: T[], b: T[]): T[] => {
    const r = mergeList(a, b);
    added += r.added;
    skipped += r.skipped;
    return r.list;
  };
  const archive: Archive = {
    ...base,
    sources: take(base.sources, incoming.sources),
    people: take(base.people, incoming.people),
    memories: take(base.memories, incoming.memories),
    facts: take(base.facts, incoming.facts),
    voiceSamples: take(base.voiceSamples, incoming.voiceSamples),
    capsules: take(base.capsules, incoming.capsules),
    attachments: take(base.attachments, incoming.attachments),
  };
  return { archive, added, skipped };
}
