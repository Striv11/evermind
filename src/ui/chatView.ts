import type { Archive } from '../archive/schema';
import { generateAnswer, loadWebLlmEngine, type LlmEngine } from '../chat/generate';
import { groundedAnswer, type ChatReply } from '../chat/grounded';
import { computeStyleProfile } from '../style/profile';
import type { SemanticIndex } from '../retrieval/search';
import { h } from './dom';

/** One message bubble. Twin replies always carry the AI label and their citations. */
export function messageEl(who: 'you' | 'twin', text: string, reply?: ChatReply): HTMLElement {
  const li = h('li', { class: `msg ${who}`, 'data-testid': `msg-${who}` });
  li.append(h('p', {}, text));
  if (who === 'twin') {
    li.append(
      h(
        'span',
        { class: 'fine', 'data-testid': 'ai-label' },
        reply?.aiLabel ?? 'AI reconstruction',
      ),
    );
    if (reply?.citations.length)
      li.append(
        h(
          'p',
          { class: 'fine', 'data-testid': 'citations' },
          'From memories: ' + reply.citations.map((c) => `${c.date} (${c.memoryId})`).join(', '),
        ),
      );
  }
  return li;
}

/** Retrieval-grounded chat. `getIndex` returns null while the index is still building. */
export function chatSection(a: Archive, getIndex: () => SemanticIndex | null): HTMLElement {
  const log = h('ol', { class: 'chat-log', 'aria-live': 'polite', 'data-testid': 'chat-log' });
  const status = h('p', { class: 'fine', role: 'status', 'data-testid': 'chat-status' });
  const input = h('input', {
    type: 'text',
    placeholder: 'Ask about a memory…',
    'aria-label': 'Ask the twin',
    'data-testid': 'chat-input',
  });
  const form = h(
    'form',
    { class: 'chat-form' },
    input,
    h('button', { class: 'btn', type: 'submit' }, 'Ask'),
  );
  let engine: LlmEngine | null = null;
  const llmBtn = h(
    'button',
    { class: 'btn', type: 'button', 'data-testid': 'llm-enable' },
    'Use local model (WebGPU)',
  );
  llmBtn.addEventListener('click', () => {
    llmBtn.disabled = true;
    status.textContent = 'Checking WebGPU…';
    loadWebLlmEngine('Llama-3.2-1B-Instruct-q4f16_1-MLC', (f, t) => {
      status.textContent = `Downloading model ${Math.round(f * 100)}% ${t}`;
    }).then((e) => {
      engine = e;
      status.textContent = e
        ? 'Local model ready. Replies are generated on this device.'
        : 'Local model unavailable here (needs WebGPU). Using memory quotes instead.';
      llmBtn.disabled = !!e || false;
    });
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    const index = getIndex();
    if (!index) {
      status.textContent = 'Still indexing your memories. Try again in a moment.';
      return;
    }
    status.textContent = 'Thinking…';
    input.value = '';
    log.append(messageEl('you', q));
    const style = a.voiceSamples?.length ? computeStyleProfile(a.voiceSamples) : undefined;
    (engine ? generateAnswer(a, index, q, { engine, style }) : groundedAnswer(a, index, q)).then(
      (r) => {
        status.textContent = '';
        log.append(messageEl('twin', r.text, r));
      },
      () => {
        status.textContent = 'Something went wrong answering that. Try again.';
      },
    );
  });
  return h(
    'section',
    {},
    h('h2', {}, 'Ask'),
    h(
      'p',
      { class: 'fine' },
      'Answers quote your own memories and cite them. If nothing matches, it says so. Every reply is an AI reconstruction.',
    ),
    log,
    status,
    form,
    llmBtn,
  );
}
