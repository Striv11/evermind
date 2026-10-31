/**
 * Encrypted vault. Passphrase -> PBKDF2-SHA256 -> 512 bits, split into
 *   [0..32)  AES-256-GCM key (non-extractable)
 *   [32..64) verifier, stored as SHA-256(verifier) in the header
 * The verifier lets us tell "wrong passphrase" apart from "ciphertext was modified"
 * (AES-GCM alone cannot). The header is bound to the ciphertext as AES-GCM AAD.
 */

export const VAULT_FORMAT = 'evermind-vault' as const;
export const VAULT_VERSION = 1;
export const DEFAULT_ITERATIONS = 600_000;

export interface VaultEnvelope {
  format: typeof VAULT_FORMAT;
  version: number;
  kdf: { name: 'PBKDF2-SHA256'; iterations: number; salt: string };
  check: string; // base64 SHA-256 of the verifier half
  iv: string; // base64, 12 bytes, fresh on every save
  ciphertext: string; // base64, includes the GCM tag
}

export class VaultError extends Error {
  constructor(
    public readonly code: 'wrong-passphrase' | 'tampered' | 'malformed' | 'locked',
    message: string,
  ) {
    super(message);
    this.name = 'VaultError';
  }
}

const enc = new TextEncoder();
const dec = new TextDecoder();
const subtle = () => globalThis.crypto.subtle;

export const b64 = {
  encode(buf: Uint8Array): string {
    let s = '';
    for (const b of buf) s += String.fromCharCode(b);
    return btoa(s);
  },
  decode(s: string): Uint8Array<ArrayBuffer> {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  },
};

function rand(n: number): Uint8Array<ArrayBuffer> {
  return globalThis.crypto.getRandomValues(new Uint8Array(n));
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return d === 0;
}

async function derive(passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const base = await subtle().importKey(
    'raw',
    enc.encode(passphrase.normalize('NFKC')),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = new Uint8Array(
    await subtle().deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, 512),
  );
  const key = await subtle().importKey('raw', bits.slice(0, 32), 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
  const check = new Uint8Array(await subtle().digest('SHA-256', bits.slice(32)));
  return { key, check };
}

/** Header fields authenticated as AAD. */
function aad(
  e: Pick<VaultEnvelope, 'format' | 'version' | 'kdf' | 'check'>,
): Uint8Array<ArrayBuffer> {
  return enc.encode(
    JSON.stringify([e.format, e.version, e.kdf.name, e.kdf.iterations, e.kdf.salt, e.check]),
  );
}

async function seal(
  key: CryptoKey,
  header: Omit<VaultEnvelope, 'iv' | 'ciphertext'>,
  data: unknown,
): Promise<VaultEnvelope> {
  const iv = rand(12);
  const ct = await subtle().encrypt(
    { name: 'AES-GCM', iv, additionalData: aad(header) },
    key,
    enc.encode(JSON.stringify(data)),
  );
  return { ...header, iv: b64.encode(iv), ciphertext: b64.encode(new Uint8Array(ct)) };
}

export interface UnlockedVault<T> {
  readonly data: T;
  /** Re-encrypt with a fresh IV and return the new envelope to persist. */
  save(data: T): Promise<VaultEnvelope>;
  /** Drop the key and data reference. The session is unusable afterwards. */
  lock(): void;
  readonly isLocked: boolean;
}

function session<T>(
  key: CryptoKey,
  header: Omit<VaultEnvelope, 'iv' | 'ciphertext'>,
  initial: T,
): UnlockedVault<T> {
  let k: CryptoKey | null = key;
  let current: T | null = initial;
  return {
    get data() {
      if (current === null) throw new VaultError('locked', 'vault is locked');
      return current;
    },
    get isLocked() {
      return k === null;
    },
    async save(data: T) {
      if (!k) throw new VaultError('locked', 'vault is locked');
      current = data;
      return seal(k, header, data);
    },
    lock() {
      k = null;
      current = null;
    },
  };
}

export async function createVault<T>(
  passphrase: string,
  data: T,
  iterations = DEFAULT_ITERATIONS,
): Promise<{ envelope: VaultEnvelope; vault: UnlockedVault<T> }> {
  if (passphrase.length === 0) throw new VaultError('malformed', 'passphrase must not be empty');
  const salt = rand(16);
  const { key, check } = await derive(passphrase, salt, iterations);
  const header = {
    format: VAULT_FORMAT,
    version: VAULT_VERSION,
    kdf: { name: 'PBKDF2-SHA256' as const, iterations, salt: b64.encode(salt) },
    check: b64.encode(check),
  };
  const envelope = await seal(key, header, data);
  return { envelope, vault: session(key, header, data) };
}

function parseEnvelope(raw: unknown): VaultEnvelope {
  const e = raw as Partial<VaultEnvelope> | null;
  const ok =
    e &&
    e.format === VAULT_FORMAT &&
    e.version === VAULT_VERSION &&
    e.kdf?.name === 'PBKDF2-SHA256' &&
    Number.isInteger(e.kdf.iterations) &&
    e.kdf.iterations > 0 &&
    e.kdf.iterations <= 10_000_000 &&
    typeof e.kdf.salt === 'string' &&
    typeof e.check === 'string' &&
    typeof e.iv === 'string' &&
    typeof e.ciphertext === 'string';
  if (!ok) throw new VaultError('malformed', 'not a recognised vault envelope');
  return e as VaultEnvelope;
}

export async function unlockVault<T>(raw: unknown, passphrase: string): Promise<UnlockedVault<T>> {
  const env = parseEnvelope(raw);
  let salt: Uint8Array<ArrayBuffer>,
    iv: Uint8Array<ArrayBuffer>,
    ct: Uint8Array<ArrayBuffer>,
    check: Uint8Array<ArrayBuffer>;
  try {
    salt = b64.decode(env.kdf.salt);
    iv = b64.decode(env.iv);
    ct = b64.decode(env.ciphertext);
    check = b64.decode(env.check);
  } catch {
    throw new VaultError('malformed', 'invalid base64 in vault envelope');
  }
  if (iv.length !== 12) throw new VaultError('malformed', 'invalid IV length');
  const derived = await derive(passphrase, salt, env.kdf.iterations);
  if (!constantTimeEqual(derived.check, check))
    throw new VaultError('wrong-passphrase', 'wrong passphrase (or the vault header was altered)');
  let plain: ArrayBuffer;
  try {
    plain = await subtle().decrypt(
      { name: 'AES-GCM', iv, additionalData: aad(env) },
      derived.key,
      ct,
    );
  } catch {
    throw new VaultError(
      'tampered',
      'vault contents failed authentication: data was modified or corrupted',
    );
  }
  const { iv: _iv, ciphertext: _ct, ...header } = env;
  void _iv;
  void _ct;
  return session(derived.key, header, JSON.parse(dec.decode(plain)) as T);
}
