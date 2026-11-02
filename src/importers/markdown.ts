/**
 * Importer for markdown / plain-text journals and "Q: / A:" question files.
 * Pure functions only: no DOM, no storage. See ingestEntries in ./ingest.ts.
 */

export interface ParsedEntry {
  /** ISO date (YYYY-MM-DD, or YYYY-MM-01 / YYYY-01-01 when only month/year is known). */
  date: string | null;
  title: string;
  text: string;
  tags: string[];
  /** Where the date came from, for the UI and tests. */
  dateFrom: 'front-matter' | 'heading' | 'filename' | 'none';
}

export class ImportError extends Error {}

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const EXT = /\.(md|markdown|txt|text)$/i;

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];
const monthNo = (s: string): number | null => {
  const k = s.toLowerCase();
  const i = MONTHS.findIndex(
    (m) => m === k || (k.length >= 3 && m.startsWith(k.slice(0, 3)) && k.length <= 4),
  );
  return i < 0 ? null : i + 1;
};

const pad = (n: number) => String(n).padStart(2, '0');

/** Valid calendar date (rejects 2019-02-30). */
function iso(y: number, m: number, d: number): string | null {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1) return null;
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= dim ? `${y}-${pad(m)}-${pad(d)}` : null;
}

/** Find the first date written in a short string (heading, filename, front-matter value). */
export function findDate(s: string): string | null {
  let m = s.match(/(?<!\d)(\d{4})[-_./](\d{1,2})[-_./](\d{1,2})(?!\d)/);
  if (m) {
    const r = iso(+m[1]!, +m[2]!, +m[3]!);
    if (r) return r;
  }
  m = s.match(/(?<!\d)(19\d{2}|20\d{2})(\d{2})(\d{2})(?!\d)/);
  if (m) {
    const r = iso(+m[1]!, +m[2]!, +m[3]!);
    if (r) return r;
  }
  // "March 4, 2019", "Mar 4th 2019"
  m = s.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/);
  if (m && monthNo(m[1]!)) {
    const r = iso(+m[3]!, monthNo(m[1]!)!, +m[2]!);
    if (r) return r;
  }
  // "4 March 2019", "4th of March, 2019"
  m = s.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([A-Za-z]{3,9})\.?,?\s+(\d{4})\b/);
  if (m && monthNo(m[2]!)) {
    const r = iso(+m[3]!, monthNo(m[2]!)!, +m[1]!);
    if (r) return r;
  }
  // Month + year only: "June 2014"
  m = s.match(/\b([A-Za-z]{3,9})\.?,?\s+(\d{4})\b/);
  if (m && monthNo(m[1]!)) return iso(+m[2]!, monthNo(m[1]!)!, 1);
  // 2014-06
  m = s.match(/(?<!\d)(19\d{2}|20\d{2})-(\d{2})(?![\d-])/);
  if (m) return iso(+m[1]!, +m[2]!, 1);
  return null;
}

interface FrontMatter {
  data: Record<string, string>;
  body: string;
}

export function splitFrontMatter(src: string): FrontMatter {
  const m = src.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!m) return { data: {}, body: src };
  const data: Record<string, string> = {};
  for (const line of m[1]!.split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (kv) data[kv[1]!.toLowerCase()] = kv[2]!.trim().replace(/^["']|["']$/g, '');
  }
  return { data, body: src.slice(m[0].length) };
}

function parseTags(v: string | undefined): string[] {
  if (!v) return [];
  return v
    .replace(/^\[|\]$/g, '')
    .split(/[,\s]+/)
    .map((t) => t.replace(/^#/, '').toLowerCase())
    .filter(Boolean);
}

const HEADING = /^(#{1,4})\s+(.*?)\s*#*\s*$/;

/** Q&A files: "Q: ...\nA: ..." blocks, answers may span lines. */
export function parseQA(body: string): { q: string; a: string }[] {
  const out: { q: string; a: string }[] = [];
  let cur: { q: string; a: string; inA: boolean } | null = null;
  const push = () => {
    if (cur && cur.a.trim()) out.push({ q: cur.q.trim(), a: cur.a.trim() });
    cur = null;
  };
  for (const line of body.split(/\r?\n/)) {
    const q = line.match(/^\s*(?:\*\*)?(?:Q|Question)(?:\*\*)?\s*[:.)-]\s*(.*)$/i);
    const a = line.match(/^\s*(?:\*\*)?(?:A|Answer)(?:\*\*)?\s*[:.)-]\s*(.*)$/i);
    if (q) {
      push();
      cur = { q: q[1]!, a: '', inA: false };
    } else if (a && cur) {
      cur.inA = true;
      cur.a += a[1]! + '\n';
    } else if (cur) {
      if (cur.inA) cur.a += line + '\n';
      else if (line.trim()) cur.q += ' ' + line.trim();
    }
  }
  push();
  return out;
}

/** Strip the most common markdown noise so memories read as prose. */
export function plain(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/(\*\*|__|\*|_|`)/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function parseDocument(fileName: string, content: string): ParsedEntry[] {
  if (!EXT.test(fileName))
    throw new ImportError(`${fileName}: only .md, .markdown and .txt files can be imported.`);
  if (content.length > MAX_IMPORT_BYTES)
    throw new ImportError(`${fileName}: file is larger than 5 MB.`);
  if (!content.trim()) throw new ImportError(`${fileName}: the file is empty.`);

  const { data, body } = splitFrontMatter(
    content.charCodeAt(0) === 0xfeff ? content.slice(1) : content,
  );
  const base = fileName.replace(/^.*[\\/]/, '');
  const fileDate = findDate(base);
  const fmDate =
    data.date || data.created || data.day ? findDate(data.date || data.created || data.day!) : null;
  const tags = parseTags(data.tags ?? data.tag);
  const docTitle = data.title || base.replace(EXT, '');

  const qa = parseQA(body);
  if (qa.length >= 1 && /^\s*(?:\*\*)?(?:Q|Question)/im.test(body)) {
    const date = fmDate ?? fileDate;
    return qa.map((p) => ({
      date,
      title: p.q,
      text: `${p.q}\n${plain(p.a)}`,
      tags,
      dateFrom: fmDate ? 'front-matter' : fileDate ? 'filename' : 'none',
    }));
  }

  // Split at headings that carry a date; text before the first one belongs to the document.
  const lines = body.split(/\r?\n/);
  const sections: { title: string; date: string | null; lines: string[] }[] = [];
  let cur = { title: docTitle, date: null as string | null, lines: [] as string[] };
  let dated = false;
  for (const line of lines) {
    const hm = line.match(HEADING);
    const hd = hm ? findDate(hm[2]!) : null;
    if (hm && hd) {
      sections.push(cur);
      cur = { title: hm[2]!, date: hd, lines: [] };
      dated = true;
    } else cur.lines.push(line);
  }
  sections.push(cur);

  const entries: ParsedEntry[] = [];
  for (const s of sections) {
    const text = plain(
      s.lines.join('\n').replace(/^#{1,4}\s+.*$/gm, (l) => l.replace(/^#+\s+/, '')),
    );
    if (!text) continue;
    const headed = dated && s.date;
    entries.push({
      date: s.date ?? fmDate ?? fileDate,
      title: s.title,
      text,
      tags,
      dateFrom: headed ? 'heading' : fmDate ? 'front-matter' : fileDate ? 'filename' : 'none',
    });
  }
  if (!entries.length) throw new ImportError(`${fileName}: nothing readable in this file.`);
  return entries;
}
