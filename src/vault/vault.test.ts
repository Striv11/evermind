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

describe('sealed records', () => {
  it('round-trips a record and keeps plaintext out of it', async () => {
    const { vault } = await createVault('pw', data, ITER);
    const rec = await vault.sealRecord('idx', { secret: 'cardamom' });
    expect(JSON.stringify(rec)).not.toContain('cardamom');
    expect(await vault.openRecord(rec)).toEqual({ secret: 'cardamom' });
  });

  it('opens with the same passphrase after re-unlocking', async () => {
    const { envelope, vault } = await createVault('pw', data, ITER);
    const rec = await vault.sealRecord('idx', [1, 2]);
    const again = await unlockVault(envelope, 'pw');
    expect(await again.openRecord(rec)).toEqual([1, 2]);
  });

  it('rejects renamed, modified or foreign records', async () => {
    const { vault } = await createVault('pw', data, ITER);
    const other = await createVault('pw', data, ITER);
    const rec = await vault.sealRecord('idx', { a: 1 });
    await expectCode(vault.openRecord({ ...rec, name: 'other' }), 'tampered');
    const ct = b64.decode(rec.ciphertext);
    ct[0] = (ct[0] ?? 0) ^ 1;
    await expectCode(vault.openRecord({ ...rec, ciphertext: b64.encode(ct) }), 'tampered');
    await expectCode(other.vault.openRecord(rec), 'tampered');
  });

  it('uses a fresh IV, refuses when locked, and wipe removes records', async () => {
    const store = new MemoryStorage();
    const { vault } = await createVault('pw', data, ITER);
    const a = await vault.sealRecord('idx', 1);
    const b = await vault.sealRecord('idx', 1);
    expect(a.iv).not.toBe(b.iv);
    await store.storeRecord(a);
    expect(await store.loadRecord('idx')).toEqual(a);
    await store.wipe();
    expect(await store.loadRecord('idx')).toBeNull();
    vault.lock();
    await expectCode(vault.sealRecord('idx', 1), 'locked');
    await expectCode(vault.openRecord(a), 'locked');
  });

  it('a main-envelope ciphertext cannot be opened as a record', async () => {
    const { envelope, vault } = await createVault('pw', data, ITER);
    await expectCode(
      vault.openRecord({ name: 'idx', iv: envelope.iv, ciphertext: envelope.ciphertext }),
      'tampered',
    );
  });
});
