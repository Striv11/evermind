import type { Archive } from '../archive/schema';
import { h } from './dom';
import { withExtractedFacts } from '../graph/extract';
import { graphSection } from './graphView';
import { styleSection } from './styleView';

const year = (d: string) => d.slice(0, 4);

export function landingView(): HTMLElement {
  const feature = (title: string, body: string) =>
    h('article', { class: 'card' }, h('h3', {}, title), h('p', {}, body));
  return h(
    'div',
    {},
    h(
      'section',
      { class: 'hero' },
      h('p', { class: 'eyebrow' }, 'Private · On-device · Yours to export or erase'),
      h('h1', {}, 'A memory that outlasts you, that only you control.'),
      h(
        'p',
        { class: 'lead' },
        'Evermind turns your journals, chats and a guided life interview into a conversational reconstruction of how you think and speak, entirely in your browser. No servers. No accounts. No API keys.',
      ),
      h(
        'div',
        { class: 'cta' },
        h(
          'a',
          { class: 'btn primary', href: '#/demo', 'data-testid': 'cta-demo' },
          'Try the demo persona',
        ),
        h('a', { class: 'btn', href: '#/vault', 'data-testid': 'cta-vault' }, 'Create my vault'),
      ),
      h(
        'p',
        { class: 'fine' },
        'The demo uses a clearly fictional person, so you can look around with zero data.',
      ),
    ),
    h(
      'section',
      { class: 'grid', 'aria-label': 'Features' },
      feature(
        'Encrypted at rest',
        'AES-256-GCM with a key derived from your passphrase. Lose the passphrase and nobody, including us, can read it.',
      ),
      feature(
        'Grounded, never invented',
        'Answers cite the memories they came from, and the twin says “I don’t remember that” when the evidence is thin.',
      ),
      feature(
        'Open archive',
        'Export a documented, versioned JSON archive you can read without this app, or delete everything in one click.',
      ),
      feature(
        'Honest by design',
        'Every reply is labelled an AI reconstruction. It never claims to be you.',
      ),
    ),
  );
}

export function demoView(source: Archive): HTMLElement {
  const a = withExtractedFacts(source);
  const people = new Map(a.people.map((p) => [p.id, p.name]));
  const memories = [...a.memories].sort((x, y) => x.date.localeCompare(y.date));
  return h(
    'div',
    {},
    h('div', { class: 'banner', role: 'note', 'data-testid': 'ai-banner' }, '⚠ ' + a.aiDisclosure),
    h('h1', {}, a.subject.displayName),
    h(
      'p',
      { class: 'lead' },
      'A fictional sample persona. Nothing here is real, and nothing left your browser.',
    ),
    h(
      'section',
      { 'aria-labelledby': 'tl' },
      h('h2', { id: 'tl' }, `Timeline (${memories.length} memories)`),
      h(
        'ol',
        { class: 'timeline', 'data-testid': 'timeline' },
        ...memories.map((m) =>
          h(
            'li',
            {},
            h('time', { datetime: m.date }, year(m.date)),
            h('p', {}, m.text),
            h(
              'p',
              { class: 'meta' },
              [m.place, ...(m.people ?? []).map((id) => people.get(id))]
                .filter(Boolean)
                .join(' · '),
            ),
          ),
        ),
      ),
    ),
    graphSection(a),
    styleSection(a),
    h(
      'section',
      { 'aria-labelledby': 'fx' },
      h('h2', { id: 'fx' }, `What the twin knows (${a.facts.length} facts)`),
      h(
        'ul',
        { class: 'facts', 'data-testid': 'facts' },
        ...a.facts.map((f) => h('li', {}, `${f.subject} ${f.predicate} ${f.object}`)),
      ),
    ),
    h(
      'section',
      {},
      h('h2', {}, 'Chat with the twin'),
      h(
        'p',
        { class: 'empty' },
        'Coming on day 8: grounded chat with source citations, locally via WebGPU.',
      ),
    ),
  );
}
