/**
 * A price typed by the user on a phone keyboard. Either "." or "," may be the decimal mark (keyboards differ by
 * language), Arabic-Indic digits are accepted, and a separator followed by exactly three digits in a 2-decimal
 * currency ("1,234") is AMBIGUOUS and refused rather than guessed (V1). Grouping separators are not accepted here.
 */
import { moneyFromMinor, type Money } from './money';
import { minorUnitsFor } from '../utils/currencyUnits';
import { normalizeArabicNumerals } from '../utils/locale';

export type TypedPriceError = 'empty' | 'invalid' | 'ambiguous' | 'tooManyDecimals' | 'zero' | 'noCurrency';

export function parseTypedPrice(input: string, currency: string): { ok: true; money: Money } | { ok: false; error: TypedPriceError } {
  if (!/^[A-Z]{3}$/.test(currency || '')) return { ok: false, error: 'noCurrency' };
  const s = normalizeArabicNumerals(String(input ?? '')).replace(/[\s  ]/g, '').replace(/[٫]/g, '.').replace(/[٬]/g, ',');
  if (!s) return { ok: false, error: 'empty' };
  if (!/^\d*([.,]\d*)?$/.test(s) || s === '.' || s === ',') return { ok: false, error: 'invalid' };
  const exp = minorUnitsFor(currency);
  const [int, frac = ''] = s.split(/[.,]/);
  const hasSep = /[.,]/.test(s);
  if (hasSep && frac.length === 3 && exp !== 3) return { ok: false, error: 'ambiguous' };
  if (frac.length > exp) return { ok: false, error: 'tooManyDecimals' };
  const minorStr = `${int || '0'}${frac.padEnd(exp, '0')}`.replace(/^0+(?=\d)/, '');
  const minor = Number(minorStr);
  if (!Number.isSafeInteger(minor)) return { ok: false, error: 'invalid' };
  if (minor === 0) return { ok: false, error: 'zero' };
  return { ok: true, money: moneyFromMinor(minor, currency) };
}

/** The editable text for a stored amount ("4.49"; "1250" for yen; "1.250" for dinar). */
export function priceToInput(m: Money | undefined): string {
  if (!m) return '';
  const exp = minorUnitsFor(m.currency);
  if (exp === 0) return String(m.minor);
  const s = String(m.minor).padStart(exp + 1, '0');
  return `${s.slice(0, -exp)}.${s.slice(-exp)}`;
}
