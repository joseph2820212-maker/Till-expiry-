// Barcode normalisation so the same product is never stored twice.
// UPC-A (12 digits) is EAN-13 with a leading zero; UPC-E is expanded to UPC-A.
// Non-numeric codes (Code 128) are trimmed and kept as scanned.

export function ean13CheckDigit(first12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

export function isValidEan13(code: string): boolean {
  return /^\d{13}$/.test(code) && ean13CheckDigit(code.slice(0, 12)) === Number(code[12]);
}

export function expandUpcE(code: string): string | null {
  if (!/^\d{8}$/.test(code)) return null;
  const ns = code[0];
  const body = code.slice(1, 7);
  const check = code[7];
  const last = body[5];
  let manufacturer: string; let product: string;
  switch (last) {
    case '0': case '1': case '2':
      manufacturer = body.slice(0, 2) + last + '00'; product = '00' + body.slice(2, 5); break;
    case '3':
      manufacturer = body.slice(0, 3) + '00'; product = '000' + body.slice(3, 5); break;
    case '4':
      manufacturer = body.slice(0, 4) + '0'; product = '0000' + body[4]; break;
    default:
      manufacturer = body.slice(0, 5); product = '0000' + last;
  }
  return ns + manufacturer + product + check;
}

export type BarcodeSymbology = 'ean13' | 'ean8' | 'upc_a' | 'upc_e' | 'code128' | 'itf14' | 'unknown';

/**
 * Canonical form for storage and matching. An 8-digit code is ambiguous
 * between EAN-8 and UPC-E, so it is only expanded when the scanner says upc_e.
 */
export function normalizeBarcode(raw: string, symbology: BarcodeSymbology = 'unknown'): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';
  if (!/^\d+$/.test(trimmed)) return trimmed;
  if (trimmed.length === 8 && symbology === 'upc_e') {
    const upcA = expandUpcE(trimmed);
    if (upcA && isValidEan13('0' + upcA)) return '0' + upcA;
    return trimmed;
  }
  if (trimmed.length === 12) return '0' + trimmed;
  return trimmed;
}

export function barcodesEquivalent(a: string, b: string): boolean {
  return normalizeBarcode(a) === normalizeBarcode(b);
}
