import { ARCHIVE_FORMAT, ARCHIVE_VERSION, type Archive } from './schema';

export interface ValidationIssue {
  path: string;
  message: string;
}

export type ValidationResult =
  { ok: true; archive: Archive; issues: [] } | { ok: false; issues: ValidationIssue[] };

const SOURCE_KINDS = ['markdown', 'whatsapp', 'telegram', 'mbox', 'interview', 'demo'];
const ISO = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/;
const HEX64 = /^[0-9a-f]{64}$/;

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);

function isIso(v: unknown): boolean {
  return typeof v === 'string' && ISO.test(v) && !Number.isNaN(Date.parse(v));
}

/** Dependency-free structural validator. Also checks referential integrity and unique ids. */
export function validateArchive(input: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  const bad = (path: string, message: string) => issues.push({ path, message });

  if (!isRec(input)) return { ok: false, issues: [{ path: '$', message: 'must be an object' }] };

  if (input['format'] !== ARCHIVE_FORMAT) bad('format', `must be "${ARCHIVE_FORMAT}"`);
  const version = input['version'];
  if (typeof version !== 'number' || !Number.isInteger(version)) {
    bad('version', 'must be an integer');
  } else if (version > ARCHIVE_VERSION) {
    bad('version', `version ${version} is newer than supported (${ARCHIVE_VERSION})`);
  } else if (version < 1) bad('version', 'must be >= 1');
  if (!isIso(input['createdAt'])) bad('createdAt', 'must be an ISO 8601 date');

  const subject = input['subject'];
  if (!isRec(subject)) bad('subject', 'must be an object');
  else {
    if (typeof subject['displayName'] !== 'string' || !subject['displayName'].trim())
      bad('subject.displayName', 'must be a non-empty string');
    if (typeof subject['isFictional'] !== 'boolean') bad('subject.isFictional', 'must be boolean');
  }
  if (typeof input['aiDisclosure'] !== 'string' || !input['aiDisclosure'].trim())
    bad('aiDisclosure', 'must be a non-empty string (the twin must be labeled as AI)');

  const ids = new Map<string, Set<string>>();
  const list = (key: string, check: (item: Rec, p: string) => void): Rec[] => {
    const arr = input[key];
    if (!Array.isArray(arr)) {
      bad(key, 'must be an array');
      return [];
    }
    const seen = new Set<string>();
    ids.set(key, seen);
    const out: Rec[] = [];
    arr.forEach((item, i) => {
      const p = `${key}[${i}]`;
      if (!isRec(item)) return bad(p, 'must be an object');
      const id = item['id'];
      if (typeof id !== 'string' || !id) bad(`${p}.id`, 'must be a non-empty string');
      else if (seen.has(id)) bad(`${p}.id`, `duplicate id "${id}"`);
      else seen.add(id);
      check(item, p);
      out.push(item);
    });
    return out;
  };
  const str = (o: Rec, k: string, p: string) => {
    if (typeof o[k] !== 'string' || !o[k]) bad(`${p}.${k}`, 'must be a non-empty string');
  };

  const sources = list('sources', (s, p) => {
    if (!SOURCE_KINDS.includes(s['kind'] as string))
      bad(`${p}.kind`, `must be one of ${SOURCE_KINDS.join(', ')}`);
    str(s, 'label', p);
    if (!isIso(s['importedAt'])) bad(`${p}.importedAt`, 'must be an ISO 8601 date');
  });
  const people = list('people', (s, p) => str(s, 'name', p));
  const memories = list('memories', (m, p) => {
    if (!isIso(m['date'])) bad(`${p}.date`, 'must be an ISO 8601 date');
    str(m, 'text', p);
    str(m, 'sourceId', p);
  });
  const facts = list('facts', (f, p) => {
    str(f, 'subject', p);
    str(f, 'predicate', p);
    str(f, 'object', p);
    const c = f['confidence'];
    if (typeof c !== 'number' || !(c >= 0 && c <= 1)) bad(`${p}.confidence`, 'must be 0..1');
    if (!Array.isArray(f['sourceIds'])) bad(`${p}.sourceIds`, 'must be an array');
  });
  const voice = list('voiceSamples', (v, p) => {
    str(v, 'text', p);
    str(v, 'sourceId', p);
    if (v['date'] !== undefined && !isIso(v['date'])) bad(`${p}.date`, 'must be an ISO 8601 date');
  });
  list('capsules', (c, p) => {
    if (!isIso(c['createdAt'])) bad(`${p}.createdAt`, 'must be an ISO 8601 date');
    if (!isIso(c['unlockAt'])) bad(`${p}.unlockAt`, 'must be an ISO 8601 date');
    else if (
      isIso(c['createdAt']) &&
      Date.parse(c['unlockAt'] as string) < Date.parse(c['createdAt'] as string)
    )
      bad(`${p}.unlockAt`, 'must not be before createdAt');
    str(c, 'to', p);
    str(c, 'body', p);
  });
  list('attachments', (a, p) => {
    str(a, 'filename', p);
    str(a, 'mediaType', p);
    if (typeof a['bytes'] !== 'number' || !Number.isInteger(a['bytes']) || a['bytes'] < 0)
      bad(`${p}.bytes`, 'must be a non-negative integer');
    if (typeof a['sha256'] !== 'string' || !HEX64.test(a['sha256']))
      bad(`${p}.sha256`, 'must be 64 lowercase hex characters');
    const path = a['path'];
    if (
      typeof path !== 'string' ||
      !path.startsWith('attachments/') ||
      path.split('/').includes('..')
    )
      bad(`${p}.path`, 'must be a relative path under attachments/');
  });

  // Referential integrity (only meaningful when the lists themselves were well-formed).
  const sourceIds = ids.get('sources') ?? new Set<string>();
  const personIds = ids.get('people') ?? new Set<string>();
  const refSource = (id: unknown, p: string) => {
    if (typeof id === 'string' && !sourceIds.has(id)) bad(p, `unknown source "${id}"`);
  };
  memories.forEach((m, i) => {
    refSource(m['sourceId'], `memories[${i}].sourceId`);
    const ppl = m['people'];
    if (ppl !== undefined) {
      if (!Array.isArray(ppl)) bad(`memories[${i}].people`, 'must be an array');
      else
        ppl.forEach((id, j) => {
          if (!personIds.has(id as string))
            bad(`memories[${i}].people[${j}]`, `unknown person "${String(id)}"`);
        });
    }
  });
  voice.forEach((v, i) => refSource(v['sourceId'], `voiceSamples[${i}].sourceId`));
  facts.forEach((f, i) => {
    if (Array.isArray(f['sourceIds']))
      f['sourceIds'].forEach((id, j) => refSource(id, `facts[${i}].sourceIds[${j}]`));
  });
  void sources;
  void people;

  if (issues.length) return { ok: false, issues };
  return { ok: true, archive: input as unknown as Archive, issues: [] };
}
