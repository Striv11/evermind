/**
 * Printable life book: the subject's memories as chapters by decade, each entry
 * cited by memory id and source. Self-contained HTML with print CSS (no scripts,
 * no network). Sealed capsules are never included.
 */
import type { Archive, EpisodicMemory } from '../archive/schema';

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

export interface Chapter {
  title: string;
  memories: EpisodicMemory[];
}

/** Group memories into decades ("1980s"), oldest first; undated ones go last. */
export function chaptersByDecade(memories: EpisodicMemory[]): Chapter[] {
  const by = new Map<string, EpisodicMemory[]>();
  const sorted = [...memories].sort(
    (x, y) => x.date.localeCompare(y.date) || x.id.localeCompare(y.id),
  );
  for (const m of sorted) {
    const year = /^(\d{4})/.exec(m.date)?.[1];
    const key = year ? `${year.slice(0, 3)}0s` : 'Undated';
    by.set(key, [...(by.get(key) ?? []), m]);
  }
  const keys = [...by.keys()].sort((a, b) =>
    a === 'Undated' ? 1 : b === 'Undated' ? -1 : a.localeCompare(b),
  );
  return keys.map((title) => ({ title, memories: by.get(title)! }));
}

export function lifeBookHtml(a: Archive): string {
  const people = new Map(a.people.map((p) => [p.id, p.name]));
  const sources = new Map(a.sources.map((s) => [s.id, s.label]));
  const chapters = chaptersByDecade(a.memories);
  const body = chapters
    .map(
      (ch, i) =>
        `<section class="chapter"><h2>Chapter ${i + 1}: ${esc(ch.title)}</h2>\n${ch.memories
          .map((m) => {
            const who = (m.people ?? []).map((id) => people.get(id) ?? id).join(', ');
            const meta = [who, m.place ?? ''].filter(Boolean).join(' · ');
            const src = sources.get(m.sourceId) ?? m.sourceId;
            return `<article id="${esc(m.id)}"><h3>${esc(m.date.slice(0, 10))}</h3><p>${esc(m.text)}</p>${
              meta ? `<p class="meta">${esc(meta)}</p>` : ''
            }<p class="cite">[${esc(m.id)}] from ${esc(src)}</p></article>`;
          })
          .join('\n')}</section>`,
    )
    .join('\n');
  const toc = chapters
    .map((ch, i) => `<li>Chapter ${i + 1}: ${esc(ch.title)} (${ch.memories.length})</li>`)
    .join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(a.subject.displayName)}: a life in memories</title>
<style>
body{font:12pt/1.6 Georgia,serif;max-width:40rem;margin:2rem auto;padding:0 1rem;color:#111}
.note{border:1px solid #999;padding:.6rem;background:#f6f3ea;font-size:10pt}
.title{text-align:center;margin:4rem 0}
h2{font-size:18pt;border-bottom:1px solid #999;padding-bottom:.2rem}
h3{font-size:11pt;margin:0;color:#444}
article{margin:1rem 0;break-inside:avoid}
.meta,.cite{color:#666;font-size:9pt;margin:.2rem 0}
@page{margin:2cm}
@media print{body{max-width:none;margin:0;padding:0}.chapter{break-before:page}.title{break-after:page}.note{border-color:#000;background:none}}
</style>
</head><body>
<div class="title"><h1>${esc(a.subject.displayName)}</h1><p>A life in memories</p><p>${a.memories.length} memories · compiled ${esc(a.createdAt.slice(0, 10))}</p>
<p class="note" role="note">${esc(a.aiDisclosure)}</p>
<ol>${toc}</ol></div>
${body || '<p>No memories yet.</p>'}
</body></html>
`;
}
