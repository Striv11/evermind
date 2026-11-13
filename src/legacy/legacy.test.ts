import { describe, expect, it } from 'vitest';
import { emptyArchive } from '../archive/schema';
import { validateArchive } from '../archive/validate';
import { demoArchive } from '../demo/persona';
import {
  capsuleState,
  capsuleView,
  daysUntilOpen,
  openCapsule,
  removeCapsule,
  sealCapsule,
} from './capsule';
import { chaptersByDecade, lifeBookHtml } from './lifebook';

const t0 = new Date('2026-11-13T00:00:00Z');

describe('time capsules (injected clock)', () => {
  const a = sealCapsule(
    emptyArchive('Asha'),
    { to: 'Mira', body: ' Happy 18th! ', unlockAt: '2030-05-01' },
    t0,
  );
  const c = a.capsules[0]!;

  it('seals with a trimmed body and validates', () => {
    expect(c.body).toBe('Happy 18th!');
    expect(c.createdAt).toBe(t0.toISOString());
    expect(validateArchive(a).ok).toBe(true);
  });

  it('stays sealed before the date and opens at it', () => {
    const before = new Date('2030-04-30T23:59:59Z');
    const at = new Date('2030-05-01T00:00:00Z');
    expect(capsuleState(c, before)).toBe('sealed');
    expect(openCapsule(c, before)).toBeUndefined();
    expect(capsuleView(c, before).body).toBeUndefined();
    expect(capsuleState(c, at)).toBe('open');
    expect(openCapsule(c, at)).toBe('Happy 18th!');
    expect(daysUntilOpen(c, before)).toBe(1);
    expect(daysUntilOpen(c, new Date('2031-01-01'))).toBe(0);
  });

  it('rejects bad input', () => {
    const e = emptyArchive('A');
    expect(() => sealCapsule(e, { to: '', body: 'x', unlockAt: '2030-01-01' }, t0)).toThrow(/who/);
    expect(() => sealCapsule(e, { to: 'M', body: ' ', unlockAt: '2030-01-01' }, t0)).toThrow(
      /message/,
    );
    expect(() => sealCapsule(e, { to: 'M', body: 'x', unlockAt: 'soon' }, t0)).toThrow(/valid/);
    expect(() => sealCapsule(e, { to: 'M', body: 'x', unlockAt: '2026-11-13' }, t0)).toThrow(
      /future/,
    );
  });

  it('gives each capsule a unique id and can remove one', () => {
    const two = sealCapsule(a, { to: 'Ravi', body: 'Hi', unlockAt: '2031-01-01' }, t0);
    expect(new Set(two.capsules.map((x) => x.id)).size).toBe(2);
    expect(removeCapsule(two, c.id).capsules).toHaveLength(1);
  });
});

describe('life book', () => {
  it('groups by decade, oldest first, undated last', () => {
    const base = emptyArchive('A');
    const mk = (id: string, date: string) => ({ id, date, text: id, sourceId: 's' });
    const ch = chaptersByDecade([
      mk('c', '2011-02-03'),
      mk('x', 'unknown'),
      mk('a', '1987-01-01'),
      mk('b', '1989-12-31'),
    ]);
    expect(ch.map((x) => x.title)).toEqual(['1980s', '2010s', 'Undated']);
    expect(ch[0]!.memories.map((m) => m.id)).toEqual(['a', 'b']);
    expect(base.memories).toEqual([]);
  });

  it('renders the demo persona with citations, print CSS and disclosure', () => {
    const a = demoArchive();
    const html = lifeBookHtml(a);
    expect(html).toContain('@media print');
    expect(html).toContain(a.aiDisclosure.slice(0, 40));
    for (const m of a.memories) expect(html).toContain(`[${m.id}]`);
    expect(html).not.toMatch(/<script/i);
  });

  it('escapes content and never includes capsules', () => {
    let a = emptyArchive('<b>Eve</b>');
    a = {
      ...a,
      sources: [{ id: 's', kind: 'typed', label: 'a&b', importedAt: '2026-01-01' }],
      memories: [{ id: 'm1', date: '2001-01-01', text: '<img src=x onerror=1>', sourceId: 's' }],
    };
    a = sealCapsule(a, { to: 'M', body: 'SECRET-BODY', unlockAt: '2040-01-01' }, t0);
    const html = lifeBookHtml(a);
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
    expect(html).toContain('a&amp;b');
    expect(html).not.toContain('SECRET-BODY');
  });

  it('handles an empty archive', () => {
    expect(lifeBookHtml(emptyArchive('A'))).toContain('No memories yet.');
  });
});
