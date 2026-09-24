import { encryptString, decryptString, bytesToBase64, base64ToBytes } from '../backupCrypto';

describe('base64 round-trip (RN-safe)', () => {
  it('encodes/decodes arbitrary byte lengths incl. padding', () => {
    for (const len of [0, 1, 2, 3, 4, 5, 16, 17, 255, 256, 1000]) {
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = (i * 37 + 11) & 0xff;
      const round = base64ToBytes(bytesToBase64(bytes));
      expect(Array.from(round)).toEqual(Array.from(bytes));
    }
  });

  it('matches a known vector', () => {
    expect(bytesToBase64(new TextEncoder().encode('hello'))).toBe('aGVsbG8=');
    expect(new TextDecoder().decode(base64ToBytes('aGVsbG8='))).toBe('hello');
  });
});

describe('backup encryption (AES-256-GCM + scrypt)', () => {
  it('round-trips a payload with the correct passphrase', () => {
    const plaintext = JSON.stringify({ data: { 'settings:language': 'en' }, secret: 'cafe' });
    const blob = encryptString(plaintext, 'correct horse battery staple');
    expect(blob.kdf).toBe('scrypt');
    // Ciphertext must not contain the plaintext.
    expect(blob.ciphertext).not.toContain('settings');
    expect(decryptString(blob, 'correct horse battery staple')).toBe(plaintext);
  });

  it('fails to decrypt with a wrong passphrase', () => {
    const blob = encryptString('top secret', 'right-pass');
    expect(() => decryptString(blob, 'wrong-pass')).toThrow();
  });

  it('fails to decrypt if the ciphertext is tampered with (GCM auth)', () => {
    const blob = encryptString('top secret', 'p');
    const bytes = base64ToBytes(blob.ciphertext);
    bytes[0] ^= 0xff;
    expect(() => decryptString({ ...blob, ciphertext: bytesToBase64(bytes) }, 'p')).toThrow();
  });

  it('rejects hostile KDF params (memory/CPU bomb guard)', () => {
    const blob = encryptString('x', 'p');
    // N too large, oversized r, and huge p must all be rejected.
    expect(() => decryptString({ ...blob, N: 1 << 19 }, 'p')).toThrow('Unsupported encryption parameters');
    expect(() => decryptString({ ...blob, r: 64 }, 'p')).toThrow('Unsupported encryption parameters');
    expect(() => decryptString({ ...blob, p: 1_000_000 }, 'p')).toThrow('Unsupported encryption parameters');
    expect(() => decryptString({ ...blob, N: 2.5 }, 'p')).toThrow('Unsupported encryption parameters');
  });

  it('uses a fresh salt and nonce each time', () => {
    const a = encryptString('x', 'p');
    const b = encryptString('x', 'p');
    expect(a.salt).not.toBe(b.salt);
    expect(a.nonce).not.toBe(b.nonce);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });
});
