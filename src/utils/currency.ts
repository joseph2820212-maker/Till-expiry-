import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import i18n from '../i18n';
import { groupNumber } from './locale';
import { displayDecimals, minorUnitsFor, roundToMinor } from './currencyUnits';

const CURRENCY_KEY = 'settings:currency';

// Maps stored option string → display symbol
export const SYMBOL_MAP: Record<string, string> = {
  '£ GBP': '£',
  '€ EUR': '€',
  '$ USD': '$',
  '₺ TRY': '₺',
  // Gulf
  'ر.س SAR': 'ر.س',
  'د.إ AED': 'د.إ',
  'د.ك KWD': 'د.ك',
  'ر.ق QAR': 'ر.ق',
  'د.ب BHD': 'د.ب',
  'ر.ع OMR': 'ر.ع',
  // Levant & North Africa
  'ل.س SYP': 'ل.س',
  'د.أ JOD': 'د.أ',
  'ل.ل LBP': 'ل.ل',
  '₪ ILS': '₪',
  'ع.د IQD': 'ع.د',
  'ج.م EGP': 'ج.م',
  // Europe & North America / Oceania
  'CHF CHF': 'CHF',
  'CA$ CAD': 'CA$',
  'A$ AUD': 'A$',
  // South Asia & Sub-Saharan Africa
  '₹ INR': '₹',
  '₦ NGN': '₦',
  'R ZAR': 'R',
  // Latin America
  'Mex$ MXN': 'Mex$',
  'AR$ ARS': 'AR$',
  'COL$ COP': 'COL$',
  'CLP$ CLP': 'CLP$',
  'S/ PEN': 'S/',
  // North & West/Central Africa
  'د.م. MAD': 'د.م.',
  'د.ج DZD': 'د.ج',
  'د.ت TND': 'د.ت',
  'FCFA XOF': 'FCFA',
  'FCFA XAF': 'FCFA',
};

/**
 * No default currency (family rule from TillLabel, 24 Sep 2026): TillExpiry is international, so the currency is
 * UNSET until the user chooses one. The inherited TillCalc GBP default is removed. Code that needs a
 * currency must check isCurrencySet() and ask; money formatting takes an explicit ISO code and never reads
 * this module state (src/domain/formatMoney.ts).
 */
let _symbol = '';
let _code = '';
let _currencyVersion = 0;
const currencyListeners = new Set<() => void>();

export function getCurrencySymbol(): string {
  return _symbol;
}

/** ISO 4217 code of the chosen currency, or '' when the user has not chosen one yet. */
export function getCurrencyCode(): string {
  return _code;
}

/** True once the user has chosen a currency. */
export function isCurrencySet(): boolean {
  return /^[A-Z]{3}$/.test(_code);
}

/** The SYMBOL_MAP option for an ISO code (e.g. 'EUR' → '€ EUR'), or undefined. */
export function optionForCode(code: string): string | undefined {
  return Object.keys(SYMBOL_MAP).find(o => o.endsWith(` ${code}`));
}

export function useCurrencyCode(): string {
  useCurrencyVersion();
  return getCurrencyCode();
}

function notifyCurrencyChanged(): void {
  _currencyVersion += 1;
  currencyListeners.forEach(listener => listener());
}

export function subscribeCurrencyChanges(listener: () => void): () => void {
  currencyListeners.add(listener);
  return () => currencyListeners.delete(listener);
}

export function getCurrencyVersion(): number {
  return _currencyVersion;
}

export function useCurrencyVersion(): number {
  return useSyncExternalStore(subscribeCurrencyChanges, getCurrencyVersion, getCurrencyVersion);
}

export function useCurrencySymbol(): string {
  useCurrencyVersion();
  return getCurrencySymbol();
}

export function setCurrencySymbolFromOption(option: string): void {
  const sym = SYMBOL_MAP[option] ?? option.split(' ')[0];
  const parts = option.split(' ');
  const code = parts.length >= 2 ? parts[parts.length - 1] : _code;
  let changed = false;
  if (sym && sym !== _symbol) { _symbol = sym; changed = true; }
  if (code !== _code) { _code = code; changed = true; }
  if (changed) notifyCurrencyChanged();
}

