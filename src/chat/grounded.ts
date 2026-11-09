import type { Archive } from '../archive/schema';
import { allowedMemories, gateQuestion } from '../identity/legacy';
import type { SemanticIndex } from '../retrieval/search';

export const AI_LABEL = 'AI reconstruction';
export const ABSTAIN_TEXT = "I don't remember that.";

/**
 * Minimum cosine similarity (hashing embedder) for a memory to count as relevant. Tuned on
 * DEMO_EVAL vs OUT_OF_SCOPE in chat.test.ts. Hashing scores overlap slightly (in-scope 0.115-0.40,
 * out-of-scope <= 0.134), so 0.14 favours abstaining over answering wrongly. Neural embedders need their own value.
 */
export const DEFAULT_THRESHOLD = 0.14;

export interface Citation {
  memoryId: string;
  date: string;
  score: number;
}

export interface ChatReply {
  /** Always true: every twin output is labelled. */
  aiLabel: typeof AI_LABEL;
  text: string;
  citations: Citation[];
  abstained: boolean;
}

export interface GroundedOptions {
  threshold?: number;
  /** Max memories quoted. */
  maxCitations?: number;
}

const labelled = (r: Omit<ChatReply, 'aiLabel'>): ChatReply => ({ aiLabel: AI_LABEL, ...r });

/**
 * Retrieval-only answer: quotes the subject's own recorded memories and cites them by id, or
 * abstains when nothing scores above the threshold. Deterministic for a given index and question.
 * Off-limits topics are refused before any retrieval, and off-limits memories are never quoted.
 */
export async function groundedAnswer(
  archive: Archive,
  index: SemanticIndex,
  question: string,
  opts: GroundedOptions = {},
): Promise<ChatReply> {
  const q = question.trim();
  if (!q) return labelled({ text: 'Ask me something.', citations: [], abstained: true });
  const gate = gateQuestion(archive, q);
  if (!gate.ok) return labelled({ text: gate.reply, citations: [], abstained: true });

  const threshold = opts.threshold ?? DEFAULT_THRESHOLD;
  const allowed = new Map(allowedMemories(archive).map((m) => [m.id, m]));
  const hits = (await index.search(q, 6))
    .filter((h) => allowed.has(h.memoryId) && h.score >= threshold)
    .slice(0, opts.maxCitations ?? 2);
  if (!hits.length) return labelled({ text: ABSTAIN_TEXT, citations: [], abstained: true });

  // A second memory is only quoted when it is nearly as relevant as the first.
  const top = hits[0]!.score;
  const used = hits.filter((h, i) => i === 0 || h.score >= top * 0.75);
  return labelled({
    text: used.map((h) => allowed.get(h.memoryId)!.text).join(' … '),
    citations: used.map((h) => ({
      memoryId: h.memoryId,
      date: allowed.get(h.memoryId)!.date.slice(0, 10),
      score: Number(h.score.toFixed(4)),
    })),
    abstained: false,
  });
}
