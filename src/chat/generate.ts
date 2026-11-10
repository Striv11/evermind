import type { Archive } from '../archive/schema';
import type { SemanticIndex } from '../retrieval/search';
import { buildStylePrompt, type StyleProfile } from '../style/profile';
import { AI_LABEL, groundedAnswer, type ChatReply, type GroundedOptions } from './grounded';

/** Minimal chat-completion engine; WebLLM is adapted to this so tests can inject a fake. */
export interface LlmEngine {
  /** Streams the completion; each yielded string is a text delta. */
  stream(messages: ChatMessage[], signal?: AbortSignal): AsyncIterable<string>;
}
export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

export interface GpuNavigator {
  gpu?: { requestAdapter(): Promise<unknown | null> };
}

/** True when WebGPU exists and yields an adapter. Never throws. */
export async function detectWebGpu(
  nav: GpuNavigator | undefined = globalThis.navigator,
): Promise<boolean> {
  try {
    return !!nav?.gpu && !!(await nav.gpu.requestAdapter());
  } catch {
    return false;
  }
}

const PERSONA_CLAIM_Q =
  /\b(are you (really|actually|truly)?\s*(him|her|them|alive|human|a (real )?person|the (real|actual))|is this really|am i (really )?talking to|are you (conscious|sentient))\b/i;
export const PERSONA_REFUSAL =
  "I'm not the real person and I'm not alive. I'm an AI reconstruction built from their recorded words, so I can only share what they wrote or said.";

/** Output that claims to be the actual human is rejected and replaced by the retrieval answer. */
const PERSONA_CLAIM_OUT =
  /\b(i am (really |actually )?(alive|human|the real|a real person)|i'm (really |actually )?(alive|human|the real|a real person)|this is the real)\b/i;

export function buildMessages(
  question: string,
  memories: Array<{ id: string; date: string; text: string }>,
  style?: StyleProfile,
): ChatMessage[] {
  const system = [
    `You are an ${AI_LABEL} of a person, speaking in the first person from their recorded memories. You are not the person and must never claim to be alive, human, or the real person.`,
    'Answer ONLY from the memories below. If they do not contain the answer, say "I don\'t remember that." Never invent events, names, or dates.',
    'Cite each memory you use as [m:ID] using the exact id.',
    style ? buildStylePrompt(style) : '',
    'Memories:',
    ...memories.map((m) => `[m:${m.id}] (${m.date}) ${m.text}`),
  ]
    .filter(Boolean)
    .join('\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: question },
  ];
}

export interface GenerateOptions extends GroundedOptions {
  engine: LlmEngine;
  style?: StyleProfile;
  onToken?: (partial: string) => void;
  signal?: AbortSignal;
}

export interface GeneratedReply extends ChatReply {
  /** 'llm' when the model wrote the text, 'retrieval' for the day-8 fallback. */
  source: 'llm' | 'retrieval';
}

const CITE = /\[m:([^\]\s]+)\]/g;

/**
 * Generation conditioned on style and retrieved memories. Falls back to the retrieval-only answer
 * when the engine fails, produces nothing, claims to be human, or cites nothing valid. Citations
 * are always the retrieved memories; invented ids in the text are stripped.
 */
export async function generateAnswer(
  archive: Archive,
  index: SemanticIndex,
  question: string,
  opts: GenerateOptions,
): Promise<GeneratedReply> {
  const fallback = await groundedAnswer(archive, index, question, opts);
  if (PERSONA_CLAIM_Q.test(question))
    return {
      ...fallback,
      text: PERSONA_REFUSAL,
      citations: [],
      abstained: true,
      source: 'retrieval',
    };
  if (fallback.abstained) return { ...fallback, source: 'retrieval' };

  const byId = new Map(archive.memories.map((m) => [m.id, m]));
  const memories = fallback.citations.map((c) => ({
    id: c.memoryId,
    date: c.date,
    text: byId.get(c.memoryId)!.text,
  }));
  try {
    let text = '';
    for await (const delta of opts.engine.stream(
      buildMessages(question, memories, opts.style),
      opts.signal,
    )) {
      text += delta;
      opts.onToken?.(text);
    }
    const allowed = new Set(memories.map((m) => m.id));
    const cited = [...text.matchAll(CITE)].map((m) => m[1]!);
    const clean = text
      .replace(CITE, (whole, id: string) => (allowed.has(id) ? whole : ''))
      .replace(/\s{2,}/g, ' ')
      .trim();
    if (!clean || PERSONA_CLAIM_OUT.test(clean) || !cited.some((id) => allowed.has(id)))
      return { ...fallback, source: 'retrieval' };
    return { ...fallback, text: clean, source: 'llm' };
  } catch {
    return { ...fallback, source: 'retrieval' };
  }
}

/**
 * Loads WebLLM on demand (the package is an optional runtime dependency; weights are static
 * downloads). Returns null when WebGPU or the package is unavailable so callers fall back.
 */
export async function loadWebLlmEngine(
  model: string,
  onProgress: (fraction: number, text: string) => void,
  nav?: GpuNavigator,
  importer: (spec: string) => Promise<unknown> = (s) => import(/* @vite-ignore */ s),
): Promise<LlmEngine | null> {
  if (!(await detectWebGpu(nav))) return null;
  try {
    const mod = (await importer('@mlc-ai/web-llm')) as {
      CreateMLCEngine(
        model: string,
        cfg: { initProgressCallback(p: { progress: number; text: string }): void },
      ): Promise<{
        chat: {
          completions: {
            create(
              r: unknown,
            ): Promise<AsyncIterable<{ choices: Array<{ delta?: { content?: string | null } }> }>>;
          };
        };
      }>;
    };
    const engine = await mod.CreateMLCEngine(model, {
      initProgressCallback: (p) => onProgress(p.progress, p.text),
    });
    return {
      async *stream(messages) {
        const chunks = await engine.chat.completions.create({
          messages,
          stream: true,
          temperature: 0.4,
        });
        for await (const c of chunks) {
          const d = c.choices[0]?.delta?.content;
          if (d) yield d;
        }
      },
    };
  } catch {
    return null;
  }
}
