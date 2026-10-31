import { describe, expect, it } from 'vitest';
import { b64, createVault, unlockVault, VaultError, type VaultEnvelope } from './vault';
import { MemoryStorage } from './storage';

const ITER = 1000; // fast for tests; production default is 600k
const data = { note: 'my grandmother’s kitchen smelled of cardamom', n: [1, 2, 3] };

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy((e) => e instanceof VaultError && e.code === code);
}

describe('vault', () => {
  it('round-trips data through create -> unlock', async () => {
    const { envelope } = await createVault('correct horse', data, ITER);
    const v = await unlockVault<typeof data>(JSON.parse(JSON.stringify(envelope)), 'correct horse');
    expect(v.data).toEqual(data);
  });

  it('does not leak plaintext into the envelope', async () => {
    const { envelope } = await createVault('pw', data, ITER);
    expect(JSON.stringify(envelope)).not.toContain('cardamom');
  });

  it('rejects a wrong passphrase', async () => {
    const { envelope } = await createVault('right', data, ITER);
    await expectCode(unlockVault(envelope, 'wrong'), 'wrong-passphrase');
  });

  it('detects ciphertext tampering', async () => {
    const { envelope } = await createVault('pw', data, ITER);
    const bytes = b64.decode(envelope.ciphertext);
    bytes[0] = (bytes[0] ?? 0) ^ 1;
    await expectCode(unlockVault({ ...envelope, ciphertext: b64.encode(bytes) }, 'pw'), 'tampered');
  });

  it('detects IV tampering', async () => {
    const { envelope } = await createVault('pw', data, ITER);
    const iv = b64.decode(envelope.iv);
    iv[3] = (iv[3] ?? 0) ^ 0x80;
    await expectCode(unlockVault({ ...envelope, iv: b64.encode(iv) }, 'pw'), 'tampered');
  });

  it('binds the header: swapping the verifier is detected', async () => {
    const a = await createVault('pw', data, ITER);
    const other = await createVault('pw', data, ITER);
    // Same passphrase, different salt: verifier from `other` cannot validate a's key.
    const forged: VaultEnvelope = { ...a.envelope, check: other.envelope.check };
    await expectCode(unlockVault(forged, 'pw'), 'wrong-passphrase');
  });

  it('rejects malformed envelopes', async () => {
    await expectCode(unlockVault({ hello: 1 }, 'pw'), 'malformed');
    const { envelope } = await createVault('pw', data, ITER);
    await expectCode(unlockVault({ ...envelope, iv: 'AAAA' }, 'pw'), 'malformed');
    await expectCode(unlockVault({ ...envelope, ciphertext: '!!!' }, 'pw'), 'malformed');
  });

  it('uses a fresh IV and salt every time', async () => {
    const a = await createVault('pw', data, ITER);
    const b = await createVault('pw', data, ITER);
    expect(a.envelope.kdf.salt).not.toBe(b.envelope.kdf.salt);
    const s1 = await a.vault.save({ ...data });
    const s2 = await a.vault.save({ ...data });
    expect(s1.iv).not.toBe(s2.iv);
  });

  it('save persists updates and lock wipes the session', async () => {
    const { envelope, vault } = await createVault('pw', { v: 1 }, ITER);
    const next = await vault.save({ v: 2 });
    expect(next.kdf.salt).toBe(envelope.kdf.salt);
    expect((await unlockVault<{ v: number }>(next, 'pw')).data.v).toBe(2);
    vault.lock();
    expect(vault.isLocked).toBe(true);
    expect(() => vault.data).toThrow(VaultError);
    await expectCode(vault.save({ v: 3 }), 'locked');
  });

  it('refuses an empty passphrase', async () => {
    await expectCode(createVault('', data, ITER), 'malformed');
  });

  it('works with storage and wipe deletes the envelope', async () => {
    const store = new MemoryStorage();
    const { envelope } = await createVault('pw', data, ITER);
    await store.store(envelope);
    expect(await store.load()).toEqual(envelope);
    await store.wipe();
    expect(await store.load()).toBeNull();
  });
});
