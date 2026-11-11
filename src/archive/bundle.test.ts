import { describe, expect, it } from 'vitest';
import { exportBundle, importBundle, sha256Hex, BundleError } from './bundle';
import { crc32, readZip, writeZip } from './zip';
import { emptyArchive, type Archive } from './schema';
import { demoArchive } from '../demo/persona';

const bytes = (s: string) => new TextEncoder().encode(s);

async function withAttachment(): Promise<{ a: Archive; files: Map<string, Uint8Array> }> {
  const data = new Uint8Array([1, 2, 3, 250, 0, 9]);
  const a = emptyArchive('Ada', new Date('2026-01-01T00:00:00Z'));
  a.attachments.push({
    id: 'att1',
    filename: 'photo.jpg',
    mediaType: 'image/jpeg',
    bytes: data.length,
    sha256: await sha256Hex(data),
    path: 'attachments/att1.jpg',
  });
  return { a, files: new Map([['attachments/att1.jpg', data]]) };
}

describe('zip', () => {
  it('matches the known CRC-32 check value', () => {
    expect(crc32(bytes('123456789'))).toBe(0xcbf43926);
  });
  it('round-trips entries including unicode names', () => {
    const m = new Map([
      ['a.txt', bytes('hello')],
      ['dir/é.bin', new Uint8Array([0, 255])],
    ]);
    const r = readZip(writeZip(m));
    expect([...r.keys()]).toEqual(['a.txt', 'dir/é.bin']);
    expect(r.get('dir/é.bin')).toEqual(new Uint8Array([0, 255]));
  });
  it('rejects path traversal and corruption', () => {
    expect(() => writeZip(new Map([['../x', bytes('x')]]))).toThrow();
    const z = writeZip(new Map([['a.txt', bytes('hello world')]]));
    z[40] = (z[40] ?? 0) ^ 0xff; // flip a data byte
    expect(() => readZip(z)).toThrow(/crc/);
    expect(() => readZip(bytes('not a zip at all, definitely'))).toThrow();
  });
});

describe('bundle', () => {
  it('round-trips the demo archive', async () => {
    const a = demoArchive();
    const back = await importBundle(await exportBundle(a));
    expect(back.archive).toEqual(a);
  });

  it('round-trips attachments with sha256 verification', async () => {
    const { a, files } = await withAttachment();
    const back = await importBundle(await exportBundle(a, files));
    expect(back.files.get('attachments/att1.jpg')).toEqual(files.get('attachments/att1.jpg'));
  });

  it('refuses to export mismatched or missing attachments', async () => {
    const { a } = await withAttachment();
    await expect(exportBundle(a)).rejects.toThrow(/missing/);
    await expect(
      exportBundle(a, new Map([['attachments/att1.jpg', new Uint8Array([1, 2, 3, 250, 0, 8])]])),
    ).rejects.toThrow(/sha256/);
  });

  it('detects a tampered attachment on import (valid zip, wrong content)', async () => {
    const { a, files } = await withAttachment();
    const entries = readZip(await exportBundle(a, files));
    entries.set('attachments/att1.jpg', new Uint8Array([9, 9, 9, 9, 9, 9]));
    await expect(importBundle(writeZip(entries))).rejects.toThrow(/sha256/);
  });

  it('rejects bundles without archive.json or with an invalid archive', async () => {
    await expect(importBundle(writeZip(new Map([['x', bytes('1')]])))).rejects.toThrow(
      /archive.json/,
    );
    await expect(
      importBundle(writeZip(new Map([['archive.json', bytes('{"format":"nope"}')]]))),
    ).rejects.toBeInstanceOf(BundleError);
    await expect(importBundle(bytes('garbage'))).rejects.toBeInstanceOf(BundleError);
  });

  it('includes a script-free, escaped, disclosure-bearing viewer.html', async () => {
    const a = emptyArchive('<b>Eve</b>');
    a.sources.push({ id: 's', kind: 'typed', label: 'x', importedAt: '2026-01-01' });
    a.memories.push({
      id: 'm',
      date: '2020-05-01',
      text: '<script>alert(1)</script>',
      sourceId: 's',
    });
    const html = new TextDecoder().decode(readZip(await exportBundle(a)).get('viewer.html'));
    expect(html).not.toContain('<script');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('AI reconstruction');
    expect(html).toContain("default-src 'none'");
  });
});
