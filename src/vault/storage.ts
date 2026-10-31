import type { VaultEnvelope } from './vault';

/** Where the (already encrypted) envelope lives. Plaintext never touches storage. */
export interface VaultStorage {
  load(): Promise<VaultEnvelope | null>;
  store(envelope: VaultEnvelope): Promise<void>;
  wipe(): Promise<void>;
}

export class MemoryStorage implements VaultStorage {
  private value: VaultEnvelope | null = null;
  async load() {
    return this.value;
  }
  async store(e: VaultEnvelope) {
    this.value = e;
  }
  async wipe() {
    this.value = null;
  }
}

const DB = 'evermind';
const STORE = 'vault';
const KEY = 'envelope';

export class IndexedDbStorage implements VaultStorage {
  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  private async run<R>(
    mode: IDBTransactionMode,
    fn: (s: IDBObjectStore) => IDBRequest<R>,
  ): Promise<R> {
    const db = await this.open();
    try {
      return await new Promise<R>((resolve, reject) => {
        const req = fn(db.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } finally {
      db.close();
    }
  }
  async load() {
    return ((await this.run('readonly', (s) => s.get(KEY))) as VaultEnvelope | undefined) ?? null;
  }
  async store(e: VaultEnvelope) {
    await this.run('readwrite', (s) => s.put(e, KEY));
  }
  async wipe() {
    await this.run('readwrite', (s) => s.delete(KEY));
  }
}
