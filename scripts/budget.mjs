// Asserts the initial-JS budget on the production build (run after `vite build`).
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const LIMIT_KB = 60;
const dir = new URL('../dist/assets/', import.meta.url);
const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
// Initial JS = scripts and modulepreloads referenced by index.html. Lazy chunks and workers do not count.
const refs = [...html.matchAll(/(?:src|href)="\.\/assets\/([^"]+\.js)"/g)].map((m) => m[1]);
if (!refs.length) {
  console.error('budget: no JS referenced from dist/index.html');
  process.exit(1);
}
let total = 0;
for (const f of new Set(refs)) {
  const kb = gzipSync(readFileSync(new URL(f, dir))).length / 1024;
  console.log(`budget: ${f} ${kb.toFixed(1)} KB gzip`);
  total += kb;
}
console.log(`budget: initial JS ${total.toFixed(1)} KB gzip (limit ${LIMIT_KB})`);
if (total > LIMIT_KB) {
  console.error('budget: initial JS over budget');
  process.exit(1);
}
