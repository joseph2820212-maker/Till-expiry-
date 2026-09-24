/**
 * Quantities of a dated batch (§8). Optional; never negative; up to three decimals (kg / l). Arithmetic runs on
 * integer thousandths so 0.1 + 0.2 never drifts. No unit conversion is ever done automatically.
 */
export const QTY_MAX = 1_000_000;

const toMilli = (n: number) => Math.round(n * 1000);
const fromMilli = (n: number) => n / 1000;

export function isValidQuantity(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 && n <= QTY_MAX && Math.abs(toMilli(n) - n * 1000) < 1e-6;
}

/** Parse a typed quantity ("2", "0.5", "0,5", Arabic digits handled by the caller's normaliser). */
export function parseQuantity(text: string): number | null {
  const s = String(text ?? '').trim().replace(',', '.');
  if (!/^\d+(\.\d{1,3})?$/.test(s)) return null;
  const n = Number(s);
  return isValidQuantity(n) ? n : null;
}

export function subtractQuantity(from: number, amount: number): number {
  const r = toMilli(from) - toMilli(amount);
  if (r < 0) throw new RangeError('quantity would go below zero');
  return fromMilli(r);
}

export function addQuantity(a: number, b: number): number {
  return fromMilli(toMilli(a) + toMilli(b));
}

export function sumQuantities(list: (number | undefined)[]): number {
  return fromMilli(list.reduce<number>((s, n) => s + (n == null ? 0 : toMilli(n)), 0));
}
