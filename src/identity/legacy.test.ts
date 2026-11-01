import { describe, expect, it } from 'vitest';
import { emptyArchive } from '../archive/schema';
import { validateArchive } from '../archive/validate';
import { answer } from '../insight/recall';
import { ingestAudio } from '../insight/pipeline';
import { personaSystem } from './brain';
import {
  addMessage,
  allowedMemories,
  canTalk,
  emptyPolicy,
  gateQuestion,
  mentionsOffLimits,
  releasedMessages,
} from './legacy';

const ingest = (a: ReturnType<typeof emptyArchive>, text: string, file: string) =>
  ingestAudio(a, { fileName: file, recordedAt: '2026-10-31', chunks: [{ text, start: 0, end: 5 }] })
    .archive;
const base = ingest(
  ingest(
    emptyArchive('Asha'),
    'My brother Ravi and I fought about money for years before we made peace.',
    'a',
  ),
  'I love baking bread on Sunday mornings with the radio on.',
  'b',
);
const withPolicy = (offLimits: string[]) => ({
  ...base,
  legacy: { ...emptyPolicy(), offLimits },
});

describe('off-limits topics', () => {
  it('matches whole words and phrases only, case-insensitively', () => {
    expect(mentionsOffLimits('Tell me about MONEY!', ['money'])).toBe('money');
    expect(mentionsOffLimits('the moneyed class', ['money'])).toBeUndefined();
    expect(mentionsOffLimits('my  brother ravi', ['Brother Ravi'])).toBe('brother ravi');
    expect(mentionsOffLimits('anything', ['', '  '])).toBeUndefined();
  });

  it('removes touching memories from what the twin may use', () => {
    const a = withPolicy(['money']);
    expect(allowedMemories(a).map((m) => m.text)).toEqual([base.memories[1]!.text]);
    expect(allowedMemories(base)).toHaveLength(2);
  });

  it('refuses before any model call and in retrieval-only answers', () => {
    const a = withPolicy(['money']);
    expect(gateQuestion(a, 'What about money?').ok).toBe(false);
    expect(gateQuestion(a, 'What do you bake?').ok).toBe(true);
    const r = answer(a, 'Did you fight about money with Ravi?');
    expect(r.abstained).toBe(true);
    expect(r.text).toMatch(/private/);
    expect(r.citations).toEqual([]);
    expect(answer(a, 'baking bread on Sunday').abstained).toBe(false);
  });

  it('adds the rule to the persona prompt only when topics exist', () => {
    expect(personaSystem(withPolicy(['money', 'Ravi']))).toMatch(/stay private[^]*money, Ravi/);
    expect(personaSystem(base)).not.toMatch(/stay private/);
  });
});

describe('access', () => {
  it('lets only the owner in by default, and listed people when enabled', () => {
    expect(canTalk(undefined, 'owner')).toBe(true);
    expect(canTalk(undefined, 'Maya')).toBe(false);
    const p = { ...emptyPolicy(), access: 'listed' as const, listeners: [{ name: 'Maya' }] };
    expect(canTalk(p, ' maya ')).toBe(true);
    expect(canTalk(p, 'Ravi')).toBe(false);
    expect(canTalk({ ...p, access: 'owner' }, 'Maya')).toBe(false);
  });
});

describe('posthumous messages', () => {
  const a = addMessage(
    addMessage(
      base,
      { to: 'Maya', text: 'Happy 30th.', releaseOn: '2040-05-01' },
      new Date('2026-11-01'),
    ),
    { to: 'Maya', text: 'Be kind.', releaseOn: '2035-01-01' },
    new Date('2026-11-01'),
  );

  it('releases by date with an injected clock, in date order, per recipient', () => {
    const at = (d: string) => releasedMessages(a.legacy, 'maya', new Date(d)).map((m) => m.text);
    expect(at('2030-01-01T00:00:00Z')).toEqual([]);
    expect(at('2035-01-01T00:00:00Z')).toEqual(['Be kind.']);
    expect(at('2041-01-01T00:00:00Z')).toEqual(['Be kind.', 'Happy 30th.']);
    expect(releasedMessages(a.legacy, 'Ravi', new Date('2041-01-01'))).toEqual([]);
  });

  it('rejects empty text and bad dates', () => {
    expect(() => addMessage(base, { to: 'M', text: ' ', releaseOn: '2040-01-01' })).toThrow();
    expect(() => addMessage(base, { to: 'M', text: 'x', releaseOn: 'soon' })).toThrow();
  });

  it('keeps the archive valid, and the validator catches bad policies', () => {
    expect(validateArchive(a).ok).toBe(true);
    const dup = {
      ...a,
      legacy: { ...a.legacy!, messages: [a.legacy!.messages[0]!, a.legacy!.messages[0]!] },
    };
    const r = validateArchive(dup);
    expect(r.ok).toBe(false);
    expect(validateArchive({ ...a, legacy: { access: 'everyone' } }).ok).toBe(false);
  });
});
