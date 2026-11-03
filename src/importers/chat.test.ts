import { describe, expect, it } from 'vitest';
import { emptyArchive } from '../archive/schema';
import { validateArchive } from '../archive/validate';
import { detectFormat, listAuthors, parseMbox, parseTelegram, parseWhatsApp } from './chat';
import { importChat } from './ingest';

const WA = `[12/03/2019, 10:15:32] Anna: Hello there
[12/03/2019, 10:16:01] Ben: Hi! This is a
second line of the same message
and a third.
12/03/2019, 10:20 - Messages and calls are end-to-end encrypted.
[13/03/2019, 09:00:00] Anna: <Media omitted>
[13/03/2019, 09:01:00] Anna: My mother taught me to bake bread.`;

describe('WhatsApp', () => {
  it('joins multi-line messages, skips system and media lines', () => {
    const m = parseWhatsApp(WA);
    expect(m.map((x) => x.author)).toEqual(['Anna', 'Ben', 'Anna']);
    expect(m[1]!.text).toBe('Hi! This is a\nsecond line of the same message\nand a third.');
    expect(m[0]!.date).toBe('2019-03-12');
  });
  it('handles the Android 12-hour month-first format', () => {
    const m = parseWhatsApp(
      '3/14/19, 9:05 PM - Sam: late night thoughts\n3/15/19, 9:05 AM - Sam: more',
    );
    expect(m[0]!.date).toBe('2019-03-14');
    expect(m).toHaveLength(2);
  });
  it('rejects text that is not a chat', () => {
    expect(() => parseWhatsApp('just prose')).toThrow(/WhatsApp/);
  });
});

describe('Telegram', () => {
  it('flattens rich text and ignores service messages', () => {
    const json = JSON.stringify({
      messages: [
        { type: 'service', from: 'Anna', date: '2020-01-02T10:00:00', text: '' },
        {
          type: 'message',
          from: 'Anna',
          date: '2020-01-02T10:00:00',
          text: [{ type: 'bold', text: 'Hi' }, ' there'],
        },
        { type: 'message', from: 'Ben', date: '2020-01-03T10:00:00', text: 'yo' },
      ],
    });
    const m = parseTelegram(json);
    expect(m).toEqual([
      { author: 'Anna', date: '2020-01-02', text: 'Hi there' },
      { author: 'Ben', date: '2020-01-03', text: 'yo' },
    ]);
  });
  it('reports bad JSON', () => {
    expect(() => parseTelegram('{nope')).toThrow(/JSON/);
  });
});

const MBOX = `From anna@x.org Mon Mar 04 10:00:00 2019
From: Anna <Anna@X.org>
Date: Mon, 4 Mar 2019 10:00:00 +0000
Subject: hi
Content-Type: text/plain; charset=utf-8
Content-Transfer-Encoding: quoted-printable

Caf=C3=A9 plans are =
set.
> quoted from Ben
On Sun, Ben wrote:
old stuff

From ben@x.org Tue Mar 05 10:00:00 2019
From: =?UTF-8?B?QmVuIELDqQ==?= <ben@x.org>
Date: Tue, 5 Mar 2019 10:00:00 +0000
Content-Type: text/plain; charset=utf-8
Content-Transfer-Encoding: base64

SGVsbG8gZnJvbSBCZW4=

From anna@x.org Wed Mar 06 10:00:00 2019
From: Anna <anna@x.org>
Date: Wed, 6 Mar 2019 10:00:00 +0000
Content-Type: multipart/alternative; boundary="b1"

--b1
Content-Type: text/html

<p>html</p>
--b1
Content-Type: text/plain; charset=utf-8

Plain part wins.
--b1--
`;

describe('mbox', () => {
  it('decodes quoted-printable, base64, multipart and strips quotes', () => {
    const m = parseMbox(MBOX);
    expect(m).toHaveLength(3);
    expect(m[0]).toEqual({ author: 'anna@x.org', date: '2019-03-04', text: 'Café plans are set.' });
    expect(m[1]!.text).toBe('Hello from Ben');
    expect(m[2]!.text).toBe('Plain part wins.');
  });
  it('rejects non-mbox input', () => {
    expect(() => parseMbox('hello')).toThrow(/mbox/);
  });
});

describe('detectFormat', () => {
  it('recognises each format', () => {
    expect(detectFormat('result.json', '{"messages":[]}')).toBe('telegram');
    expect(detectFormat('x.mbox', MBOX)).toBe('mbox');
    expect(detectFormat('chat.txt', WA)).toBe('whatsapp');
    expect(detectFormat('notes.txt', 'hello')).toBeNull();
  });
});

describe('importChat', () => {
  it('keeps only the chosen author and produces a valid archive', () => {
    const msgs = parseWhatsApp(WA);
    expect(listAuthors(msgs)[0]).toEqual({ author: 'Anna', count: 2 });
    const r = importChat(emptyArchive('Anna'), msgs, {
      format: 'whatsapp',
      label: 'chat.txt',
      self: ['anna'],
      minMemoryWords: 3,
    });
    const texts = r.archive.voiceSamples.map((v) => v.text);
    expect(texts).toEqual(['Hello there', 'My mother taught me to bake bread.']);
    expect(r.archive.voiceSamples.some((v) => v.text.includes('second line'))).toBe(false);
    expect(r.archive.memories.every((x) => !x.text.includes('Hi!'))).toBe(true);
    expect(r.archive.sources[0]!.kind).toBe('whatsapp');
    expect(validateArchive(r.archive).ok).toBe(true);
  });
  it('reports when the author has no messages', () => {
    const r = importChat(emptyArchive('x'), parseWhatsApp(WA), {
      format: 'whatsapp',
      label: 'c',
      self: ['Zed'],
    });
    expect(r.added).toBe(0);
    expect(r.errors).toHaveLength(1);
  });
});

describe('performance', () => {
  it('parses a 1 MB WhatsApp export in under 500 ms', () => {
    const lines: string[] = [];
    let i = 0;
    while (lines.join('\n').length < 1_000_000 && i < 40_000) {
      for (let k = 0; k < 500; k++, i++) {
        lines.push(
          `[${String((i % 28) + 1).padStart(2, '0')}/03/2019, 10:${String(i % 60).padStart(2, '0')}:00] ${i % 2 ? 'Ben' : 'Anna'}: message number ${i} with some words`,
        );
      }
    }
    const text = lines.join('\n');
    expect(text.length).toBeGreaterThan(1_000_000);
    const t = performance.now();
    const m = parseWhatsApp(text);
    expect(performance.now() - t).toBeLessThan(500);
    expect(m.length).toBe(lines.length);
  });
});
