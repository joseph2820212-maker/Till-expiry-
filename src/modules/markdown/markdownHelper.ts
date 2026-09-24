/**
 * Markdown / price helper (§17) — a financial calculation only. It never decides whether an item is suitable to sell,
 * never changes a stored price, never assumes future sales and never claims "money saved".
 *
 * Decision D4: reimplemented in exact integer minor units. TillCalc's safeMarkdown (calculators/utils/safeMarkdown.ts)
 * runs on floats through its pricing engine; here every price is `minor × (100 − percent) / 100` in BigInt, rounded
 * half-up to the currency's minor unit once.
 *
 * Returns null — the helper is not offered at all — when:
 *   • the batch is not active;
 *   • its controlling date is unknown (no date is never "okay");
 *   • a hard deadline (use-by, manufacturer expiry, internal cutoff) has passed — the effective one or the kept
 *     secondary one (T57).
 * Missing cost / price, or a currency mismatch, keeps the helper unavailable with a reason rather than inventing 0.
 */
import type { Batch, MoneyValue, Product, StatusSettings } from '../../domain/expiry/expiryTypes';
import { evaluateDeadline, priceActionAllowed } from '../../domain/expiry/statusEngine';
import { isHardKind } from '../../domain/expiry/expiryValidation';

export const DEFAULT_MARKDOWN_PERCENTS: readonly number[] = [10, 20, 25, 30, 50] as const;

export interface MarkdownStep {
  percentOff: number;
  price: MoneyValue;
  /** price − cost in minor units (negative = below cost). */
  overCostMinor: number;
  belowCost: boolean;
}

export type MarkdownUnavailableReason = 'noPrice' | 'noCost' | 'currencyMismatch';

export type MarkdownSuggestion =
  | { available: false; reason: MarkdownUnavailableReason }
  | {
    available: true;
    sellingPrice: MoneyValue;
    cost: MoneyValue;
    /** True when the controlling date is a quality date (best-before / review): the UI asks for a quality check first. */
    qualityDate: boolean;
    /** Steps at or above cost. */
    steps: MarkdownStep[];
    /** Steps below cost: shown only after the user explicitly confirms. */
    belowCostSteps: MarkdownStep[];
  };

/** Is a price action allowed at all for this batch right now? */
export function markdownAllowed(batch: Pick<Batch, 'effective' | 'secondary' | 'timeZone' | 'status'>, now: number, settings: StatusSettings): boolean {
  if (!priceActionAllowed(batch, now, settings)) return false;
  if (batch.effective.dateKind === 'none' || !batch.effective.deadline) return false;
  const sec = batch.secondary;
  if (sec && sec.deadline && isHardKind(sec.dateKind)) {
    const ev = evaluateDeadline(sec, batch.timeZone, now, settings);
    if (ev.status === 'past_deadline') return false;
  }
  return true;
}

/** Exact price after a whole-percent reduction, rounded half-up to the minor unit. */
export function priceAtPercent(price: MoneyValue, percentOff: number): MoneyValue {
  if (!Number.isInteger(percentOff) || percentOff < 1 || percentOff > 99) throw new RangeError('percentOff must be an integer 1–99');
  if (!Number.isSafeInteger(price.minor) || price.minor < 0) throw new RangeError('price must be a non-negative safe integer');
  const minor = (BigInt(price.minor) * BigInt(100 - percentOff) + BigInt(50)) / BigInt(100);
  return { minor: Number(minor), currency: price.currency };
}

export function markdownStep(sellingPrice: MoneyValue, cost: MoneyValue, percentOff: number): MarkdownStep {
  const price = priceAtPercent(sellingPrice, percentOff);
  const overCostMinor = price.minor - cost.minor;
  return { percentOff, price, overCostMinor, belowCost: overCostMinor < 0 };
}

export function markdownSuggestion(
  batch: Batch, product: Pick<Product, 'costPerTrackingUnit' | 'sellingPrice'> | null | undefined, now: number, settings: StatusSettings,
  percents: readonly number[] = DEFAULT_MARKDOWN_PERCENTS,
): MarkdownSuggestion | null {
  if (!markdownAllowed(batch, now, settings)) return null;
  const sell = product?.sellingPrice;
  const cost = product?.costPerTrackingUnit;
  if (!sell) return { available: false, reason: 'noPrice' };
  if (!cost) return { available: false, reason: 'noCost' };
  if (sell.currency !== cost.currency) return { available: false, reason: 'currencyMismatch' };
  const seen = new Set<number>();
  const all: MarkdownStep[] = [];
  for (const p of [...percents].sort((a, b) => a - b)) {
    const s = markdownStep(sell, cost, p);
    if (s.price.minor >= sell.minor || seen.has(s.price.minor)) continue; // a step must actually reduce, and differ
    seen.add(s.price.minor);
    all.push(s);
  }
  return {
    available: true, sellingPrice: sell, cost, qualityDate: !isHardKind(batch.effective.dateKind),
    steps: all.filter(s => !s.belowCost), belowCostSteps: all.filter(s => s.belowCost),
  };
}
