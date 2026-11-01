import type { Archive } from '../archive/schema';
import { addMessage, emptyPolicy, releasedMessages, type LegacyPolicy } from '../identity/legacy';
import { h } from './dom';
import { activeVault, saveArchive } from './vaultView';

/** Step 5: who may talk to the twin, what is off-limits, and messages for later. */
export function legacySection(): HTMLElement {
  const root = h('section', {
    class: 'studio-section',
    'aria-labelledby': 'legacy-h',
    'data-testid': 'legacy',
  });
  const err = h('p', { class: 'fine', role: 'alert' });

  const update = async (fn: (a: Archive, p: LegacyPolicy) => Archive) => {
    const v = activeVault();
    if (!v) return;
    err.textContent = '';
    try {
      await saveArchive(fn(v.data, v.data.legacy ?? emptyPolicy()));
      render();
    } catch (e) {
      err.textContent = e instanceof Error ? e.message : String(e);
    }
  };
  const withPolicy = (a: Archive, p: Partial<LegacyPolicy>): Archive => ({
    ...a,
    legacy: { ...(a.legacy ?? emptyPolicy()), ...p },
  });

  function render() {
    const a = activeVault()?.data;
    if (!a) return;
    const p = a.legacy ?? emptyPolicy();

    const access = h('input', {
      type: 'checkbox',
      id: 'legacy-listed',
      'data-testid': 'legacy-listed',
    });
    access.checked = p.access === 'listed';
    access.addEventListener(
      'change',
      () => void update((x) => withPolicy(x, { access: access.checked ? 'listed' : 'owner' })),
    );

    const listener = h('input', {
      type: 'text',
      id: 'legacy-listener',
      placeholder: 'Name, e.g. Maya',
    });
    const addListener = h('button', { class: 'btn', type: 'button' }, 'Allow');
    addListener.addEventListener('click', () => {
      const name = listener.value.trim();
      if (name) void update((x, pol) => withPolicy(x, { listeners: [...pol.listeners, { name }] }));
    });

    const topic = h('input', {
      type: 'text',
      id: 'legacy-topic',
      placeholder: 'A topic, e.g. my divorce',
      'data-testid': 'legacy-topic',
    });
    const addTopic = h(
      'button',
      { class: 'btn', type: 'button', 'data-testid': 'legacy-topic-add' },
      'Keep private',
    );
    addTopic.addEventListener('click', () => {
      const t = topic.value.trim();
      if (t && !p.offLimits.includes(t))
        void update((x, pol) => withPolicy(x, { offLimits: [...pol.offLimits, t] }));
    });

    const to = h('input', { type: 'text', id: 'msg-to', placeholder: 'For (name)' });
    const when = h('input', { type: 'date', id: 'msg-date' });
    const text = h('textarea', {
      id: 'msg-text',
      rows: '3',
      placeholder: 'What do you want them to read, later?',
    });
    const addMsg = h('button', { class: 'btn', type: 'button' }, 'Seal message');
    addMsg.addEventListener(
      'click',
      () =>
        void update((x) =>
          addMessage(x, { to: to.value, text: text.value, releaseOn: when.value }),
        ),
    );

    const removable = (label: string, remove: () => void) => {
      const b = h('button', { class: 'btn', type: 'button', 'aria-label': `Remove ${label}` }, '✕');
      b.addEventListener('click', remove);
      return h('li', {}, h('span', {}, label + ' '), b);
    };
    const today = new Date();
    root.replaceChildren(
      h('h2', { id: 'legacy-h' }, '5 · Legacy controls'),
      h(
        'p',
        { class: 'fine' },
        'You decide what your twin may say, and to whom. These rules are enforced by this app, not by encryption: they stop your twin from using or discussing the topics, but anyone holding your passphrase can still read your vault.',
      ),
      h(
        'label',
        { class: 'consent', for: 'legacy-listed' },
        access,
        ' People I list below may talk to my twin (otherwise only me)',
      ),
      h(
        'div',
        { class: 'row' },
        h('label', { for: 'legacy-listener' }, 'Add a person'),
        listener,
        addListener,
      ),
      h(
        'ul',
        {},
        ...p.listeners.map((l, i) =>
          removable(
            l.name,
            () =>
              void update((x, pol) =>
                withPolicy(x, { listeners: pol.listeners.filter((_, j) => j !== i) }),
              ),
          ),
        ),
      ),
      h('h3', {}, 'Off-limits topics'),
      h('div', { class: 'row' }, h('label', { for: 'legacy-topic' }, 'Topic'), topic, addTopic),
      h(
        'ul',
        { 'data-testid': 'legacy-topics' },
        ...p.offLimits.map((t, i) =>
          removable(
            t,
            () =>
              void update((x, pol) =>
                withPolicy(x, { offLimits: pol.offLimits.filter((_, j) => j !== i) }),
              ),
          ),
        ),
      ),
      h('h3', {}, 'Messages for later'),
      h(
        'div',
        { class: 'row' },
        h('label', { for: 'msg-to' }, 'For'),
        to,
        h('label', { for: 'msg-date' }, 'Open on'),
        when,
      ),
      h('div', { class: 'row' }, h('label', { for: 'msg-text' }, 'Message'), text, addMsg),
      h(
        'ul',
        { 'data-testid': 'legacy-messages' },
        ...p.messages.map((m, i) => {
          const open = releasedMessages(p, m.to, today).some((r) => r.id === m.id);
          return removable(
            `For ${m.to}, opens ${m.releaseOn}${open ? `: “${m.text}”` : ' (sealed)'}`,
            () =>
              void update((x, pol) =>
                withPolicy(x, { messages: pol.messages.filter((_, j) => j !== i) }),
              ),
          );
        }),
      ),
      err,
    );
  }
  render();
  return root;
}
