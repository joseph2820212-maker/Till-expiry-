// ISO 4217 minor units for the currencies the app offers. Everything not listed is 2.
const ZERO_DECIMAL = new Set(['CLP', 'XOF', 'XAF', 'JPY', 'KRW', 'VND', 'ISK', 'UGX', 'RWF', 'GNF', 'PYG', 'KMF', 'DJF', 'BIF']);
const THREE_DECIMAL = new Set(['KWD', 'BHD', 'OMR', 'JOD', 'IQD', 'TND', 'LYD']);

export type MinorUnits = 0 | 2 | 3;

export function minorUnitsFor(currencyCode: string): MinorUnits {
  const code = (currencyCode || '').toUpperCase();
  if (ZERO_DECIMAL.has(code)) return 0;
  if (THREE_DECIMAL.has(code)) return 3;
  return 2;
}

export function minorUnitStep(minorUnits: MinorUnits): number {
  return minorUnits === 0 ? 1 : minorUnits === 3 ? 0.001 : 0.01;
}

/** Round half-up to the currency's minor unit. */
export function roundToMinor(amount: number, minorUnits: MinorUnits): number {
  if (!isFinite(amount)) return 0;
  const factor = Math.pow(10, minorUnits);
  return Math.round((amount + Number.EPSILON) * factor) / factor;
}

export function ceilToMinor(amount: number, minorUnits: MinorUnits): number {
  if (!isFinite(amount)) return 0;
  const factor = Math.pow(10, minorUnits);
  return Math.ceil(amount * factor - 1e-9) / factor;
}

/** Number of decimals to show for a value: whole amounts drop the fraction, others show the full minor unit. */
export function displayDecimals(amount: number, minorUnits: MinorUnits): number {
  if (minorUnits === 0) return 0;
  const rounded = roundToMinor(amount, minorUnits);
  return Number.isInteger(rounded) ? 0 : minorUnits;
}
