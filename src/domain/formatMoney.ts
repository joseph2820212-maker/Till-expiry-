/**
 * Printed-label money formatting (owner correction, 24 Sep 2026).
 *
 *   formatMoney(amountMinor, currencyCode, labelLanguage)
 *
 * Every input is explicit. It never reads the app language, the app's chosen currency or any module
 * state, so an Arabic app can print an English AED label and a German app a French EUR label. Output is
 * deterministic (a fixed convention table, not the device's Intl data, which differs between Hermes and
 * Node) and always uses Western digits, per the family's financial-digits policy.
 */
import { minorUnitsFor } from '../utils/currencyUnits';
import { SYMBOL_MAP } from '../utils/currency';
import type { LanguageCode } from './types';
import type { Money } from './money';

export class MissingCurrencyError extends Error {
  constructor(value: unknown) {
    super(`A printed price needs an explicit ISO 4217 currency code; got ${JSON.stringify(value)}`);
    this.name = 'MissingCurrencyError';
  }
}

interface LabelNumberConvention {
  decimal: string;
  group: string;
  /** Smallest integer length that gets grouping (Spanish does not group 4-digit amounts). */
  minGroupDigits: number;
  symbolPosition: 'before' | 'after';
  /** Space between number and a symbol placed after it, or between an alphabetic code and the number. */
  space: string;
}

const NBSP = ' ';
const NNBSP = ' ';

/** One convention per printed-label language (CLDR-style, Western digits). */
const CONVENTIONS: Record<LanguageCode, LabelNumberConvention> = {
  en: { decimal: '.', group: ',', minGroupDigits: 4, symbolPosition: 'before', space: NBSP },
  ar: { decimal: '.', group: ',', minGroupDigits: 4, symbolPosition: 'after', space: NBSP },
  tr: { decimal: ',', group: '.', minGroupDigits: 4, symbolPosition: 'before', space: NBSP },
  fr: { decimal: ',', group: NNBSP, minGroupDigits: 4, symbolPosition: 'after', space: NBSP },
  es: { decimal: ',', group: '.', minGroupDigits: 5, symbolPosition: 'after', space: NBSP },
  de: { decimal: ',', group: '.', minGroupDigits: 4, symbolPosition: 'after', space: NBSP },
};

const ARABIC_SCRIPT = /[؀-ۿ]/;

/**
 * The symbol printed for a currency in a given label language. The ISO code is always what is stored;
 * an Arabic-script symbol (د.إ) is used only on Arabic labels, otherwise the ISO code (AED) is printed.
 */
export function labelCurrencySymbol(currencyCode: string, labelLanguage: LanguageCode): string {
  const option = Object.keys(SYMBOL_MAP).find(o => o.endsWith(` ${currencyCode}`));
  const symbol = option ? SYMBOL_MAP[option] : currencyCode;
  if (ARABIC_SCRIPT.test(symbol) && labelLanguage !== 'ar') return currencyCode;
  return symbol;
}

function assertCurrency(code: unknown): asserts code is string {
  if (typeof code !== 'string' || !/^[A-Z]{3}$/.test(code)) throw new MissingCurrencyError(code);
}

function group(int: string, c: LabelNumberConvention): string {
  if (int.length < c.minGroupDigits) return int;
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, c.group);
}

export interface MoneyParts {
  /** The grouped number with its decimal mark, e.g. "1.234,50". */
  number: string;
  /** The printed currency symbol or ISO code, e.g. "€", "AED", "د.إ". */
  symbol: string;
  symbolPosition: 'before' | 'after';
  /** Space between symbol and number ('' for a glyph symbol placed before, e.g. £4.49). */
  space: string;
  /** True for ISO codes and Arabic-script symbols, which labels print smaller than the digits. */
  wordSymbol: boolean;
}

/**
 * The pieces of a printed price, for renderers that style the symbol separately. Joining them in order gives
 * exactly formatMoney(); both come from the same convention table.
 */
export function formatMoneyParts(amountMinor: number, currencyCode: string, labelLanguage: LanguageCode, extraDecimals: 0 | 1 | 2 = 0): MoneyParts {
  assertCurrency(currencyCode);
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) throw new RangeError('amountMinor must be a non-negative safe integer');
  const c = CONVENTIONS[labelLanguage];
  if (!c) throw new RangeError(`Unsupported label language: ${String(labelLanguage)}`);
  // extraDecimals: unit prices may carry more precision than the selling price (e.g. £0.281 per 100 g); the amount
  // is then in 1/10^extraDecimals of a minor unit. Selling prices always use the currency's own decimals.
  const exponent = minorUnitsFor(currencyCode) + extraDecimals;
  const digits = String(amountMinor).padStart(exponent + 1, '0');
  const int = exponent === 0 ? digits : digits.slice(0, -exponent);
  const frac = exponent === 0 ? '' : digits.slice(-exponent);
  const number = frac ? `${group(int, c)}${c.decimal}${frac}` : group(int, c);
  const symbol = labelCurrencySymbol(currencyCode, labelLanguage);
  const alphabetic = /^[A-Za-z]/.test(symbol) && symbol.length > 1;
  const wordSymbol = alphabetic || ARABIC_SCRIPT.test(symbol);
  if (c.symbolPosition === 'after') return { number, symbol, symbolPosition: 'after', space: c.space, wordSymbol };
  return { number, symbol, symbolPosition: 'before', space: alphabetic ? c.space : '', wordSymbol };
}

/**
 * Format a non-negative amount in minor units for a printed label.
 * Throws MissingCurrencyError when the currency is missing or not an ISO 4217 code — a label is never
 * printed in an assumed currency.
 */
export function formatMoney(amountMinor: number, currencyCode: string, labelLanguage: LanguageCode, extraDecimals: 0 | 1 | 2 = 0): string {
  const p = formatMoneyParts(amountMinor, currencyCode, labelLanguage, extraDecimals);
  return p.symbolPosition === 'after' ? `${p.number}${p.space}${p.symbol}` : `${p.symbol}${p.space}${p.number}`;
}

/** Convenience for a Money value; the currency always comes from the value itself. */
export function formatMoneyValue(m: Money, labelLanguage: LanguageCode): string {
  return formatMoney(m.minor, m.currency, labelLanguage);
}
