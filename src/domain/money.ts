/**
 * Exact money for TillLabel (plan §F, validation V2).
 *
 * An amount is an integer count of minor units (pence, fils, yen) plus the
 * currency and its exponent. No price arithmetic ever touches binary floating
 * point: parsing works on the digit string, formatting on the integer.
 * The exponent comes from TillCalc's `minorUnitsFor` (ISO 4217 minor units).
 */
import { minorUnitsFor, type MinorUnits } from '../utils/currencyUnits';
import { normalizeArabicNumerals } from '../utils/locale';

export interface Money {
  /** Integer amount in minor units. Always a safe integer. */
  minor: number;
  /** ISO 4217 code, upper case. */
  currency: string;
  exponent: MinorUnits;
}

/**
 * How a typed or imported number is written. Chosen and confirmed by the user
 * (import profile or app setting); never guessed from one value (V1).
 */
export interface NumberProfile {
  decimal: '.' | ',';
  grouping: ',' | '.' | ' ' | "'" | 'none';
}

export const PROFILE_DOT: NumberProfile = { decimal: '.', grouping: ',' };
export const PROFILE_COMMA: NumberProfile = { decimal: ',', grouping: '.' };

export type MoneyParseError = 'empty' | 'invalid' | 'negative' | 'tooManyDecimals' | 'badGrouping' | 'overflow' | 'badProfile';
export type MoneyParse = { ok: true; money: Money } | { ok: false; error: MoneyParseError };

const MAX_MINOR = Number.MAX_SAFE_INTEGER;

export function exponentFor(currency: string): MinorUnits {
  return minorUnitsFor(currency.toUpperCase());
}

/** Build Money from an integer minor-unit count. Throws on a non-safe or negative integer. */
export function moneyFromMinor(minor: number, currency: string): Money {
  if (!Number.isSafeInteger(minor) || minor < 0) throw new RangeError('minor must be a non-negative safe integer');
  const code = currency.toUpperCase();
  return { minor, currency: code, exponent: exponentFor(code) };
}

/**
 * Parse a price exactly. "1,234" under PROFILE_DOT is 1234; under PROFILE_COMMA
 * it is 1.234, which a 2-decimal currency rejects as tooManyDecimals instead of
 * silently rounding. Extra decimals are never rounded away.
 */
export function parseMoney(input: string, currency: string, profile: NumberProfile): MoneyParse {
  if (profile.grouping !== 'none' && (profile.grouping as string) === profile.decimal) return { ok: false, error: 'badProfile' };
  const exponent = exponentFor(currency);
  let s = normalizeArabicNumerals(String(input ?? '')).replace(/٫/g, ',').replace(/٬/g, ',').replace(/[  ]/g, ' ').trim();
  if (!s) return { ok: false, error: 'empty' };
  if (s.startsWith('-') || s.startsWith('−')) return { ok: false, error: 'negative' };
  if (s.startsWith('+')) s = s.slice(1);
  const parts = s.split(profile.decimal);
  if (parts.length > 2) return { ok: false, error: 'invalid' };
  const [intRaw, fracRaw = ''] = parts;
  if (parts.length === 2 && fracRaw === '') return { ok: false, error: 'invalid' };
  if (!/^\d*$/.test(fracRaw)) return { ok: false, error: 'invalid' };
  let intDigits = intRaw;
  if (profile.grouping !== 'none' && intRaw.includes(profile.grouping)) {
    const groups = intRaw.split(profile.grouping);
    if (!/^\d{1,3}$/.test(groups[0]) || groups.slice(1).some(g => !/^\d{3}$/.test(g))) return { ok: false, error: 'badGrouping' };
    intDigits = groups.join('');
  }
  if (!/^\d*$/.test(intDigits)) return { ok: false, error: 'invalid' };
  if (intDigits === '' && fracRaw === '') return { ok: false, error: 'invalid' };
  if (fracRaw.length > exponent) return { ok: false, error: 'tooManyDecimals' };
  const digits = (intDigits || '0') + fracRaw.padEnd(exponent, '0');
  const trimmed = digits.replace(/^0+(?=\d)/, '');
  if (trimmed.length > 15) return { ok: false, error: 'overflow' };
  const minor = Number(trimmed);
  if (!Number.isSafeInteger(minor) || minor > MAX_MINOR) return { ok: false, error: 'overflow' };
  return { ok: true, money: { minor, currency: currency.toUpperCase(), exponent } };
}

/** Plain decimal string with exactly `exponent` decimals and a "." separator, e.g. "1.49", "0.250", "120". */
export function toDecimalString(m: Money): string {
  const s = String(m.minor);
  if (m.exponent === 0) return s;
  const padded = s.padStart(m.exponent + 1, '0');
  return `${padded.slice(0, -m.exponent)}.${padded.slice(-m.exponent)}`;
}

/** Display a Money value with the given separators (no currency symbol; symbol placement is a UI concern). */
export function formatMoneyNumber(m: Money, profile: NumberProfile): string {
  const [int, frac] = toDecimalString(m).split('.');
  const grouped = profile.grouping === 'none' ? int : int.replace(/\B(?=(\d{3})+(?!\d))/g, profile.grouping);
  return frac ? `${grouped}${profile.decimal}${frac}` : grouped;
}

export function sameCurrency(a: Money, b: Money): boolean {
  return a.currency === b.currency && a.exponent === b.exponent;
}

/** Exact comparison; throws if currencies differ so a mixed-currency comparison can never pass silently. */
export function compareMoney(a: Money, b: Money): -1 | 0 | 1 {
  if (!sameCurrency(a, b)) throw new Error(`currency mismatch: ${a.currency} vs ${b.currency}`);
  return a.minor === b.minor ? 0 : a.minor < b.minor ? -1 : 1;
}

/**
 * True when a value has exactly one "," or "." followed by exactly three digits
 * (e.g. "1,234" or "1.234"): it reads as either a thousands group or three
 * decimals. Import previews flag such cells unless the file's profile is confirmed.
 */
export function isAmbiguousSeparator(input: string): boolean {
  const s = normalizeArabicNumerals(String(input ?? '')).trim();
  return /^\d{1,3}[.,]\d{3}$/.test(s);
}