/** Persist the choice as its ISO 4217 code (never only the symbol: £, $ and kr are ambiguous). */
export async function setCurrencyOption(option: string): Promise<void> {
  if (!SYMBOL_MAP[option]) return;
  const code = option.split(' ').pop() as string;
  await AsyncStorage.setItem(CURRENCY_KEY, code);
  setCurrencySymbolFromOption(option);
}

/** Initialise the displayed currency from the single stored setting. */
export async function initCurrency(): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(CURRENCY_KEY);
    if (!stored) return; // unset: no silent default
    // Stored as an ISO code; an older "symbol CODE" option string is still accepted.
    const option = /^[A-Z]{3}$/.test(stored) ? optionForCode(stored) : SYMBOL_MAP[stored] ? stored : undefined;
    if (option) setCurrencySymbolFromOption(option);
  } catch {}
}

// In Arabic the currency symbol follows the number: ١٢٥٠ ل.س
export function currencyAfter(): boolean {
  return ['ar', 'fr', 'es', 'de'].includes(i18n.language);
}

export function symbolForCode(code: string): string {
  for (const [option, sym] of Object.entries(SYMBOL_MAP)) {
    if (option.endsWith(` ${code}`)) return sym;
  }
  return code;
}

export function formatAmountForCurrency(
  amount: number | null | undefined,
  currencyCode: string,
  sign: '' | '+' | '-' = '',
): string {
  const val = (amount === null || amount === undefined || isNaN(amount as number) || !isFinite(amount as number))
    ? 0
    : (amount as number);
  const sym = symbolForCode(currencyCode);
  const minor = minorUnitsFor(currencyCode);
  const rounded = roundToMinor(Math.abs(val), minor);
  const decimals = displayDecimals(rounded, minor);
  const numStr = groupNumber(rounded, decimals, minor);
  const autoSign = sign || (val < 0 ? '-' : '');
  return currencyAfter()
    ? `${autoSign}${numStr} ${sym}`
    : `${autoSign}${sym}${numStr}`;
}

// Central formatter used by all modules. sign = '' | '+' | '-'
export function formatAmount(
  amount: number | null | undefined,
  sign: '' | '+' | '-' = '',
): string {
  const val = (amount === null || amount === undefined || isNaN(amount as number) || !isFinite(amount as number))
    ? 0
    : (amount as number);
  const sym = getCurrencySymbol();
  // Whole amounts drop the fraction; others show the currency's full minor unit (250 / 250.50 / 1.250 KWD).
  const minor = minorUnitsFor(_code);
  const rounded = roundToMinor(Math.abs(val), minor);
  const decimals = displayDecimals(rounded, minor);
  const numStr = groupNumber(rounded, decimals, minor);
  const autoSign = sign || (val < 0 ? '-' : '');
  return currencyAfter()
    ? `${autoSign}${numStr} ${sym}`
    : `${autoSign}${sym}${numStr}`;
}

export function formatCompact(
  amount: number | null | undefined,
  currencySymbol = getCurrencySymbol(),
): string {
  const val = (amount === null || amount === undefined || isNaN(amount as number) || !isFinite(amount as number))
    ? 0
    : (amount as number);
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  let suffix = '';
  let scaled = abs;
  let fractionDigits = 0;

  if (abs >= 1_000_000) {
    scaled = abs / 1_000_000;
    suffix = 'm';
    fractionDigits = 1;
  } else if (abs >= 1_000) {
    scaled = abs / 1_000;
    suffix = 'k';
    fractionDigits = 1;
  }

  const number = groupNumber(scaled, 0, fractionDigits);
  const signedNumber = `${sign}${number}${suffix}`;
  return currencyAfter() ? `${signedNumber} ${currencySymbol}` : `${currencySymbol}${signedNumber}`;
}
