// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { demoArchive } from '../demo/persona';
import { emptyArchive } from '../archive/schema';
import { MemoryStorage } from '../vault/storage';
import { createVault } from '../vault/vault';
import { lockSession, vaultView } from './vaultView';

async function open(data: ReturnType<typeof demoArchive>) {
  const storage = new MemoryStorage();
  const { envelope } = await createVault('correct horse battery', data);
  await storage.store(envelope);
  const root = document.createElement('div');
  await vaultView(root, storage);
  (root.querySelector('[data-testid=passphrase]') as HTMLInputElement).value =
    'correct horse battery';
  root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
  for (let i = 0; i < 100 && !root.querySelector('[data-testid=lock]'); i++)
    await new Promise((r) => setTimeout(r, 50));
  return root;
}

describe('unlocked vault graph', () => {
  it('shows the knowledge graph with a list fallback and source memories', async () => {
    const root = await open(demoArchive());
    expect(root.querySelector('[data-testid=graph-svg]')).toBeTruthy();
    const list = root.querySelector('[data-testid=node-list]')!;
    expect(list.children.length).toBeGreaterThan(3);
    (list.querySelector('button, a, li')! as HTMLElement).click();
    lockSession();
  });

  it('omits the graph for an empty vault', async () => {
    const root = await open(emptyArchive('Me'));
    expect(root.querySelector('[data-testid=vault-empty]')).toBeTruthy();
    expect(root.querySelector('[data-testid=graph-svg]')).toBeNull();
    lockSession();
  });
});

describe('chat section', () => {
  it('labels twin replies and cites memories', async () => {
    const { messageEl } = await import('./chatView');
    const el = messageEl('twin', 'text', {
      aiLabel: 'AI reconstruction',
      text: 'text',
      abstained: false,
      citations: [{ memoryId: 'm2', date: '1990-01-01', score: 0.3 }],
    });
    expect(el.querySelector('[data-testid=ai-label]')?.textContent).toBe('AI reconstruction');
    expect(el.textContent).toContain('m2');
    expect(messageEl('you', 'hi').querySelector('[data-testid=ai-label]')).toBeNull();
  });
});

describe('import into an unlocked vault', () => {
  it('merges a json archive, reports counts, and is idempotent', async () => {
    const { importFileIntoVault, activeVault } = await import('./vaultView');
    const storage = new MemoryStorage();
    const { envelope } = await createVault('correct horse battery', emptyArchive('Me'));
    await storage.store(envelope);
    const root = document.createElement('div');
    await vaultView(root, storage);
    (root.querySelector('[data-testid=passphrase]') as HTMLInputElement).value =
      'correct horse battery';
    root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    for (let i = 0; i < 100 && !root.querySelector('[data-testid=lock]'); i++)
      await new Promise((r) => setTimeout(r, 50));
    const demo = demoArchive();
    const blob = new Blob([JSON.stringify(demo)]);
    const msg = await importFileIntoVault(blob, 'a.json', storage);
    expect(msg).toMatch(/^Imported [1-9]\d* records; 0 already/);
    expect(activeVault()!.data.memories).toHaveLength(demo.memories.length);
    expect(await importFileIntoVault(blob, 'a.json', storage)).toMatch(/Imported 0 records/);
    await expect(importFileIntoVault(new Blob(['nope']), 'b.json', storage)).rejects.toThrow(
      /JSON/,
    );
    lockSession();
  });
});
