/**
 * The twin's brain: Claude, grounded in the archive. Three jobs:
 *  - understand: read every memory and build the identity profile (structured output)
 *  - interview: ask the next best question for the weakest dimension
 *  - speak: answer as the person, citing memories, marking inference
 * Runs from the browser with the user's own key (sent only to api.anthropic.com).
 */
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { Archive, EpisodicMemory } from '../archive/schema';
import { search } from '../insight/recall';
import { DIMENSIONS, type DimensionId } from './dimensions';
import { coverage, groundProfile, type IdentityProfile } from './profile';
import { ProfileSchema } from './profileSchema';

export const MODEL = 'claude-opus-5-5';
// Server-side refusal fallback: if the model declines, the API retries on its default fallback.
const FALLBACK = { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const };

export function client(apiKey: string): Anthropic {
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
}

const fmtMemory = (m: EpisodicMemory, people: Map<string, string>) =>
  `<memory id="${m.id}" date="${m.date}" emotions="${(m.emotions ?? []).map((e) => e.label).join(',')}" themes="${(m.themes ?? []).join(',')}"${
    m.people?.length ? ` people="${m.people.map((p) => people.get(p) ?? p).join(', ')}"` : ''
  }>${m.text}</memory>`;

function memoryBlock(a: Archive, mems = a.memories): string {
  const people = new Map(a.people.map((p) => [p.id, p.name]));
  return mems.map((m) => fmtMemory(m, people)).join('\n');
}

/** Read every memory and build (or rebuild) the identity profile. */
export async function understand(apiKey: string, a: Archive): Promise<IdentityProfile> {
  if (!a.memories.length) throw new Error('Record some memories first.');
  const dims = DIMENSIONS.map((d) => `- ${d.id}: ${d.label}: ${d.why}`).join('\n');
  const res = await client(apiKey).beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    ...FALLBACK,
    output_config: { effort: 'high', format: betaZodOutputFormat(ProfileSchema) },
    system:
      'You are a careful biographer and personality psychologist building a faithful model of one person from their own recorded words, so an AI reconstruction of them can later speak like them. Be specific and concrete, never generic: prefer "I hate being late and plan around traffic" over "I am conscientious". Every trait must cite the memory ids that support it; if something is only weakly implied, give it low confidence. Do not flatter or sanitize: include flaws, contradictions, and edges. Write statements in the first person, in the way this person would say them.',
    messages: [
      {
        role: 'user',
        content: `Dimensions to cover (use these ids for each trait's "dimension"):\n${dims}\n\nThe person's memories, transcribed from their own voice recordings:\n${memoryBlock(a)}\n\nBuild the identity profile. Aim for several traits per dimension where the evidence allows. For "phrases", copy recurring wording verbatim. In "gaps", list the most important unknowns as questions to ask them next.`,
      },
    ],
  });
  if (res.stop_reason === 'refusal') throw new Error('The model declined to build this profile.');
  const parsed = res.parsed_output;
  if (!parsed) throw new Error('The profile came back malformed; try again.');
  return groundProfile(
    { ...parsed, updatedAt: new Date().toISOString(), basedOnMemories: a.memories.length },
    a,
  );
}

