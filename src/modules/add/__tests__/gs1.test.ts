/** §11 barcode scope — GS1 AIs 01 / 10 / 15 / 17 (T33) and malformed data never inventing a date (T34). */
import { GS, gs1Year, gtinLookupCodes, hasSuggestion, isValidGtin14, parseGs1, parseGs1Date } from '../gs1';
import { gs1Suggestion } from '../addForms';

const NOW = new Date('2026-09-24T12:00:00Z');
const GTIN = '09501101530003';
const P = (s: string, allowBare = false) => parseGs1(s, { now: NOW, allowBare });

describe('GS1 element strings', () => {
  it('T33 GS1-128 with ]C1 prefix: GTIN, expiry (17) and a variable lot (10) at the end', () => {
    const r = P(`]C101${GTIN}17261231` + `10AB-12/x`);
    expect(r).toMatchObject({ gtin: GTIN, lot: 'AB-12/x', expiry: { precision: 'date', date: '2026-12-31' }, complete: true, issues: [] });
    expect(r?.ais).toEqual(['01', '17', '10']);
  });

  it('T33 DataMatrix ]d2 with a GS after the variable lot, then best before (15)', () => {
    const r = P(`]d201${GTIN}10LOT7${GS}15270300`);
    expect(r).toMatchObject({ gtin: GTIN, lot: 'LOT7', bestBefore: { precision: 'month', month: '2027-03' }, complete: true });
  });

  it('GS1 QR ]Q3 and a leading FNC1 (GS) are accepted', () => {
    expect(P(`]Q3${GS}01${GTIN}17270115`)?.expiry).toEqual({ precision: 'date', date: '2027-01-15' });
  });

  it('plain element string with GS separators (no symbology prefix)', () => {
    expect(P(`01${GTIN}10A1${GS}17261130`)).toMatchObject({ lot: 'A1', expiry: { precision: 'date', date: '2026-11-30' } });
  });

  it('bare string starting with (01) only when the scanner says the symbol can carry GS1 data', () => {
    expect(P(`01${GTIN}17261231`)).toBeNull();
    expect(P(`01${GTIN}17261231`, true)?.expiry).toEqual({ precision: 'date', date: '2026-12-31' });
  });

  it('human-readable bracketed form, any order, spaces between elements', () => {
    const r = P(`(01)${GTIN} (17)261231 (10)ABC123`);
    expect(r).toMatchObject({ gtin: GTIN, lot: 'ABC123', expiry: { precision: 'date', date: '2026-12-31' }, complete: true });
    expect(P(`]C1(10)X9(15)261000`)).toMatchObject({ lot: 'X9', bestBefore: { precision: 'month', month: '2026-10' } });
  });

  it('a standard EAN-13 / UPC product code is not GS1 data (the form still asks for the date)', () => {
    expect(P('5000157024671')).toBeNull();
    expect(P('036000291452')).toBeNull();
    expect(P('')).toBeNull();
    expect(P('hello world')).toBeNull();
  });

  it('other known AIs are skipped by their length, not misread', () => {
    // (11) production date and (3103) net weight kg are fixed-length; (21) serial is variable.
    const r = P(`]C101${GTIN}11260901310300150017261231` + `21SER${GS}10L1`);
    expect(r).toMatchObject({ gtin: GTIN, lot: 'L1', expiry: { precision: 'date', date: '2026-12-31' }, complete: true });
    expect(r?.ais).toEqual(['01', '11', '3103', '17', '21', '10']);
    expect(r?.bestBefore).toBeUndefined();
  });
});

describe('dates', () => {
  it('AI 15 DD=00 means best before end of month → month precision (never a made-up day)', () => {
    expect(parseGs1Date('270200', NOW)).toEqual({ precision: 'month', month: '2027-02' });
    expect(parseGs1Date('270200', NOW, '15')).toEqual({ precision: 'month', month: '2027-02' });
  });
  it('EXP-REV-09 AI 17 DD=00 is the last day of that month, leap years included', () => {
    expect(parseGs1Date('270200', NOW, '17')).toEqual({ precision: 'date', date: '2027-02-28' });
    expect(parseGs1Date('280200', NOW, '17')).toEqual({ precision: 'date', date: '2028-02-29' });
    expect(parseGs1Date('261100', NOW, '17')).toEqual({ precision: 'date', date: '2026-11-30' });
    expect(parseGs1Date('261200', NOW, '17')).toEqual({ precision: 'date', date: '2026-12-31' });
    expect(P(`]C117280200`)).toMatchObject({ expiry: { precision: 'date', date: '2028-02-29' } });
  });
  it('real calendar check: 30 February and month 13 are refused', () => {
    expect(parseGs1Date('270230', NOW)).toBeNull();
    expect(parseGs1Date('271301', NOW)).toBeNull();
    expect(parseGs1Date('270001', NOW)).toBeNull();
    expect(parseGs1Date('28022', NOW)).toBeNull();
    expect(parseGs1Date('280229', NOW)).toEqual({ precision: 'date', date: '2028-02-29' });
    expect(parseGs1Date('270229', NOW)).toBeNull();
  });
  it('century window per GS1 General Specifications', () => {
    expect(gs1Year(26, NOW)).toBe(2026);
    expect(gs1Year(76, NOW)).toBe(2076);   // diff 50 → current century
    expect(gs1Year(77, NOW)).toBe(1977);   // diff 51 → previous century
    expect(gs1Year(0, NOW)).toBe(2000);    // diff −26
    expect(gs1Year(95, new Date('2049-06-01T00:00:00Z'))).toBe(2095); // diff 46
    expect(gs1Year(0, new Date('2050-06-01T00:00:00Z'))).toBe(2100);  // diff −50 → next century
    expect(gs1Year(1, new Date('2050-06-01T00:00:00Z'))).toBe(2001);  // diff −49
  });
});

