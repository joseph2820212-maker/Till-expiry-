/** Base64 → bytes without Buffer/atob (Hermes-safe). */
export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const table = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n = (table.indexOf(clean[i]) << 18) | (table.indexOf(clean[i + 1]) << 12) | ((table.indexOf(clean[i + 2]) & 63) << 6) | (table.indexOf(clean[i + 3]) & 63);
    out[o++] = (n >> 16) & 255;
    if (clean[i + 2] !== undefined) out[o++] = (n >> 8) & 255;
    if (clean[i + 3] !== undefined) out[o++] = n & 255;
  }
  return out.slice(0, o);
}

/** Windows-1252 code points for bytes 0x80–0x9F (the rest of the range maps to Latin-1). */
const CP1252_HIGH = [0x20ac, 0x81, 0x201a, 0x192, 0x201e, 0x2026, 0x2020, 0x2021, 0x2c6, 0x2030, 0x160, 0x2039, 0x152, 0x8d, 0x17d, 0x8f,
  0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x2dc, 0x2122, 0x161, 0x203a, 0x153, 0x9d, 0x17e, 0x178];

/** Strict UTF-8 decode; null when the bytes are not valid UTF-8. */
function strictUtf8(bytes: Uint8Array, start: number): string | null {
  let out = '';
  let i = start;
  const cont = (k: number) => i + k < bytes.length && (bytes[i + k] & 0xc0) === 0x80;
  while (i < bytes.length) {
    const b = bytes[i];
    if (b < 0x80) { out += String.fromCharCode(b); i++; continue; }
    if (b >= 0xc2 && b < 0xe0 && cont(1)) { out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f)); i += 2; continue; }
    if (b >= 0xe0 && b < 0xf0 && cont(1) && cont(2)) {
      const cp = ((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f);
      if (cp < 0x800 || (cp >= 0xd800 && cp <= 0xdfff)) return null;
      out += String.fromCharCode(cp); i += 3; continue;
    }
    if (b >= 0xf0 && b < 0xf5 && cont(1) && cont(2) && cont(3)) {
      const cp = ((b & 0x07) << 18) | ((bytes[i + 1] & 0x3f) << 12) | ((bytes[i + 2] & 0x3f) << 6) | (bytes[i + 3] & 0x3f);
      if (cp < 0x10000 || cp > 0x10ffff) return null;
      out += String.fromCodePoint(cp); i += 4; continue;
    }
    return null;
  }
  return out;
}

/**
 * Text from a file: UTF-8 (with or without a BOM) when the bytes are valid UTF-8, otherwise Windows-1252 — the
 * encoding Excel uses for "CSV (Comma delimited)" — so "£1.50" never turns into garbage that changes a price.
 */
export function decodeText(bytes: Uint8Array): { text: string; encoding: 'utf-8' | 'windows-1252' } {
  const bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  const utf8 = strictUtf8(bytes, bom);
  if (utf8 !== null) return { text: utf8, encoding: 'utf-8' };
  let out = '';
  for (const b of bytes) out += String.fromCharCode(b >= 0x80 && b <= 0x9f ? CP1252_HIGH[b - 0x80] : b);
  return { text: out, encoding: 'windows-1252' };
}

/** UTF-8 (or Windows-1252 fallback) bytes → string. */
export function utf8Decode(bytes: Uint8Array): string {
  return decodeText(bytes).text;
}
