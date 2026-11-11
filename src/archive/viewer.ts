import type { Archive } from './schema';

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

/** A self-contained, read-only HTML page: no scripts, no network, readable decades from now. */
export function viewerHtml(a: Archive): string {
  const people = new Map(a.people.map((p) => [p.id, p.name]));
  const mems = [...a.memories].sort((x, y) => x.date.localeCompare(y.date));
  const items = mems
    .map((m) => {
      const who = (m.people ?? []).map((id) => people.get(id) ?? id).join(', ');
      return `<article id="${esc(m.id)}"><h2>${esc(m.date.slice(0, 10))}</h2><p>${esc(m.text)}</p>${
        who || m.place
          ? `<p class="meta">${esc([who, m.place ?? ''].filter(Boolean).join(' · '))}</p>`
          : ''
      }</article>`;
    })
    .join('\n');
  const att = a.attachments.length
    ? `<h2>Attachments</h2><ul>${a.attachments
        .map((f) => `<li><a href="${esc(f.path)}">${esc(f.filename)}</a> (${f.bytes} bytes)</li>`)
        .join('')}</ul>`
    : '';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'self'">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(a.subject.displayName)} – Evermind archive</title>
<style>body{font:16px/1.6 Georgia,serif;max-width:42rem;margin:2rem auto;padding:0 1rem}.note{border:1px solid #999;padding:.6rem;background:#f6f3ea}.meta{color:#666;font-size:.9rem}article{margin:1.5rem 0}h2{font-size:1rem;margin:0}</style>
</head><body>
<p class="note" role="note">⚠ ${esc(a.aiDisclosure)}</p>
<h1>${esc(a.subject.displayName)}</h1>
<p>${mems.length} memories · exported ${esc(a.createdAt.slice(0, 10))} · read-only</p>
${items}
${att}
</body></html>
`;
}
