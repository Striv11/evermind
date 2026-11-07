import type { Archive } from '../archive/schema';
import { buildGraph, layout, memoriesOf, type GraphNode } from '../graph/graph';
import { h } from './dom';

const NS = 'http://www.w3.org/2000/svg';
function s<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
  ...kids: (Node | string)[]
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  for (const c of kids) el.append(c);
  return el;
}

const W = 640;
const H = 420;

/** SVG timeline: one dot per memory on a time axis. Clicking a dot shows the memory. */
export function timelineSvg(a: Archive, onPick: (id: string) => void): SVGSVGElement {
  const ms = [...a.memories].sort((x, y) => x.date.localeCompare(y.date));
  const t = (d: string) => Date.parse(d.length === 4 ? `${d}-01-01` : d);
  const svg = s('svg', {
    viewBox: `0 0 ${W} 120`,
    role: 'img',
    class: 'viz',
    'data-testid': 'timeline-svg',
  });
  svg.append(s('title', {}, `Timeline of ${ms.length} memories`));
  if (!ms.length) return svg;
  const lo = t(ms[0]!.date);
  const span = Math.max(1, t(ms[ms.length - 1]!.date) - lo);
  svg.append(s('line', { x1: 20, x2: W - 20, y1: 60, y2: 60, class: 'axis' }));
  ms.forEach((m, i) => {
    const x = 30 + ((t(m.date) - lo) / span) * (W - 60);
    const y = i % 2 ? 80 : 40;
    const g = s('g', {
      class: 'pt',
      tabindex: 0,
      role: 'button',
      'aria-label': `${m.date.slice(0, 4)}: ${m.text.slice(0, 60)}`,
      'data-memory': m.id,
    });
    g.append(
      s('circle', { cx: x, cy: 60, r: 6 }),
      s('text', { x, y, 'text-anchor': 'middle' }, m.date.slice(0, 4)),
    );
    const pick = () => onPick(m.id);
    g.addEventListener('click', pick);
    g.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        pick();
      }
    });
    svg.append(g);
  });
  return svg;
}

/**
 * Knowledge graph: force-directed SVG plus a plain list of the same nodes. The list is the
 * accessible fallback and is always present, so keyboard and screen-reader users lose nothing.
 */
export function graphSection(a: Archive): HTMLElement {
  const g = buildGraph(a);
  const pos = layout(g, W, H);
  const detail = h(
    'div',
    { class: 'detail', 'aria-live': 'polite', 'data-testid': 'graph-detail' },
    h('p', { class: 'empty' }, 'Select a node or timeline dot to see the memories behind it.'),
  );
  const show = (title: string, memoryIds: string[], note?: string) => {
    const byId = new Map(a.memories.map((m) => [m.id, m]));
    detail.replaceChildren(
      h('h3', {}, title),
      ...(note ? [h('p', { class: 'meta' }, note)] : []),
      memoryIds.length
        ? h(
            'ul',
            {},
            ...memoryIds
              .map((id) => byId.get(id))
              .filter((m) => !!m)
              .map((m) =>
                h('li', { 'data-testid': 'source-memory' }, `${m.date.slice(0, 10)}: ${m.text}`),
              ),
          )
        : h('p', { class: 'empty' }, 'No source memories recorded for this.'),
    );
  };
  const pick = (n: GraphNode) => {
    const rel = g.edges.filter((e) => e.from === n.id || e.to === n.id).length;
    show(
      n.label,
      memoriesOf(a, n).map((m) => m.id),
      `${n.kind} · ${rel} connection${rel === 1 ? '' : 's'}`,
    );
  };

  const svg = s('svg', {
    viewBox: `0 0 ${W} ${H}`,
    role: 'group',
    'aria-label': 'Knowledge graph',
    class: 'viz',
    'data-testid': 'graph-svg',
  });
  for (const e of g.edges) {
    const p = pos.get(e.from)!;
    const q = pos.get(e.to)!;
    svg.append(
      s('line', {
        x1: p.x,
        y1: p.y,
        x2: q.x,
        y2: q.y,
        class: 'edge',
        'stroke-opacity': 0.35 + 0.65 * e.confidence,
      }),
      s(
        'text',
        { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, class: 'elabel', 'text-anchor': 'middle' },
        e.label,
      ),
    );
  }
  for (const n of g.nodes) {
    const p = pos.get(n.id)!;
    const el = s('g', {
      class: `node ${n.kind}`,
      tabindex: 0,
      role: 'button',
      'aria-label': `${n.label}, ${n.kind}`,
      'data-node': n.label,
    });
    el.append(
      s('circle', { cx: p.x, cy: p.y, r: 6 + Math.min(8, n.degree * 2) }),
      s(
        'text',
        { x: p.x, y: p.y - 12, 'text-anchor': 'middle' },
        n.label.length > 22 ? n.label.slice(0, 21) + '…' : n.label,
      ),
    );
    el.addEventListener('click', () => pick(n));
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        pick(n);
      }
    });
    svg.append(el);
  }

  const list = h(
    'ul',
    { class: 'node-list', 'data-testid': 'node-list' },
    ...g.nodes.map((n) => {
      const out = g.edges
        .filter((e) => e.from === n.id || e.to === n.id)
        .map((e) => {
          const other = g.nodes.find((x) => x.id === (e.from === n.id ? e.to : e.from))!;
          return e.from === n.id ? `${e.label} ${other.label}` : `${other.label} ${e.label} it`;
        });
      const btn = h('button', { class: 'linkish', type: 'button' }, n.label);
      btn.addEventListener('click', () => pick(n));
      return h('li', {}, btn, h('span', { class: 'meta' }, ` (${n.kind}) ${out.join('; ')}`));
    }),
  );

  const tl = timelineSvg(a, (id) => {
    const m = a.memories.find((x) => x.id === id)!;
    show(m.date.slice(0, 10), [id]);
  });
  return h(
    'section',
    { 'aria-labelledby': 'kg' },
    h(
      'h2',
      { id: 'kg' },
      `Timeline and knowledge graph (${g.nodes.length} nodes, ${g.edges.length} facts)`,
    ),
    tl,
    svg,
    h('details', {}, h('summary', {}, 'Same graph as a list'), list),
    detail,
  );
}
