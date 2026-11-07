import type { Archive, EpisodicMemory } from '../archive/schema';

export type NodeKind = 'self' | 'person' | 'place' | 'thing';

export interface GraphNode {
  id: string;
  label: string;
  kind: NodeKind;
  /** Memories that mention this node, oldest first. */
  memoryIds: string[];
  degree: number;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  label: string;
  confidence: number;
  factId: string;
}

export interface KnowledgeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Builds the graph from the archive's facts. A node's evidence is the union of the memories
 * behind its facts and the memories that name it directly (people, place).
 */
export function buildGraph(a: Archive): KnowledgeGraph {
  const self = norm(a.subject.displayName.replace(/\s*\(.*\)\s*$/, '').split(/\s+/)[0] ?? '');
  const people = new Map(a.people.map((p) => [norm(p.name), p.id]));
  const byId = new Map(a.memories.map((m) => [m.id, m]));
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];

  const kindOf = (label: string): NodeKind => {
    const n = norm(label);
    if (n === self) return 'self';
    if (people.has(n)) return 'person';
    if (a.memories.some((m) => m.place && norm(m.place) === n)) return 'place';
    return 'thing';
  };
  const node = (label: string): GraphNode => {
    const k = norm(label);
    let n = nodes.get(k);
    if (!n) {
      n = { id: `n:${k}`, label, kind: kindOf(label), memoryIds: [], degree: 0 };
      nodes.set(k, n);
    }
    return n;
  };
  const evidence = (n: GraphNode, ids: Iterable<string>) => {
    for (const id of ids) if (byId.has(id) && !n.memoryIds.includes(id)) n.memoryIds.push(id);
  };

  for (const f of a.facts) {
    const s = node(f.subject);
    const o = node(f.object);
    const mids = f.memoryIds ?? [];
    evidence(s, mids);
    evidence(o, mids);
    s.degree++;
    o.degree++;
    edges.push({
      id: `e:${f.id}`,
      from: s.id,
      to: o.id,
      label: f.predicate,
      confidence: f.confidence,
      factId: f.id,
    });
  }
  // Direct mentions: a person or place node is evidence for every memory that names it.
  for (const m of a.memories) {
    for (const pid of m.people ?? []) {
      const name = a.people.find((p) => p.id === pid)?.name;
      if (name && nodes.has(norm(name))) evidence(nodes.get(norm(name))!, [m.id]);
    }
    if (m.place && nodes.has(norm(m.place))) evidence(nodes.get(norm(m.place))!, [m.id]);
  }
  const chrono = (ids: string[]) =>
    ids.sort((x, y) => byId.get(x)!.date.localeCompare(byId.get(y)!.date));
  const list = [...nodes.values()];
  list.forEach((n) => chrono(n.memoryIds));
  return { nodes: list, edges };
}

export function memoriesOf(a: Archive, n: GraphNode): EpisodicMemory[] {
  const byId = new Map(a.memories.map((m) => [m.id, m]));
  return n.memoryIds.map((id) => byId.get(id)!).filter(Boolean);
}

export interface Point {
  x: number;
  y: number;
}

/**
 * Deterministic Fruchterman-Reingold layout in a width x height box. Starts from a circle
 * (no randomness), so the same graph always renders identically.
 */
export function layout(
  g: KnowledgeGraph,
  width = 640,
  height = 420,
  iterations = 200,
): Map<string, Point> {
  const n = g.nodes.length;
  const pos = new Map<string, Point>();
  if (n === 0) return pos;
  const cx = width / 2;
  const cy = height / 2;
  g.nodes.forEach((node, i) => {
    const ang = (2 * Math.PI * i) / n;
    pos.set(node.id, { x: cx + Math.cos(ang) * width * 0.3, y: cy + Math.sin(ang) * height * 0.3 });
  });
  if (n === 1) return pos.set(g.nodes[0]!.id, { x: cx, y: cy });
  const k = Math.sqrt((width * height) / n) * 0.7;
  let temp = width / 8;
  for (let it = 0; it < iterations; it++) {
    const disp = new Map<string, Point>(g.nodes.map((v) => [v.id, { x: 0, y: 0 }]));
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const a = pos.get(g.nodes[i]!.id)!;
        const b = pos.get(g.nodes[j]!.id)!;
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        const d = Math.hypot(dx, dy) || 0.01;
        dx /= d;
        dy /= d;
        const f = (k * k) / d;
        const da = disp.get(g.nodes[i]!.id)!;
        const db = disp.get(g.nodes[j]!.id)!;
        da.x += dx * f;
        da.y += dy * f;
        db.x -= dx * f;
        db.y -= dy * f;
      }
    for (const e of g.edges) {
      const a = pos.get(e.from)!;
      const b = pos.get(e.to)!;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const d = Math.hypot(dx, dy) || 0.01;
      const f = (d * d) / k;
      const da = disp.get(e.from)!;
      const db = disp.get(e.to)!;
      da.x -= (dx / d) * f;
      da.y -= (dy / d) * f;
      db.x += (dx / d) * f;
      db.y += (dy / d) * f;
    }
    for (const v of g.nodes) {
      const p = pos.get(v.id)!;
      const d = disp.get(v.id)!;
      const len = Math.hypot(d.x, d.y) || 0.01;
      const step = Math.min(len, temp);
      p.x = Math.min(width - 30, Math.max(30, p.x + (d.x / len) * step));
      p.y = Math.min(height - 20, Math.max(20, p.y + (d.y / len) * step));
    }
    temp *= 0.97;
  }
  return pos;
}
