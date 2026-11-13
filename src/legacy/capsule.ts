/**
 * Time capsules: messages sealed until a date. Sealing is enforced by the app only
 * (the body is stored in the clear); see docs/ARCHIVE_FORMAT.md. The clock is always
 * injected so behaviour is testable.
 */
import type { Archive, TimeCapsule } from '../archive/schema';

export type CapsuleState = 'sealed' | 'open';

const ms = (iso: string) => Date.parse(iso);

export function capsuleState(c: TimeCapsule, now: Date): CapsuleState {
  return now.getTime() >= ms(c.unlockAt) ? 'open' : 'sealed';
}

/** Whole days until a sealed capsule opens (0 when open). */
export function daysUntilOpen(c: TimeCapsule, now: Date): number {
  return Math.max(0, Math.ceil((ms(c.unlockAt) - now.getTime()) / 86_400_000));
}

let counter = 0;

/** Add a sealed capsule. `unlockAt` is a date (YYYY-MM-DD, UTC midnight) or ISO datetime in the future. */
export function sealCapsule(
  a: Archive,
  input: { to: string; body: string; unlockAt: string },
  now: Date,
): Archive {
  const body = input.body.trim();
  const to = input.to.trim();
  if (!to) throw new Error('Say who the capsule is for.');
  if (!body) throw new Error('A capsule needs a message.');
  if (Number.isNaN(ms(input.unlockAt))) throw new Error('Unlock date is not a valid date.');
  if (ms(input.unlockAt) <= now.getTime()) throw new Error('Unlock date must be in the future.');
  const c: TimeCapsule = {
    id: `cap-${now.getTime().toString(36)}-${(counter++).toString(36)}`,
    createdAt: now.toISOString(),
    unlockAt: input.unlockAt,
    to,
    body,
  };
  return { ...a, capsules: [...a.capsules, c] };
}

/** The message, only once the unlock time has passed; undefined while sealed. */
export function openCapsule(c: TimeCapsule, now: Date): string | undefined {
  return capsuleState(c, now) === 'open' ? c.body : undefined;
}

/** What a UI may show: the body is withheld while sealed. */
export function capsuleView(c: TimeCapsule, now: Date) {
  const state = capsuleState(c, now);
  return {
    id: c.id,
    to: c.to,
    unlockAt: c.unlockAt,
    state,
    daysLeft: daysUntilOpen(c, now),
    body: state === 'open' ? c.body : undefined,
  };
}

export function removeCapsule(a: Archive, id: string): Archive {
  return { ...a, capsules: a.capsules.filter((c) => c.id !== id) };
}