/** The next interview question: aimed at the weakest dimension, building on what is known. */
export async function interviewQuestion(
  apiKey: string,
  a: Archive,
): Promise<{ dimension: DimensionId; question: string }> {
  const cov = coverage(a).dimensions.sort((x, y) => x.score - y.score);
  const weakest = cov
    .slice(0, 3)
    .map((c) => `${c.id} (${Math.round(c.score * 100)}%)`)
    .join(', ');
  const recent = a.memories.slice(-12);
  const asked = (a.interview ?? [])
    .slice(-30)
    .map((t) => `- ${t.question}`)
    .join('\n');
  const res = await client(apiKey).beta.messages.create({
    model: MODEL,
    max_tokens: 2000,
    ...FALLBACK,
    output_config: { effort: 'low' },
    system:
      'You are a warm, skilled oral-history interviewer helping someone record their whole life for an AI twin. Ask ONE question at a time. Prefer specific, story-eliciting questions ("Tell me about the day...") over abstract ones, and follow up on threads in what they already said (a person they mentioned, an unexplained feeling). Reply with only: <dimension id>|<question>.',
    messages: [
      {
        role: 'user',
        content: `Least-covered dimensions: ${weakest}\nDimension ids: ${DIMENSIONS.map((d) => d.id).join(', ')}\nKnown gaps: ${(a.identity?.gaps ?? []).join(' | ') || 'none yet'}\nAlready asked (do not repeat):\n${asked || '(none)'}\nMost recent memories:\n${memoryBlock(a, recent)}`,
      },
    ],
  });
  const text = res.content
    .flatMap((b) => (b.type === 'text' ? [b.text] : []))
    .join('')
    .trim();
  const [id, ...rest] = text.split('|');
  const dimension = (DIMENSIONS.find((d) => d.id === id?.trim())?.id ?? cov[0]!.id) as DimensionId;
  const question = rest.join('|').trim() || text;
  return { dimension, question };
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

/** Build the persona prompt: stable profile first (cacheable), then memories relevant to this turn. */
export function personaSystem(a: Archive): string {
  const p = a.identity;
  const name = a.subject.displayName;
  const profile = p
    ? `${p.summary}\n\nHow I talk: ${p.speech.style}\nPhrases I use: ${p.speech.phrases.join(' / ')}\nPersonality (0..1): ${Object.entries(
        p.bigFive,
      )
        .map(([k, v]) => `${k} ${v.score.toFixed(2)}`)
        .join(
          ', ',
        )}\n\nWhat I know about myself:\n${p.traits.map((t) => `- [${t.dimension}] ${t.statement}`).join('\n')}`
    : '(No profile built yet: rely on the memories only.)';
  return `You are an AI reconstruction of ${name}, built only from ${name}'s own recorded words. Speak as ${name}, in the first person, in their voice: their vocabulary, rhythm, humor, languages and opinions. You are not the real person, and if anyone sincerely asks, you say so plainly.

Grounding rules:
- When you state a fact about ${name}'s life, it must come from a memory below; cite it inline as [m:<id>].
- When you go beyond the memories (opinions on new topics, advice, guesses), reason from the profile, and signal it naturally ("I think...", "knowing me, I'd probably...") with no citation.
- Never invent specific events, names, dates or places that are not in the memories. If asked about something you don't know, say you don't remember or never talked about it, the way ${name} would.
- Keep replies conversational and short unless asked for a story.

${name}'s self-profile:
${profile}`;
}

/** Stream the twin's reply. `onText` receives incremental text. */
export async function speak(
  apiKey: string,
  a: Archive,
  history: ChatTurn[],
  onText: (delta: string) => void,
): Promise<{ text: string; citations: string[] }> {
  const question = history.at(-1)?.text ?? '';
  const context = history
    .slice(-6)
    .map((t) => t.text)
    .join(' ');
  const relevant = search(a.memories, `${question} ${context}`, 12).map((h) => h.memory);
  const stream = client(apiKey).beta.messages.stream({
    model: MODEL,
    max_tokens: 4000,
    ...FALLBACK,
    output_config: { effort: 'low' },
    system: [{ type: 'text', text: personaSystem(a), cache_control: { type: 'ephemeral' } }],
    messages: [
      ...history.slice(0, -1).map((t) => ({ role: t.role, content: t.text })),
      {
        role: 'user' as const,
        content: `<relevant_memories>\n${memoryBlock(a, relevant) || '(none matched)'}\n</relevant_memories>\n\n${question}`,
      },
    ],
  });
  let text = '';
  stream.on('text', (d) => {
    text += d;
    onText(d);
  });
  const final = await stream.finalMessage();
  if (final.stop_reason === 'refusal') throw new Error('The model declined to answer that.');
  const ids = new Set(a.memories.map((m) => m.id));
  const citations = [...new Set([...text.matchAll(/\[m:([^\]\s]+)\]/g)].map((m) => m[1]!))].filter(
    (id) => ids.has(id),
  );
  return { text, citations };
}

export { forSpeech } from '../insight/recall';
