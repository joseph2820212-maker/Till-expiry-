import { parseTypedPrice, priceToInput } from '../typedPrice';

describe('typed prices', () => {
  it('accepts . or , as the decimal mark and Arabic-Indic digits', () => {
    expect(parseTypedPrice('4.49', 'GBP')).toMatchObject({ ok: true, money: { minor: 449 } });
    expect(parseTypedPrice('4,49', 'EUR')).toMatchObject({ ok: true, money: { minor: 449 } });
    expect(parseTypedPrice('٤٫٤٩', 'AED')).toMatchObject({ ok: true, money: { minor: 449 } });
    expect(parseTypedPrice('12', 'GBP')).toMatchObject({ ok: true, money: { minor: 1200 } });
    expect(parseTypedPrice('1250', 'JPY')).toMatchObject({ ok: true, money: { minor: 1250 } });
    expect(parseTypedPrice('1.250', 'KWD')).toMatchObject({ ok: true, money: { minor: 1250 } });
  });
  it('refuses the ambiguous "1,234", too many decimals, zero, junk and a missing currency', () => {
    expect(parseTypedPrice('1,234', 'GBP')).toEqual({ ok: false, error: 'ambiguous' });
    expect(parseTypedPrice('1.5', 'JPY')).toEqual({ ok: false, error: 'tooManyDecimals' });
    expect(parseTypedPrice('0', 'GBP')).toEqual({ ok: false, error: 'zero' });
    expect(parseTypedPrice('4.4.9', 'GBP')).toEqual({ ok: false, error: 'invalid' });
    expect(parseTypedPrice('', 'GBP')).toEqual({ ok: false, error: 'empty' });
    expect(parseTypedPrice('4.49', '')).toEqual({ ok: false, error: 'noCurrency' });
  });
  it('round-trips stored amounts for editing', () => {
    expect(priceToInput({ minor: 449, currency: 'GBP', exponent: 2 })).toBe('4.49');
    expect(priceToInput({ minor: 5, currency: 'GBP', exponent: 2 })).toBe('0.05');
    expect(priceToInput({ minor: 1250, currency: 'JPY', exponent: 0 })).toBe('1250');
  });
});
