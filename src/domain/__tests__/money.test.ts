import { compareMoney, formatMoneyNumber, isAmbiguousSeparator, moneyFromMinor, parseMoney, PROFILE_COMMA, PROFILE_DOT, toDecimalString } from '../money';

const ok = (r: ReturnType<typeof parseMoney>) => { if (!r.ok) throw new Error(r.error); return r.money; };

describe('exact money', () => {
  it('parses into integer minor units with no float step', () => {
    expect(ok(parseMoney('1.49', 'GBP', PROFILE_DOT))).toEqual({ minor: 149, currency: 'GBP', exponent: 2 });
    expect(ok(parseMoney('0.1', 'GBP', PROFILE_DOT)).minor).toBe(10);
    expect(ok(parseMoney('0.29', 'GBP', PROFILE_DOT)).minor).toBe(29); // 0.29*100 = 28.999… in floats
    expect(ok(parseMoney('1,234.50', 'GBP', PROFILE_DOT)).minor).toBe(123450);
    expect(ok(parseMoney('1.234,50', 'EUR', PROFILE_COMMA)).minor).toBe(123450);
  });

  it('respects the currency exponent: 0, 2 and 3 decimals', () => {
    expect(ok(parseMoney('120', 'JPY', PROFILE_DOT))).toMatchObject({ minor: 120, exponent: 0 });
    expect(parseMoney('120.5', 'JPY', PROFILE_DOT)).toEqual({ ok: false, error: 'tooManyDecimals' });
    expect(ok(parseMoney('1.250', 'KWD', PROFILE_DOT))).toMatchObject({ minor: 1250, exponent: 3 });
    expect(parseMoney('1.2345', 'KWD', PROFILE_DOT)).toEqual({ ok: false, error: 'tooManyDecimals' });
  });

  it('V1 regression: "1,234" is never silently read as 1.234 pounds', () => {
    expect(isAmbiguousSeparator('1,234')).toBe(true);
    expect(isAmbiguousSeparator('1.234')).toBe(true);
    expect(isAmbiguousSeparator('1,23')).toBe(false);
    expect(ok(parseMoney('1,234', 'GBP', PROFILE_DOT)).minor).toBe(123400);
    expect(parseMoney('1,234', 'GBP', PROFILE_COMMA)).toEqual({ ok: false, error: 'tooManyDecimals' });
  });

  it('rejects negatives, junk, bad grouping and overflow', () => {
    expect(parseMoney('', 'GBP', PROFILE_DOT)).toEqual({ ok: false, error: 'empty' });
    expect(parseMoney('-1.00', 'GBP', PROFILE_DOT)).toEqual({ ok: false, error: 'negative' });
    expect(parseMoney('1.2.3', 'GBP', PROFILE_DOT)).toEqual({ ok: false, error: 'invalid' });
    expect(parseMoney('12,34.00', 'GBP', PROFILE_DOT)).toEqual({ ok: false, error: 'badGrouping' });
    expect(parseMoney('£1.00', 'GBP', PROFILE_DOT)).toEqual({ ok: false, error: 'invalid' });
    expect(parseMoney('1.', 'GBP', PROFILE_DOT)).toEqual({ ok: false, error: 'invalid' });
    expect(parseMoney('99999999999999999', 'GBP', PROFILE_DOT)).toEqual({ ok: false, error: 'overflow' });
    expect(parseMoney('1', 'GBP', { decimal: '.', grouping: '.' as ',' })).toEqual({ ok: false, error: 'badProfile' });
  });

  it('accepts Arabic-Indic digits and the Arabic decimal separator', () => {
    expect(ok(parseMoney('١٫٥٠', 'GBP', PROFILE_COMMA)).minor).toBe(150);
    expect(ok(parseMoney('٣٫٥٠٠', 'KWD', PROFILE_COMMA)).minor).toBe(3500);
  });

  it('keeps an intentional zero as zero (a reviewed case, not a missing value)', () => {
    expect(ok(parseMoney('0', 'GBP', PROFILE_DOT)).minor).toBe(0);
  });

  it('formats back exactly', () => {
    expect(toDecimalString(moneyFromMinor(149, 'GBP'))).toBe('1.49');
    expect(toDecimalString(moneyFromMinor(5, 'GBP'))).toBe('0.05');
    expect(toDecimalString(moneyFromMinor(1250, 'KWD'))).toBe('1.250');
    expect(toDecimalString(moneyFromMinor(120, 'JPY'))).toBe('120');
    expect(formatMoneyNumber(moneyFromMinor(123450, 'EUR'), PROFILE_COMMA)).toBe('1.234,50');
    expect(formatMoneyNumber(moneyFromMinor(123450, 'GBP'), PROFILE_DOT)).toBe('1,234.50');
  });

  it('refuses to compare different currencies', () => {
    expect(compareMoney(moneyFromMinor(100, 'GBP'), moneyFromMinor(99, 'GBP'))).toBe(1);
    expect(() => compareMoney(moneyFromMinor(100, 'GBP'), moneyFromMinor(100, 'EUR'))).toThrow(/currency mismatch/);
    expect(() => moneyFromMinor(1.5, 'GBP')).toThrow();
    expect(() => moneyFromMinor(-1, 'GBP')).toThrow();
  });
});
