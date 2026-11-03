import { ImportError } from './markdown';

/** One message from a chat export or mail box. `date` is an ISO date (YYYY-MM-DD). */
export interface ChatMessage {
  author: string;
  date: string;
  text: string;
}

export type ChatFormat = 'whatsapp' | 'telegram' | 'mbox';

const stripBom = (t: string) => (t.charCodeAt(0) === 0xfeff ? t.slice(1) : t);
const pad = (n: number) => String(n).padStart(2, '0');

function isoDate(y: number, m: number, d: number): string | null {
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

const fullYear = (y: number) => (y >= 100 ? y : y < 70 ? 2000 + y : 1900 + y);

// "[12/03/2019, 10:15:32] Name: text" or "12/03/2019, 10:15 - Name: text" (also "." and "-" separators).
const WA_LINE =
  /^\u200e?\[?(\d{1,4})[./-](\d{1,2})[./-](\d{1,4}),?\s+\d{1,2}[:.]\d{2}(?:[:.]\d{2})?(?:\s?[APap]\.?[Mm]\.?)?\]?(?:\s-\s|\s)(.*)$/;
const WA_NOISE =
  /^\u200e?(<media omitted>|image omitted|video omitted|audio omitted|sticker omitted|gif omitted|document omitted|this message was deleted|you deleted this message|null)\.?$/i;

/** Decide whether the export is day-first or month-first by looking for a component above 12. */
function dayFirst(pairs: Array<[number, number]>): boolean {
  for (const [a, b] of pairs) {
    if (a > 12) return true;
    if (b > 12) return false;
  }
  return true;
}

export function parseWhatsApp(text: string): ChatMessage[] {
  const raw: Array<{ a: number; b: number; c: number; body: string }> = [];
  for (const line of stripBom(text).split(/\r?\n/)) {
    const m = WA_LINE.exec(line);
    if (m) raw.push({ a: +m[1]!, b: +m[2]!, c: +m[3]!, body: m[4]! });
    else if (raw.length && line.trim()) raw[raw.length - 1]!.body += '\n' + line;
    else if (raw.length) raw[raw.length - 1]!.body += '\n';
  }
  if (!raw.length) throw new ImportError('No WhatsApp messages found. Export the chat as text.');
  // Year-first (2019-03-04) exports have a 4-digit first component.
  const yearFirst = raw.every((r) => r.a > 31);
  const df = yearFirst ? true : dayFirst(raw.map((r) => [r.a, r.b]));
  const out: ChatMessage[] = [];
  for (const r of raw) {
    const body = r.body.replace(/\s+$/, '');
    const sep = body.indexOf(': ');
    // System lines ("Messages are end-to-end encrypted", "X joined") have no "Author: " prefix.
    if (sep <= 0 || sep > 60 || body.slice(0, sep).includes('\n')) continue;
    const author = body
      .slice(0, sep)
      .replace(/^\u200e/, '')
      .trim();
    const msg = body.slice(sep + 2).trim();
    if (!msg || WA_NOISE.test(msg)) continue;
    const date = yearFirst
      ? isoDate(r.a, r.b, r.c)
      : isoDate(fullYear(r.c), df ? r.b : r.a, df ? r.a : r.b);
    if (!date) continue;
    out.push({ author, date, text: msg });
  }
  return out;
}

interface TgPart {
  text?: string;
}

export function parseTelegram(json: string): ChatMessage[] {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new ImportError('Telegram export is not valid JSON.');
  }
  const root = data as { messages?: unknown; chats?: { list?: Array<{ messages?: unknown }> } };
  const lists: unknown[] = [];
  if (Array.isArray(root?.messages)) lists.push(...root.messages);
  else if (root?.chats?.list)
    for (const c of root.chats.list) lists.push(...(Array.isArray(c.messages) ? c.messages : []));
  else throw new ImportError('Telegram export has no "messages" array.');
  const out: ChatMessage[] = [];
  for (const item of lists) {
    const m = item as {
      type?: string;
      from?: string;
      date?: string;
      text?: string | Array<string | TgPart>;
    };
    if (m.type !== 'message' || !m.from || !m.date) continue;
    const text = Array.isArray(m.text)
      ? m.text.map((p) => (typeof p === 'string' ? p : (p.text ?? ''))).join('')
      : (m.text ?? '');
    const date = /^\d{4}-\d{2}-\d{2}/.exec(m.date)?.[0];
    if (!text.trim() || !date) continue;
    out.push({ author: m.from, date, text: text.trim() });
  }
  return out;
}

