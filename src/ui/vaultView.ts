import { emptyArchive, type Archive } from '../archive/schema';
import { validateArchive } from '../archive/validate';
import { IndexedDbStorage, type VaultStorage } from '../vault/storage';
import { createVault, unlockVault, VaultError, type UnlockedVault } from '../vault/vault';
import { HashingEmbedder } from '../retrieval/embed';
import type { SemanticIndex } from '../retrieval/search';
import { syncIndex } from '../retrieval/sync';
import { withExtractedFacts } from '../graph/extract';
import { graphSection } from './graphView';
import { styleSection } from './styleView';
import { chatSection } from './chatView';
import { exportBundle } from '../archive/bundle';
import { h } from './dom';

let session: UnlockedVault<Archive> | null = null;

export function lockSession(): void {
  session?.lock();
  session = null;
  semantic = null;
}

let semantic: SemanticIndex | null = null;

/** Search panel: builds (or loads) the encrypted vector index, then searches by meaning. */
function searchPanel(storage: VaultStorage, a: Archive): HTMLElement {
  const status = h('p', { class: 'fine', role: 'status', 'data-testid': 'index-status' });
  const bar = h('progress', { max: '100', value: '0', 'aria-label': 'Indexing progress' });
  const input = h('input', {
    type: 'search',
    placeholder: 'Search your memories by meaning…',
    'aria-label': 'Search memories',
    disabled: '',
    'data-testid': 'memory-search',
  }) as HTMLInputElement;
  const results = h('ol', { class: 'results', 'data-testid': 'search-results' });
  const root = h('section', {}, h('h2', {}, 'Search'), input, status, bar, results);
  if (!a.memories.length) {
    root.replaceChildren(
      h('h2', {}, 'Search'),
      h('p', { class: 'fine' }, 'Add memories to search them.'),
    );
    return root;
  }
  const ready = (idx: SemanticIndex, note: string) => {
    semantic = idx;
    bar.remove();
    status.textContent = note;
    input.disabled = false;
  };
  const start = async () => {
    const v = session!;
    status.textContent = 'Indexing on this device…';
    try {
      const r = await syncIndex(v, storage, new HashingEmbedder(), (pct) => (bar.value = pct));
      ready(r.index, `Indexed ${r.index.size} passages (${r.reused} reused, ${r.embedded} new).`);
    } catch {
      bar.remove();
      status.textContent = 'Indexing failed. Lock and unlock to retry.';
    }
  };
  if (semantic) ready(semantic, `Indexed ${semantic.size} passages.`);
  else void start();
  let seq = 0;
  input.addEventListener('input', () => {
    const q = input.value.trim();
    const mine = ++seq;
    if (!q || !semantic) return results.replaceChildren();
    void semantic.search(q, 5).then((hits) => {
      if (mine !== seq) return;
      const byId = new Map(a.memories.map((m) => [m.id, m]));
      results.replaceChildren(
        ...hits.map((hit) =>
          h(
            'li',
            {},
            h('strong', {}, byId.get(hit.memoryId)?.date.slice(0, 10) ?? hit.memoryId),
            h('p', {}, hit.chunk.text),
          ),
        ),
        ...(hits.length ? [] : [h('li', { class: 'fine' }, 'Nothing close to that.')]),
      );
    });
  });
  return root;
}

/** The unlocked vault, if any. */
export function activeVault(): UnlockedVault<Archive> | null {
  return session && !session.isLocked ? session : null;
}

/** Validate, re-encrypt and persist a new version of the archive. */
export async function saveArchive(
  a: Archive,
  storage: VaultStorage = new IndexedDbStorage(),
): Promise<void> {
  const v = activeVault();
  if (!v) throw new Error('The vault is locked.');
  const check = validateArchive(a);
  if (!check.ok)
    throw new Error(`Refusing to save an invalid archive: ${check.issues[0]?.message}`);
  await storage.store(await v.save(a));
}

