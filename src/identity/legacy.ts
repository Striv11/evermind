/**
 * Legacy controls: the person decides who may talk to their twin, which topics are
 * off-limits, and which messages are released later. All enforcement is app-level
 * (the archive is not a DRM container); see docs/ARCHIVE_FORMAT.md.
 */
import type { Archive, EpisodicMemory } from '../archive/schema';

export interface Listener {
  name: string;
  relationship?: string;
}

export interface PosthumousMessage {
  id: string;
  /** Name of a listener this message is for. */
  to: string;
  text: string;
  createdAt: string; // ISO 8601
  /** Earliest date (YYYY-MM-DD) on which it may be shown. */
  releaseOn: string;
}

export interface LegacyPolicy {
  /** "owner" = only the person; "listed" = the person and the listeners below. */
  access: 'owner' | 'listed';
  listeners: Listener[];
  /** Topics the twin must never discuss, as plain words or phrases. */
  offLimits: string[];
  messages: PosthumousMessage[];
}

export const emptyPolicy = (): LegacyPolicy => ({
  access: 'owner',
  listeners: [],
  offLimits: [],
  messages: [],
});

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** True when the text mentions any off-limits topic as a whole word or phrase. */
export function mentionsOffLimits(text: string, topics: string[]): string | undefined {
  const t = ` ${norm(text).replace(/[^\p{L}\p{N}' ]/gu, ' ')} `;
  return topics.map(norm).find((topic) => {
    const k = topic
      .replace(/[^\p{L}\p{N}' ]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return k !== '' && t.includes(` ${k} `);
  });
}

/** Memories the twin may use: those that do not touch an off-limits topic. */
export function allowedMemories(a: Archive): EpisodicMemory[] {
  const topics = a.legacy?.offLimits ?? [];
  if (!topics.length) return a.memories;
  return a.memories.filter(
    (m) =>
      !mentionsOffLimits(`${m.text} ${(m.tags ?? []).join(' ')}`, topics) &&
      !(m.themes ?? []).some((th) => mentionsOffLimits(th, topics)),
  );
}

/** Who is speaking to the twin. The owner is always allowed. */
export function canTalk(policy: LegacyPolicy | undefined, who: string | 'owner'): boolean {
  if (who === 'owner' || !policy || policy.access === 'owner') return who === 'owner';
  return policy.listeners.some((l) => norm(l.name) === norm(who));
}

export type Gate = { ok: true } | { ok: false; reply: string };

/** Check a question before anything is sent to a model. */
export function gateQuestion(a: Archive, question: string): Gate {
  const hit = mentionsOffLimits(question, a.legacy?.offLimits ?? []);
  if (!hit) return { ok: true };
  return {
    ok: false,
    reply: `I'd rather not talk about that. ${a.subject.displayName} asked that this topic stay private. (AI reconstruction)`,
  };
}

/** Messages addressed to `who` that are released on `now` (clock injected for tests). */
export function releasedMessages(
  policy: LegacyPolicy | undefined,
  who: string,
  now: Date,
): PosthumousMessage[] {
  const day = now.toISOString().slice(0, 10);
  return (policy?.messages ?? [])
    .filter((m) => norm(m.to) === norm(who) && m.releaseOn <= day)
    .sort((x, y) => x.releaseOn.localeCompare(y.releaseOn));
}

let counter = 0;
export function addMessage(
  a: Archive,
  m: { to: string; text: string; releaseOn: string },
  now = new Date(),
): Archive {
  const text = m.text.trim();
  if (!text) throw new Error('A message needs some text.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(m.releaseOn)) throw new Error('Release date must be YYYY-MM-DD.');
  const policy = a.legacy ?? emptyPolicy();
  const msg: PosthumousMessage = {
    id: `msg-${now.getTime().toString(36)}-${(counter++).toString(36)}`,
    to: m.to.trim(),
    text,
    createdAt: now.toISOString(),
    releaseOn: m.releaseOn,
  };
  return { ...a, legacy: { ...policy, messages: [...policy.messages, msg] } };
}

const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Structural check, returning a message for the first problem. */
export function policyProblem(v: unknown): string | undefined {
  if (typeof v !== 'object' || v === null) return 'must be an object';
  const p = v as Record<string, unknown>;
  if (p['access'] !== 'owner' && p['access'] !== 'listed')
    return 'access must be "owner" or "listed"';
  if (!Array.isArray(p['listeners']) || !p['listeners'].every((l) => isStr((l as Listener)?.name)))
    return 'listeners must be {name, relationship?} objects';
  if (!Array.isArray(p['offLimits']) || !p['offLimits'].every(isStr))
    return 'offLimits must be non-empty strings';
  const msgs = p['messages'];
  if (!Array.isArray(msgs)) return 'messages must be an array';
  const ids = new Set<string>();
  for (const m of msgs as Record<string, unknown>[]) {
    if (!isStr(m?.['id']) || !isStr(m['to']) || !isStr(m['text']) || !isDay(m['releaseOn']))
      return 'each message needs id, to, text and releaseOn (YYYY-MM-DD)';
    if (typeof m['createdAt'] !== 'string' || Number.isNaN(Date.parse(m['createdAt'])))
      return 'each message needs a valid createdAt';
    if (ids.has(m['id'] as string)) return `duplicate message id "${m['id']}"`;
    ids.add(m['id'] as string);
  }
  return undefined;
}
