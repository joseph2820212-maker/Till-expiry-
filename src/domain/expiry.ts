/**
 * Where a date stands today, what is left of a batch, and the money figures for reductions and waste.
 * Pure functions: the screens, the reminder planner, the check sheet and the reports all use these, so the same
 * batch can never be "due" on one screen and "fine" on another.
 */
import type { BatchEvent, DateBatch, DateType, LocalDate, Product } from './types';
import { REMOVAL_KINDS } from './types';
import { daysBetween } from './dates';
import type { Money } from './money';
import { moneyFromMinor } from './money';

/**
 * expired — the date has passed; today — it is today; soon — within the alert window; later — beyond it.
 * For a best-before date "expired" means "past its best before date" (the wording differs, the band does not).
 */
export type Band = 'expired' | 'today' | 'soon' | 'later';
export const BAND_ORDER: readonly Band[] = ['expired', 'today', 'soon', 'later'] as const;

export const ALERT_DAYS_MIN = 0;
export const ALERT_DAYS_MAX = 60;
export const SHELF_LIFE_MAX = 3650;

export function clampAlertDays(n: unknown, fallback: number): number {
  const v = typeof n === 'number' && Number.isInteger(n) ? n : fallback;
  return Math.min(ALERT_DAYS_MAX, Math.max(ALERT_DAYS_MIN, v));
}

export function bandFor(date: LocalDate, today: LocalDate, alertDays: number): Band {
  const d = daysBetween(today, date);
  if (d < 0) return 'expired';
  if (d === 0) return 'today';
  return d <= alertDays ? 'soon' : 'later';
}

/** Alert window for one batch: the product's own setting wins over the shop setting. */
export function alertDaysFor(product: Pick<Product, 'alertDays'> | undefined, shopAlertDays: number): number {
  return product?.alertDays != null ? clampAlertDays(product.alertDays, shopAlertDays) : shopAlertDays;
}

/** Units removed through sold / wasted / returned / donated events (events without a quantity are ignored). */
export function removedQuantity(batch: Pick<DateBatch, 'events'>): number {
  return batch.events.filter(e => REMOVAL_KINDS.includes(e.kind) && typeof e.quantity === 'number').reduce((s, e) => s + (e.quantity as number), 0);
}

/** Units still on the shelf, or null when the batch was never counted. */
export function remainingQuantity(batch: Pick<DateBatch, 'quantity' | 'events'>): number | null {
  if (batch.quantity == null) return null;
  return Math.max(0, batch.quantity - removedQuantity(batch));
}

/** The latest reduction on an open batch (a batch can be reduced twice: 50 % then 75 %). */
export function currentReduction(batch: Pick<DateBatch, 'events'>): BatchEvent | undefined {
  const reductions = batch.events.filter(e => e.kind === 'reduced' && e.price);
  return reductions[reductions.length - 1];
}

/** Checked (or acted on) today: the date check can skip it. */
export function checkedToday(batch: Pick<DateBatch, 'events'>, today: LocalDate): boolean {
  return batch.events.some(e => e.on === today);
}

/**
 * Batches that need someone to look at the shelf: open, and expired / today / soon. Ordered by date, oldest
 * first, then use-by before other kinds (safety dates first on the same day).
 */
export function needsAttention<T extends DateBatch>(batches: T[], today: LocalDate, alertDaysOf: (b: T) => number): T[] {
  return batches
    .filter(b => b.status === 'open' && bandFor(b.date, today, alertDaysOf(b)) !== 'later')
    .sort(byDateThenSafety);
}

const TYPE_PRIORITY: Record<DateType, number> = { useBy: 0, sellBy: 1, displayUntil: 2, bestBefore: 3 };
export function byDateThenSafety(a: DateBatch, b: DateBatch): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.dateType !== b.dateType) return TYPE_PRIORITY[a.dateType] - TYPE_PRIORITY[b.dateType];
  return a.productName.localeCompare(b.productName);
}

export interface BandCounts { expired: number; today: number; soon: number; later: number; reduced: number; open: number }

export function countBands<T extends DateBatch>(batches: T[], today: LocalDate, alertDaysOf: (b: T) => number): BandCounts {
  const c: BandCounts = { expired: 0, today: 0, soon: 0, later: 0, reduced: 0, open: 0 };
  for (const b of batches) {
    if (b.status !== 'open') continue;
    c.open++;
    c[bandFor(b.date, today, alertDaysOf(b))]++;
    if (currentReduction(b)) c.reduced++;
  }
  return c;
}

/** Exact percentage off (0–100, whole percent rounded half-up) between a normal and a reduced price. */
export function percentOff(normal: Money, reduced: Money): number | null {
  if (normal.currency !== reduced.currency || normal.minor <= 0 || reduced.minor > normal.minor) return null;
  const saved = normal.minor - reduced.minor;
  return Math.floor((saved * 200 + normal.minor) / (normal.minor * 2));
}

/** Reduced price for a whole-percent reduction, rounded half-up to the currency's minor unit. */
export function reducedBy(normal: Money, percent: number): Money {
  if (!Number.isInteger(percent) || percent < 1 || percent > 99) throw new RangeError('percent must be 1–99');
  const keep = normal.minor * (100 - percent);
  return moneyFromMinor(Math.floor((keep * 2 + 100) / 200), normal.currency);
}

/** price × quantity in minor units, exact; null if the result would not be a safe integer. */
export function multiplyMoney(price: Money, quantity: number): Money | null {
  if (!Number.isSafeInteger(quantity) || quantity < 0) return null;
  const minor = price.minor * quantity;
  return Number.isSafeInteger(minor) ? { ...price, minor } : null;
}
