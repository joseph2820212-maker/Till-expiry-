/**
 * Owner correction (24 Sep 2026): printed prices are formatted from an explicit currency + printed-label
 * language, never from the app language, and never in an assumed (GBP) currency.
 */
import i18n from 'i18next';
import { formatMoney, formatMoneyValue, labelCurrencySymbol, MissingCurrencyError } from '../formatMoney';
import { moneyFromMinor } from '../money';

const NB = ' ';
const NNB = ' ';

describe('six label languages, each with its home currency', () => {
  it.each([
    ['en', 'GBP', 123450, '£1,234.50'],
    ['ar', 'AED', 123450, `1,234.50${NB}د.إ`],
    ['tr', 'TRY', 123450, '₺1.234,50'],
    ['fr', 'EUR', 123450, `1${NNB}234,50${NB}€`],
    ['es', 'EUR', 123450, `1234,50${NB}€`],
    ['de', 'EUR', 123450, `1.234,50${NB}€`],
  ] as const)('%s + %s', (lang, code, minor, expected) => {
    expect(formatMoney(minor, code, lang)).toBe(expected);
  });
  it('Spanish groups from five integer digits', () => {
    expect(formatMoney(1234550, 'EUR', 'es')).toBe(`12.345,50${NB}€`);
  });
});

describe('independence from the app language', () => {
  const appLanguages = ['en', 'ar', 'tr', 'fr', 'es', 'de'];
  afterAll(() => { void i18n.changeLanguage?.('en'); });
  it('Arabic app + English label + AED prints the English form with the ISO code', async () => {
    for (const app of appLanguages) {
      await i18n.changeLanguage?.(app);
      expect(formatMoney(149, 'AED', 'en')).toBe(`AED${NB}1.49`);
    }
  });
  it('English app + Arabic label + EUR prints the Arabic form', async () => {
    await i18n.changeLanguage?.('en');
    expect(formatMoney(149, 'EUR', 'ar')).toBe(`1.49${NB}€`);
  });
  it('German app + French label + EUR and Turkish app + German label + GBP', async () => {
    await i18n.changeLanguage?.('de');
    expect(formatMoney(123450, 'EUR', 'fr')).toBe(`1${NNB}234,50${NB}€`);
    await i18n.changeLanguage?.('tr');
    expect(formatMoney(123450, 'GBP', 'de')).toBe(`1.234,50${NB}£`);
  });
});

describe('currency is explicit, preserved and never assumed', () => {
  it.each([undefined, null, '', 'gbp', '£', 'GB', 'EURO'])('rejects %p instead of falling back to GBP', bad => {
    expect(() => formatMoney(100, bad as any, 'en')).toThrow(MissingCurrencyError);
  });
  it('uses each currency exponent: 0, 2 and 3 decimals', () => {
    expect(formatMoney(120, 'JPY', 'en')).toBe(`JPY${NB}120`);
    expect(formatMoney(1250, 'KWD', 'ar')).toBe(`1.250${NB}د.ك`);
    expect(formatMoney(1250, 'KWD', 'en')).toBe(`KWD${NB}1.250`);
    expect(formatMoney(5, 'GBP', 'en')).toBe('£0.05');
  });
  it('Arabic-script symbols appear only on Arabic labels; the stored value is always the ISO code', () => {
    expect(labelCurrencySymbol('SAR', 'ar')).toBe('ر.س');
    expect(labelCurrencySymbol('SAR', 'fr')).toBe('SAR');
    expect(labelCurrencySymbol('EUR', 'ar')).toBe('€');
    expect(labelCurrencySymbol('XYZ', 'en')).toBe('XYZ');
    const m = moneyFromMinor(999, 'try');
    expect(m.currency).toBe('TRY');
    expect(formatMoneyValue(m, 'tr')).toBe('₺9,99');
  });
  it('Western digits on every label, including Arabic', () => {
    for (const lang of ['en', 'ar', 'tr', 'fr', 'es', 'de'] as const) {
      expect(formatMoney(987654321, 'EUR', lang)).not.toMatch(/[٠-٩۰-۹]/);
    }
  });
  it('rejects negative or fractional minor amounts and unknown label languages', () => {
    expect(() => formatMoney(-1, 'EUR', 'en')).toThrow(RangeError);
    expect(() => formatMoney(1.5, 'EUR', 'en')).toThrow(RangeError);
    expect(() => formatMoney(1, 'EUR', 'it' as any)).toThrow(RangeError);
  });
});
