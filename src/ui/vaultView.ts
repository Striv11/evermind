import { emptyArchive, type Archive } from '../archive/schema';
import { validateArchive } from '../archive/validate';
import { IndexedDbStorage, type VaultStorage } from '../vault/storage';
import { createVault, unlockVault, VaultError, type UnlockedVault } from '../vault/vault';
import { h } from './dom';

let session: UnlockedVault<Archive> | null = null;

export function lockSession(): void {
  session?.lock();
  session = null;
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
    h(
      'p',
      { class: 'empty', 'data-testid': 'vault-empty' },
      'It is empty. Next up: import journals and chats, or start the guided life interview. (Importers land on day 2, the interview on day 4.)',
    ),
    h(
      'div',
      { class: 'cta' },
      btn('Export archive (.json)', 'export', '', exportJson),
      btn('Lock', 'lock', '', () => {
        lockSession();
        rerender();
      }),
      btn('Delete everything', 'delete', 'danger', wipe),
    ),
  );
}
