/**
 * backupCrypto.ts — passphrase encryption for backup files.
 *
 * AES-256-GCM (authenticated: the GCM tag also detects tampering, replacing the
 * old non-cryptographic djb2 checksum) under a key derived from the user's
 * passphrase via scrypt. Pure-JS via @noble — no native module, works in Expo Go.
 *
 * The encrypted blob is the JSON of { data, fileAssets }; entity counts stay
 * plaintext in the outer payload so the restore screen can preview a backup
 * before the passphrase is entered.
 */
import { gcm } from '@noble/ciphers/aes.js';
import { scrypt } from '@noble/hashes/scrypt.js';

// scrypt work factor. N=2^15, r=8, p=1 (~32 MB) — a strong, one-off cost for a
// backup passphrase that resists offline brute-force, with an on-screen spinner.
export const SCRYPT_PARAMS = { N: 1 << 15, r: 8, p: 1, dkLen: 32 } as const;
const SALT_LEN = 16;
const NONCE_LEN = 12;

export interface EncryptedBlob {
  kdf: 'scrypt';
  N: number;
  r: number;
  p: number;
  salt: string;      // base64
  nonce: string;     // base64
  ciphertext: string; // base64 (AES-GCM output incl. 16-byte tag)
}

function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  // globalThis.crypto.getRandomValues is present in RN/Hermes (same source the
  // recovery-key generators use). Throw loudly rather than downgrade.
  if (!globalThis.crypto || typeof globalThis.crypto.getRandomValues !== 'function') {
    throw new Error('No secure random source available for backup encryption.');
  }
  globalThis.crypto.getRandomValues(b);
  return b;
}

// ─── base64 (Uint8Array <-> string), RN-safe (no btoa/Buffer dependency) ───────
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP: Record<string, number> = (() => {
  const m: Record<string, number> = {};
  for (let i = 0; i < B64.length; i++) m[B64[i]] = i;
  return m;
})();

export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? B64[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    out += i + 2 < bytes.length ? B64[b2 & 63] : '=';
  }
  return out;
}

export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const fullGroups = Math.floor(clean.length / 4);
  const remainder = clean.length % 4;
  const outLen = fullGroups * 3 + (remainder === 2 ? 1 : remainder === 3 ? 2 : 0);
  const out = new Uint8Array(outLen);
  let p = 0;
  let i = 0;
  for (; i + 4 <= clean.length; i += 4) {
    const c0 = B64_LOOKUP[clean[i]], c1 = B64_LOOKUP[clean[i + 1]], c2 = B64_LOOKUP[clean[i + 2]], c3 = B64_LOOKUP[clean[i + 3]];
    out[p++] = (c0 << 2) | (c1 >> 4);
    out[p++] = ((c1 & 15) << 4) | (c2 >> 2);
    out[p++] = ((c2 & 3) << 6) | c3;
  }
  if (remainder === 2) {
    const c0 = B64_LOOKUP[clean[i]], c1 = B64_LOOKUP[clean[i + 1]];
    out[p++] = (c0 << 2) | (c1 >> 4);
  } else if (remainder === 3) {
    const c0 = B64_LOOKUP[clean[i]], c1 = B64_LOOKUP[clean[i + 1]], c2 = B64_LOOKUP[clean[i + 2]];
    out[p++] = (c0 << 2) | (c1 >> 4);
    out[p++] = ((c1 & 15) << 4) | (c2 >> 2);
  }
  return out;
}

function deriveKey(passphrase: string, salt: Uint8Array, params: { N: number; r: number; p: number }): Uint8Array {
  return scrypt(new TextEncoder().encode(passphrase.normalize('NFKC')), salt, { ...params, dkLen: 32 });
}

export function encryptString(plaintext: string, passphrase: string): EncryptedBlob {
  const salt = randomBytes(SALT_LEN);
  const nonce = randomBytes(NONCE_LEN);
  const key = deriveKey(passphrase, salt, SCRYPT_PARAMS);
  const ct = gcm(key, nonce).encrypt(new TextEncoder().encode(plaintext));
  return {
    kdf: 'scrypt', N: SCRYPT_PARAMS.N, r: SCRYPT_PARAMS.r, p: SCRYPT_PARAMS.p,
    salt: bytesToBase64(salt), nonce: bytesToBase64(nonce), ciphertext: bytesToBase64(ct),
  };
}

/** Throws if the passphrase is wrong or the data was tampered with (GCM tag fail). */
export function decryptString(blob: EncryptedBlob, passphrase: string): string {
  if (!blob || blob.kdf !== 'scrypt') throw new Error('Unsupported or missing encryption header.');
  // Review fix: the KDF params come from the (attacker-controlled) file. Without
  // bounds, a hostile blob with N=2^19/r=8 forces a ~537 MB pure-JS allocation
  // (OOM) and a large p pins the JS thread for hours. Cap to sane limits — our
  // own writer uses N=2^15, r=8, p=1.
  if (!Number.isInteger(blob.N) || blob.N < 2 || blob.N > (1 << 16) ||
      !Number.isInteger(blob.r) || blob.r < 1 || blob.r > 8 ||
      !Number.isInteger(blob.p) || blob.p < 1 || blob.p > 4) {
    throw new Error('Unsupported encryption parameters.'); // caps peak memory ≈ 64 MB
  }
  const salt = base64ToBytes(blob.salt);
  const nonce = base64ToBytes(blob.nonce);
  const ct = base64ToBytes(blob.ciphertext);
  const key = deriveKey(passphrase, salt, { N: blob.N, r: blob.r, p: blob.p });
  const pt = gcm(key, nonce).decrypt(ct); // throws on auth failure (wrong passphrase / tamper)
  return new TextDecoder().decode(pt);
}
