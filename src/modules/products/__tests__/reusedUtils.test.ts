/** Tests carried over from TillCalc with the utilities they cover (REUSE_MANIFEST §2). */
import { expandUpcE, isValidEan13, normalizeBarcode } from '../utils/barcode';
import { parseCsv, normaliseHeader } from '../utils/csvParse';
import { clearPendingScans, setPendingScan, takePendingScan } from '../utils/scanBus';
import { checksum, makeRevision } from '../utils/ids';

describe('barcode normalisation (from TillCalc)', () => {
  it('prefixes UPC-A to EAN-13 and validates check digits', () => {
    expect(normalizeBarcode('036000291452')).toBe('0036000291452');
    expect(isValidEan13('0036000291452')).toBe(true);
    expect(isValidEan13('5000159407236')).toBe(true);
    expect(isValidEan13('5000159407237')).toBe(false);
    expect(normalizeBarcode(' 5000159407236 ')).toBe('5000159407236');
    expect(normalizeBarcode('ABC-123')).toBe('ABC-123');
  });
  it('expands UPC-E only when the scanner says upc_e and the expansion checks out', () => {
    expect(expandUpcE('01234565')).toBe('012345000065');
    expect(normalizeBarcode('01234565', 'upc_e')).toBe('0012345000065');
    expect(normalizeBarcode('01234565')).toBe('01234565');
    expect(normalizeBarcode('96385074', 'ean8')).toBe('96385074');
  });
});

describe('parseCsv (from TillCalc)', () => {
  it('handles quotes, escaped quotes, CRLF and a BOM', () => {
    expect(parseCsv('﻿a,b\r\n"x, y","say ""hi"""\n')).toEqual([['a', 'b'], ['x, y', 'say "hi"']]);
  });
  it('drops blank rows and keeps leading zeros as text', () => {
    expect(parseCsv('code\n\n00123\n')).toEqual([['code'], ['00123']]);
  });
  it('normalises headers', () => {
    expect(normaliseHeader(' Selling Price ')).toBe('selling_price');
  });
});

describe('scanBus', () => {
  beforeEach(() => clearPendingScans());
  it('hands a code to its target exactly once', () => {
    setPendingScan('product', '5000159407236', 'ean13');
    expect(takePendingScan('date')).toBeNull();
    expect(takePendingScan('product')).toMatchObject({ code: '5000159407236', symbology: 'ean13' });
    expect(takePendingScan('product')).toBeNull();
  });
});

describe('ids', () => {
  it('revisions are unique and the checksum is stable', () => {
    expect(makeRevision()).not.toBe(makeRevision());
    expect(checksum('abc')).toBe(checksum('abc'));
    expect(checksum('abc')).not.toBe(checksum('abd'));
  });
});
