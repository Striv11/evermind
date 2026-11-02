import { describe, expect, it } from 'vitest';
import { emptyArchive } from '../archive/schema';
import { validateArchive } from '../archive/validate';
import { chunkText, importDocuments } from './ingest';
import { findDate, parseDocument, parseQA, splitFrontMatter, ImportError } from './markdown';

describe('findDate', () => {
  it('reads common formats', () => {
    expect(findDate('2019-03-04-trip.md')).toBe('2019-03-04');
    expect(findDate('journal_20140612.txt')).toBe('2014-06-12');
    expect(findDate('March 4, 2019')).toBe('2019-03-04');
    expect(findDate('4th of March 2019')).toBe('2019-03-04');
    expect(findDate('Notes from June 2014')).toBe('2014-06-01');
    expect(findDate('2014-06 summer')).toBe('2014-06-01');
  });
  it('rejects impossible or absent dates', () => {
    expect(findDate('2019-02-30')).toBeNull();
    expect(findDate('chapter 12 notes')).toBeNull();
    expect(findDate('Call 5551234567')).toBeNull();
  });
});

describe('front matter', () => {
  it('splits and parses', () => {
    const r = splitFrontMatter('---\ntitle: "Hello"\ndate: 2020-05-06\ntags: [a, #b]\n---\nBody');
    expect(r.data).toMatchObject({ title: 'Hello', date: '2020-05-06' });
    expect(r.body).toBe('Body');
  });
  it('leaves documents without it alone', () => {
    expect(splitFrontMatter('# Hi').body).toBe('# Hi');
  });
});

describe('parseDocument', () => {
  it('prefers front-matter date over the filename and keeps tags', () => {
    const [e] = parseDocument(
      '2001-01-01.md',
      '---\ndate: 2020-05-06\ntags: family, home\n---\nWe moved today.',
    );
    expect(e).toMatchObject({
      date: '2020-05-06',
      dateFrom: 'front-matter',
      tags: ['family', 'home'],
    });
  });
  it('uses the filename date when nothing else', () => {
    const [e] = parseDocument('2018-07-09 beach.md', 'Sand everywhere.');
    expect(e).toMatchObject({ date: '2018-07-09', dateFrom: 'filename' });
  });
  it('splits a journal on dated headings', () => {
    const md =
      '# My journal\n\nIntro line.\n\n## March 4, 2019\nFirst day.\n\n## 2019-03-05\nSecond day, **great**.\n';
    const es = parseDocument('journal.md', md);
    expect(es.map((e) => e.date)).toEqual([null, '2019-03-04', '2019-03-05']);
    expect(es[2]!.text).toBe('Second day, great.');
    expect(es[1]!.dateFrom).toBe('heading');
  });
  it('parses Q&A with multi-line answers', () => {
    const txt =
      'Q: Where did you grow up?\nA: In Pune.\nWe had a garden.\n\nQ: Favourite food?\nA: Dal.';
    expect(parseQA(txt)).toEqual([
      { q: 'Where did you grow up?', a: 'In Pune.\nWe had a garden.' },
      { q: 'Favourite food?', a: 'Dal.' },
    ]);
    const es = parseDocument('qa.txt', txt);
    expect(es).toHaveLength(2);
    expect(es[0]!.text).toContain('Where did you grow up?');
  });
  it('rejects bad input with clear errors', () => {
    expect(() => parseDocument('pic.png', 'x')).toThrow(ImportError);
    expect(() => parseDocument('a.md', '  \n')).toThrow(/empty/);
    expect(() => parseDocument('a.md', '---\ntitle: x\n---\n')).toThrow(ImportError);
  });
});

describe('chunkText', () => {
  it('keeps paragraphs whole and respects the limit', () => {
    const p = (n: number) => Array(n).fill('word').join(' ');
    const parts = chunkText(`${p(50)}\n\n${p(50)}\n\n${p(50)}`, 100);
    expect(parts).toHaveLength(2);
    expect(chunkText(p(500), 100)).toHaveLength(1);
  });
});

describe('importDocuments', () => {
  const now = new Date('2026-11-02T00:00:00Z');
  it('creates valid memories, people and voice samples; reports bad files', () => {
    const r = importDocuments(
      emptyArchive('Asha', now),
      [
        {
          name: '2015-08-01 diary.md',
          content: 'My grandmother taught me patience. I was so grateful and proud.',
        },
        { name: 'broken.pdf', content: 'x' },
        { name: 'undated.txt', content: 'The bus leaves at six.' },
      ],
      { now },
    );
    expect(r.added).toBe(2);
    expect(r.errors).toHaveLength(1);
    expect(r.undated).toBe(1);
    expect(r.archive.memories[0]!.date).toBe('2015-08-01');
    expect(r.archive.memories[0]!.themes).toContain('family');
    expect(r.archive.memories[1]!.date).toBe('2026-11-02');
    expect(r.archive.sources.every((s) => s.kind === 'markdown')).toBe(true);
    expect(r.archive.voiceSamples).toHaveLength(2);
    const v = validateArchive(r.archive);
    expect(v.issues).toEqual([]);
    expect(v.ok).toBe(true);
  });
  it('does not mutate the input archive', () => {
    const a = emptyArchive('A', now);
    importDocuments(a, [{ name: 'x.md', content: 'hello there' }], { now });
    expect(a.memories).toHaveLength(0);
  });
});