export async function vaultView(
  root: HTMLElement,
  storage: VaultStorage = new IndexedDbStorage(),
): Promise<void> {
  root.replaceChildren(
    h('p', { class: 'empty', role: 'status' }, 'Checking for a vault on this device…'),
  );
  const existing = await storage.load().catch(() => null);
  const rerender = () => void vaultView(root, storage);

  if (session && !session.isLocked) return root.replaceChildren(unlockedPanel(storage, rerender));

  const status = h('p', { class: 'error', role: 'alert', 'data-testid': 'vault-error' });
  const pass = h('input', {
    type: 'password',
    id: 'pass',
    autocomplete: existing ? 'current-password' : 'new-password',
    required: '',
    'data-testid': 'passphrase',
  });
  const confirm = h('input', {
    type: 'password',
    id: 'pass2',
    autocomplete: 'new-password',
    'data-testid': 'passphrase2',
  });
  const busy = h('span', { 'aria-live': 'polite' });
  const submit = h(
    'button',
    { class: 'btn primary', type: 'submit', 'data-testid': 'vault-submit' },
    existing ? 'Unlock' : 'Create vault',
  );
  const form = h(
    'form',
    { class: 'panel', novalidate: '' },
    h('h1', {}, existing ? 'Unlock your vault' : 'Create your private vault'),
    h(
      'p',
      { class: 'lead' },
      existing
        ? 'Enter your passphrase. It never leaves this device.'
        : 'Pick a passphrase. It encrypts everything with AES-256-GCM on this device. There is no recovery: if you forget it, the data is gone.',
    ),
    h('label', { for: 'pass' }, 'Passphrase'),
    pass,
    ...(existing ? [] : [h('label', { for: 'pass2' }, 'Repeat passphrase'), confirm]),
    status,
    h('div', { class: 'cta' }, submit, busy),
  );
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    void (async () => {
      status.textContent = '';
      const p = pass.value;
      if (!existing) {
        if (p.length < 8) return void (status.textContent = 'Use at least 8 characters.');
        if (p !== confirm.value) return void (status.textContent = 'The passphrases do not match.');
      }
      submit.disabled = true;
      busy.textContent = ' Deriving key…';
      try {
        if (existing) {
          session = await unlockVault<Archive>(existing, p);
        } else {
          const { envelope, vault } = await createVault(p, emptyArchive('Me'));
          await storage.store(envelope);
          session = vault;
        }
        rerender();
      } catch (e) {
        status.textContent =
          e instanceof VaultError
            ? e.code === 'wrong-passphrase'
              ? 'Wrong passphrase.'
              : e.code === 'tampered'
                ? 'This vault failed its integrity check; it was modified or corrupted.'
                : e.message
            : 'Something went wrong.';
        submit.disabled = false;
        busy.textContent = '';
      }
    })();
  });
  root.replaceChildren(form);
}

function unlockedPanel(storage: VaultStorage, rerender: () => void): HTMLElement {
  const s = session!;
  const a = s.data;
  const btn = (label: string, testid: string, cls: string, onClick: () => void) => {
    const b = h(
      'button',
      { class: `btn ${cls}`.trim(), type: 'button', 'data-testid': testid },
      label,
    );
    b.addEventListener('click', onClick);
    return b;
  };
  const exportJson = () => {
    if (!validateArchive(a).ok) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(a, null, 2)], { type: 'application/json' }),
    );
    h('a', { href: url, download: 'evermind-archive.json' }).click();
    URL.revokeObjectURL(url);
  };
  const exportZip = () => {
    // Attachment bytes are not stored in the vault yet, so only attachment-free archives bundle.
    void exportBundle(a)
      .then((zip) => {
        const url = URL.createObjectURL(new Blob([zip as BlobPart], { type: 'application/zip' }));
        h('a', { href: url, download: 'evermind-archive.zip' }).click();
        URL.revokeObjectURL(url);
      })
      .catch((e: unknown) => alert(e instanceof Error ? e.message : 'Export failed'));
  };
  const wipe = () => {
    if (!confirm('Permanently delete your vault and everything in it from this device?')) return;
    lockSession();
    void storage.wipe().then(rerender);
  };
  return h(
    'div',
    { class: 'panel' },
    h('div', { class: 'banner', role: 'note' }, '\u26a0 ' + a.aiDisclosure),
    h('h1', {}, 'Your vault is unlocked'),
    a.memories.length
      ? h(
          'p',
          { class: 'lead', 'data-testid': 'vault-count' },
          `${a.memories.length} memories, ${a.people.length} people, from ${a.sources.length} sources.`,
        )
      : h(
          'p',
          { class: 'empty', 'data-testid': 'vault-empty' },
          'It is empty. Open the Studio to record or upload your story.',
        ),
    searchPanel(storage, a),
    ...(a.memories.length ? [chatSection(a, () => semantic)] : []),
    ...(a.memories.length ? [graphSection(withExtractedFacts(a))] : []),
    ...(a.voiceSamples.length ? [styleSection(a)] : []),
    h(
      'div',
      { class: 'cta' },
      h(
        'a',
        { class: 'btn primary', href: '#/studio', 'data-testid': 'open-studio' },
        'Open Studio',
      ),
      btn('Export archive (.json)', 'export', '', exportJson),
      btn('Export bundle (.zip + viewer)', 'export-zip', '', exportZip),
      btn('Lock', 'lock', '', () => {
        lockSession();
        rerender();
      }),
      btn('Delete everything', 'delete', 'danger', wipe),
    ),
  );
}
