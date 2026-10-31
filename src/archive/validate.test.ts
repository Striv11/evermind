import { describe, expect, it } from 'vitest';
import { emptyArchive } from './schema';
import { validateArchive } from './validate';
import { demoArchive } from '../demo/persona';

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

describe('archive validation', () => {
  it('accepts an empty archive', () => {
    expect(validateArchive(emptyArchive('Test')).ok).toBe(true);
  });

  it('accepts the fictional demo persona', () => {
    const r = validateArchive(demoArchive());
    expect(r.issues).toEqual([]);
    expect(demoArchive().subject.isFictional).toBe(true);
  });

  it('rejects non-objects and wrong format', () => {
    expect(validateArchive(null).ok).toBe(false);
    const a = clone(emptyArchive('x'));
    (a as { format: string }).format = 'nope';
    expect(validateArchive(a).ok).toBe(false);
  });

  it('rejects newer versions', () => {
    const a = { ...clone(emptyArchive('x')), version: 99 };
    const r = validateArchive(a);
    expect(!r.ok && r.issues[0]?.path).toBe('version');
  });

  it('requires the AI disclosure', () => {
    const a = { ...clone(emptyArchive('x')), aiDisclosure: ' ' };
    expect(validateArchive(a).ok).toBe(false);
  });

  it('reports dangling references with paths', () => {
    const a = clone(demoArchive());
    a.memories[0]!.sourceId = 'ghost';
    a.memories[0]!.people = ['nobody'];
    const r = validateArchive(a);
    expect(r.ok).toBe(false);
    const paths = r.issues.map((i) => i.path);
    expect(paths).toContain('memories[0].sourceId');
    expect(paths).toContain('memories[0].people[0]');
  });

  it('rejects duplicate ids, bad dates, bad confidence', () => {
    const a = clone(demoArchive());
    a.memories[1]!.id = a.memories[0]!.id;
    a.memories[0]!.date = 'yesterday';
    a.facts[0]!.confidence = 1.5;
    const paths = validateArchive(a).issues.map((i) => i.path);
    expect(paths).toEqual(
      expect.arrayContaining(['memories[1].id', 'memories[0].date', 'facts[0].confidence']),
    );
  });

  it('rejects capsules that unlock before creation', () => {
    const a = clone(emptyArchive('x'));
    a.capsules.push({
      id: 'c1',
      createdAt: '2026-01-02',
      unlockAt: '2026-01-01',
      to: 'me',
      body: 'hi',
    });
    expect(validateArchive(a).ok).toBe(false);
  });

  it('rejects attachment path traversal and bad hashes', () => {
    const a = clone(emptyArchive('x'));
    a.attachments.push({
      id: 'a1',
      filename: 'x.jpg',
      mediaType: 'image/jpeg',
      bytes: 1,
      sha256: 'XYZ',
      path: 'attachments/../../etc/passwd',
    });
    const paths = validateArchive(a).issues.map((i) => i.path);
    expect(paths).toEqual(expect.arrayContaining(['attachments[0].sha256', 'attachments[0].path']));
  });
});
