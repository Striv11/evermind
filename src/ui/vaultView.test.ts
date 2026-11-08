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
