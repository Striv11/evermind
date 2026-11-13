import type { Archive } from '../archive/schema';
import { capsuleView, removeCapsule, sealCapsule } from '../legacy/capsule';
import { lifeBookHtml } from '../legacy/lifebook';
import { h } from './dom';
import { activeVault, saveArchive } from './vaultView';

/** Step 6: time capsules (sealed until a date) and the printable life book. */
export function capsuleSection(): HTMLElement {
  const root = h('section', {
    class: 'studio-section',
    'aria-labelledby': 'cap-h',
    'data-testid': 'capsules',
  });
  const err = h('p', { class: 'fine', role: 'alert' });

  const update = async (fn: (a: Archive) => Archive) => {
    const v = activeVault();
    if (!v) return;
    err.textContent = '';
    try {
      await saveArchive(fn(v.data));
      render();
    } catch (e) {
      err.textContent = e instanceof Error ? e.message : String(e);
    }
  };

  function render() {
    const a = activeVault()?.data;
    if (!a) return;
    const now = new Date();
    const to = h('input', { id: 'cap-to', type: 'text', 'data-testid': 'cap-to' });
    const when = h('input', { id: 'cap-date', type: 'date', 'data-testid': 'cap-date' });
    const body = h('textarea', { id: 'cap-body', rows: '3', 'data-testid': 'cap-body' });
    const seal = h('button', { class: 'btn', type: 'button', 'data-testid': 'cap-seal' }, 'Seal');
    seal.addEventListener(
      'click',
      () =>
        void update((x) =>
          sealCapsule(x, { to: to.value, body: body.value, unlockAt: when.value }, new Date()),
        ),
    );
    const book = h(
      'button',
      { class: 'btn', type: 'button', 'data-testid': 'book-open' },
      'Open life book',
    );
    book.addEventListener('click', () => {
      const url = URL.createObjectURL(new Blob([lifeBookHtml(a)], { type: 'text/html' }));
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    });
    root.replaceChildren(
      h('h2', { id: 'cap-h' }, '6 · Time capsules and life book'),
      h(
        'p',
        { class: 'fine' },
        'A capsule stays hidden in this app until its date. This is app-enforced, not encryption: the text is stored in your vault and your exported archive in the clear.',
      ),
      h(
        'div',
        { class: 'row' },
        h('label', { for: 'cap-to' }, 'For'),
        to,
        h('label', { for: 'cap-date' }, 'Opens on'),
        when,
      ),
      h('div', { class: 'row' }, h('label', { for: 'cap-body' }, 'Message'), body, seal),
      h(
        'ul',
        { 'data-testid': 'cap-list' },
        ...a.capsules.map((c) => {
          const v = capsuleView(c, now);
          const rm = h(
            'button',
            { class: 'btn', type: 'button', 'aria-label': `Remove capsule for ${c.to}` },
            'Remove',
          );
          rm.addEventListener('click', () => void update((x) => removeCapsule(x, c.id)));
          return h(
            'li',
            {},
            v.state === 'open'
              ? `For ${c.to}, opened ${c.unlockAt.slice(0, 10)}: “${v.body}” `
              : `For ${c.to}, sealed, opens ${c.unlockAt.slice(0, 10)} (${v.daysLeft} days) `,
            rm,
          );
        }),
      ),
      h('h3', {}, 'Life book'),
      h(
        'p',
        { class: 'fine' },
        'Your memories as chapters by decade, with citations. Print it or save as PDF from the new tab.',
      ),
      book,
      err,
    );
  }
  render();
  return root;
}