function decodeQP(s: string, charset: string): string {
  const joined = s.replace(/=\r?\n/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < joined.length; i++) {
    const hex = joined.slice(i + 1, i + 3);
    if (joined[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(hex)) {
      bytes.push(parseInt(hex, 16));
      i += 2;
    } else {
      for (const b of new TextEncoder().encode(joined[i]!)) bytes.push(b);
    }
  }
  return decodeBytes(Uint8Array.from(bytes), charset);
}

function decodeBytes(bytes: Uint8Array, charset: string): string {
  try {
    return new TextDecoder(charset || 'utf-8').decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

function decodeB64(s: string, charset: string): string {
  try {
    const bin = atob(s.replace(/\s+/g, ''));
    return decodeBytes(
      Uint8Array.from(bin, (c) => c.charCodeAt(0)),
      charset,
    );
  } catch {
    return '';
  }
}

/** Decode RFC 2047 encoded words in a header value. */
function decodeWords(v: string): string {
  return v.replace(
    /=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g,
    (_, cs: string, enc: string, body: string) =>
      enc.toLowerCase() === 'b' ? decodeB64(body, cs) : decodeQP(body.replace(/_/g, ' '), cs),
  );
}

function splitHead(block: string): { headers: Map<string, string>; body: string } {
  const m = /\r?\n\r?\n/.exec(block);
  const head = m ? block.slice(0, m.index) : block;
  const body = m ? block.slice(m.index + m[0].length) : '';
  const headers = new Map<string, string>();
  for (const line of head.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i > 0) headers.set(line.slice(0, i).toLowerCase(), line.slice(i + 1).trim());
  }
  return { headers, body };
}

function partText(block: string): string {
  const { headers, body } = splitHead(block);
  const type = headers.get('content-type') ?? 'text/plain';
  const boundary = /boundary="?([^";]+)"?/i.exec(type)?.[1];
  if (/^multipart\//i.test(type) && boundary) {
    const parts = body.split('--' + boundary).slice(1);
    const texts = parts
      .filter((p) => !p.startsWith('--'))
      .map((p) => ({ p, h: splitHead(p.replace(/^\r?\n/, '')) }));
    const plain = texts.find(
      (t) =>
        /text\/plain/i.test(t.h.headers.get('content-type') ?? 'text/plain') &&
        !/^multipart/i.test(t.h.headers.get('content-type') ?? ''),
    );
    const nested = texts.find((t) => /^multipart\//i.test(t.h.headers.get('content-type') ?? ''));
    if (plain) return partText(plain.p.replace(/^\r?\n/, ''));
    if (nested) return partText(nested.p.replace(/^\r?\n/, ''));
    return '';
  }
  if (!/^text\/plain/i.test(type)) return '';
  const charset = /charset="?([^";\s]+)"?/i.exec(type)?.[1] ?? 'utf-8';
  const enc = (headers.get('content-transfer-encoding') ?? '').toLowerCase();
  if (enc === 'quoted-printable') return decodeQP(body, charset);
  if (enc === 'base64') return decodeB64(body, charset);
  return body;
}

/** Drop quoted replies, "On ... wrote:" lead-ins and signatures, which are other people's words. */
export function stripReplyNoise(text: string): string {
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (/^--\s*$/.test(line)) break;
    if (/^On .{5,200}wrote:\s*$/.test(line) || /^-{2,}\s*Original Message\s*-{2,}/i.test(line))
      break;
    if (/^\s*>/.test(line)) continue;
    out.push(line);
  }
  return out.join('\n').trim();
}

function senderName(from: string): string {
  const decoded = decodeWords(from);
  const email = /<([^>]+)>/.exec(decoded)?.[1] ?? decoded;
  return email.trim().toLowerCase();
}

export function parseMbox(text: string): ChatMessage[] {
  const normalized = stripBom(text);
  if (!/^From /m.test(normalized))
    throw new ImportError('Not an mbox file (no "From " separators).');
  const blocks = normalized.split(/^From [^\n]*\n/m).slice(1);
  const out: ChatMessage[] = [];
  for (const block of blocks) {
    const { headers } = splitHead(block);
    const from = headers.get('from');
    const when = headers.get('date') ? new Date(headers.get('date')!) : null;
    if (!from || !when || Number.isNaN(when.getTime())) continue;
    const body = stripReplyNoise(partText(block.replace(/^>From /gm, 'From ')));
    if (!body) continue;
    out.push({ author: senderName(from), date: when.toISOString().slice(0, 10), text: body });
  }
  return out;
}

export function detectFormat(name: string, content: string): ChatFormat | null {
  const head = content.slice(0, 2000).trimStart();
  if (/\.json$/i.test(name) && head.startsWith('{')) return 'telegram';
  if (/^From \S+.*\n/.test(head) && /\n(From|Date|Subject):/i.test(head)) return 'mbox';
  if (
    WA_LINE.test(head.split(/\r?\n/)[0] ?? '') ||
    (/\.txt$/i.test(name) && /^\u200e?\[?\d/.test(head))
  )
    return 'whatsapp';
  return null;
}

export function parseChat(format: ChatFormat, content: string): ChatMessage[] {
  return format === 'whatsapp'
    ? parseWhatsApp(content)
    : format === 'telegram'
      ? parseTelegram(content)
      : parseMbox(content);
}

/** Authors ordered by message count, so the user can pick which one is them. */
export function listAuthors(messages: ChatMessage[]): Array<{ author: string; count: number }> {
  const counts = new Map<string, number>();
  for (const m of messages) counts.set(m.author, (counts.get(m.author) ?? 0) + 1);
  return [...counts]
    .map(([author, count]) => ({ author, count }))
    .sort((a, b) => b.count - a.count || a.author.localeCompare(b.author));
}
