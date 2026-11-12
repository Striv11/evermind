import { describe, expect, it } from 'vitest';
import { demoArchive } from '../demo/persona';
import { emptyArchive } from './schema';
import { mergeArchive } from './merge';
import { validateArchive } from './validate';

describe('mergeArchive', () => {
  it('adds everything into an empty archive and stays valid', () => {
    const demo = demoArchive();
    const r = mergeArchive(emptyArchive('Me'), demo);
    expect(r.archive.memories).toHaveLength(demo.memories.length);
    expect(r.added).toBeGreaterThan(0);
    expect(r.skipped).toBe(0);
    expect(validateArchive(r.archive).ok).toBe(true);
  });

  it('is idempotent: importing twice adds nothing the second time', () => {
    const once = mergeArchive(emptyArchive('Me'), demoArchive());
    const twice = mergeArchive(once.archive, demoArchive());
    expect(twice.added).toBe(0);
    expect(twice.skipped).toBe(once.added);
    expect(twice.archive.memories).toEqual(once.archive.memories);
  });

  it('keeps the local copy on id clash and never overwrites subject or disclosure', () => {
    const base = demoArchive();
    const other = demoArchive();
    other.memories[0]!.text = 'changed remotely';
    other.subject = { displayName: 'Someone else', isFictional: false };
    other.aiDisclosure = 'nothing to see';
    const r = mergeArchive(base, other);
    expect(r.archive.memories[0]!.text).toBe(base.memories[0]!.text);
    expect(r.archive.subject).toEqual(base.subject);
    expect(r.archive.aiDisclosure).toBe(base.aiDisclosure);
  });

  it('does not mutate its inputs', () => {
    const base = emptyArchive('Me');
    mergeArchive(base, demoArchive());
    expect(base.memories).toHaveLength(0);
  });
});