describe('T34 malformed GS1 never invents a date', () => {
  it('invalid date in AI 17 → no expiry, reason given, the rest kept', () => {
    const r = P(`]C101${GTIN}17261340`);
    expect(r?.expiry).toBeUndefined();
    expect(r?.gtin).toBe(GTIN);
    expect(r?.issues).toContainEqual({ code: 'badDate', ai: '17' });
  });
  it('truncated fixed-length date → no date', () => {
    const r = P(`]C101${GTIN}172612`);
    expect(r?.expiry).toBeUndefined();
    expect(r?.complete).toBe(false);
    expect(r?.issues).toContainEqual({ code: 'truncated', ai: '17' });
  });
  it('GS inside a fixed-length field → truncated, no date', () => {
    const r = P(`]d217261${GS}231`);
    expect(r?.expiry).toBeUndefined();
    expect(r?.issues[0].code).toBe('truncated');
  });
  it('wrong GTIN check digit → no GTIN', () => {
    const r = P(`]C10109501101530004` + '17261231');
    expect(r?.gtin).toBeUndefined();
    expect(r?.issues).toContainEqual({ code: 'badGtinCheck', ai: '01' });
    expect(r?.expiry).toEqual({ precision: 'date', date: '2026-12-31' });
  });
  it('non-digit GTIN → badGtin', () => {
    expect(P(`(01)0950110153000X`)?.issues).toContainEqual({ code: 'badGtin', ai: '01' });
  });
  it('unknown AI stops the split: nothing after it is read', () => {
    const r = P(`]C101${GTIN}` + '8899XYZ' + '17261231');
    expect(r?.gtin).toBe(GTIN);
    expect(r?.expiry).toBeUndefined();
    expect(r?.complete).toBe(false);
    expect(r?.issues[0].code).toBe('unknownAi');
  });
  it('lot longer than 20 characters or with characters outside the GS1 set is dropped', () => {
    expect(P(`]C110${'A'.repeat(21)}`)?.lot).toBeUndefined();
    expect(P(`]C110${'A'.repeat(21)}`)?.issues).toContainEqual({ code: 'badLot', ai: '10' });
    expect(P(`]C110AB CD`)?.lot).toBeUndefined();
    expect(P(`]C110${'A'.repeat(20)}`)?.lot).toBe('A'.repeat(20));
  });
  it('the same AI twice with different values → conflict, value dropped', () => {
    const r = P(`(17)261231(17)270101(10)A`);
    expect(r?.expiry).toBeUndefined();
    expect(r?.issues).toContainEqual({ code: 'conflict', ai: '17' });
    expect(r?.lot).toBe('A');
  });
  it('bracketed text with stray characters or wrong fixed length is refused', () => {
    expect(P('(17)26123')?.expiry).toBeUndefined();
    expect(P('(17)26123')?.issues).toContainEqual({ code: 'badLength', ai: '17' });
    expect(P('(17)261231 junk')?.expiry).toBeUndefined();
    expect(P('x(17)261231')).toBeNull();
    expect(P('(17)261231zz(10)A')?.issues).toContainEqual({ code: 'badLength', ai: '17' });
  });
  it('a prefix with nothing after it is malformed', () => {
    expect(P(']C1')).toMatchObject({ complete: false, issues: [{ code: 'malformed' }] });
    expect(hasSuggestion(P(']C1'))).toBe(false);
  });
});

describe('GTIN helpers and suggestions', () => {
  it('check digit and lookup codes (leading 0 → EAN-13 printed on the pack)', () => {
    expect(isValidGtin14(GTIN)).toBe(true);
    expect(isValidGtin14('05000157024671')).toBe(true);
    expect(gtinLookupCodes('05000157024671')).toEqual(['5000157024671', '05000157024671']);
    expect(gtinLookupCodes('15000157024678')).toEqual(['15000157024678']);
    expect(gtinLookupCodes('123')).toEqual([]);
  });
  it('AI 17 day → suggested use-by in a food workspace, manufacturer expiry at home; AI 17 DD=00 resolves to its last day (EXP-REV-09)', () => {
    const r = P(`]C117261231`);
    expect(gs1Suggestion(r, 'retail')).toMatchObject({ dateKind: 'use_by', deadline: { precision: 'date', date: '2026-12-31' }, source: '17' });
    expect(gs1Suggestion(r, 'home_other').dateKind).toBe('manufacturer_expiry');
    // A still-unconfirmed suggestion: the user confirms the date and its kind before saving.
    expect(gs1Suggestion(P(`]C117261200`), 'food_prep')).toMatchObject({ dateKind: 'use_by', deadline: { precision: 'date', date: '2026-12-31' } });
  });
  it('AI 15 → best before; both present → 17 suggested, 15 shown alongside', () => {
    expect(gs1Suggestion(P(`]C115270300`), 'mixed')).toMatchObject({ dateKind: 'best_before', source: '15' });
    const both = gs1Suggestion(P(`]C11527030017261231`), 'mixed');
    expect(both).toMatchObject({ source: '17', otherBestBefore: { precision: 'month', month: '2027-03' } });
  });
  it('nothing reliable → no suggestion', () => {
    expect(gs1Suggestion(P(`]C117999999`), 'mixed')).toEqual({ lot: undefined });
    expect(gs1Suggestion(null, 'mixed')).toEqual({});
  });
});
