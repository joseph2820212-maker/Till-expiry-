/**
 * What left the shelf in a period, built from batch events (pure). Values are exact: units × the reduced
 * price if the date was reduced before it left, otherwise × the product's normal price; nothing is valued when
 * no price is known. Totals are kept per currency so two currencies are never added together.
 */
import type { BatchEvent, BatchEventKind, DateBatch, LocalDate, Product, WasteReason } from '../../domain/types';
import type { Money } from '../../domain/money';
import { multiplyMoney } from '../../domain/expiry';

export type ReportPeriod = '7d' | '30d' | '90d' | 'all';
export const PERIODS: readonly ReportPeriod[] = ['7d', '30d', '90d', 'all'] as const;

export interface KindTotals { events: number; units: number; value: Record<string, number>; unvalued: number }
export interface ProductWaste { productId: string; name: string; units: number; events: number; value: Record<string, number> }

export interface Report {
  from: LocalDate | null;
  to: LocalDate;
  totals: Record<'sold' | 'wasted' | 'returned' | 'donated' | 'reduced', KindTotals>;
  wasteReasons: Record<WasteReason, number>;
  topWasted: ProductWaste[];
  /** Sold events on dates that had been reduced first ("reductions that worked"). */
  reducedThenSold: number;
}

const empty = (): KindTotals => ({ events: 0, units: 0, value: {}, unvalued: 0 });

export function periodStart(period: ReportPeriod, today: LocalDate, addDays: (d: LocalDate, n: number) => LocalDate): LocalDate | null {
  if (period === 'all') return null;
  return addDays(today, -(Number(period.replace('d', '')) - 1));
}

/** The price a unit left the shelf at: the latest reduction before this event, else the product price. */
export function unitPriceAt(batch: DateBatch, event: BatchEvent, product?: Product): Money | undefined {
  const idx = batch.events.indexOf(event);
  const before = (idx >= 0 ? batch.events.slice(0, idx) : batch.events).filter(e => e.kind === 'reduced' && e.price);
  return before.length ? before[before.length - 1].price : product?.price;
}

function addValue(t: Record<string, number>, m: Money | null): boolean {
  if (!m) return false;
  const next = (t[m.currency] ?? 0) + m.minor;
  if (!Number.isSafeInteger(next)) return false;
  t[m.currency] = next;
  return true;
}

export function buildReport(batches: DateBatch[], products: Product[], from: LocalDate | null, to: LocalDate): Report {
  const byId = new Map(products.map(p => [p.id, p]));
  const totals: Report['totals'] = { sold: empty(), wasted: empty(), returned: empty(), donated: empty(), reduced: empty() };
  const wasteReasons: Record<WasteReason, number> = { expired: 0, damaged: 0, quality: 0, other: 0 };
  const wasteBy = new Map<string, ProductWaste>();
  let reducedThenSold = 0;
  for (const b of batches) {
    for (const e of b.events) {
      if (e.on > to || (from && e.on < from)) continue;
      const kind = e.kind as BatchEventKind;
      if (kind === 'checked') continue;
      const t = totals[kind as keyof Report['totals']];
      t.events++;
      if (kind === 'reduced') continue;
      const units = e.quantity ?? 0;
      t.units += units;
      const price = unitPriceAt(b, e, byId.get(b.productId));
      const valued = e.quantity != null && price ? addValue(t.value, multiplyMoney(price, e.quantity)) : false;
      if (!valued) t.unvalued++;
      if (kind === 'sold' && b.events.slice(0, b.events.indexOf(e)).some(x => x.kind === 'reduced')) reducedThenSold++;
      if (kind === 'wasted') {
        wasteReasons[e.reason ?? 'expired']++;
        const row = wasteBy.get(b.productId) ?? { productId: b.productId, name: byId.get(b.productId)?.name ?? b.productName, units: 0, events: 0, value: {} };
        row.units += units; row.events++;
        if (e.quantity != null && price) addValue(row.value, multiplyMoney(price, e.quantity));
        wasteBy.set(b.productId, row);
      }
    }
  }
  const topWasted = [...wasteBy.values()].sort((a, b) => b.units - a.units || b.events - a.events || a.name.localeCompare(b.name)).slice(0, 10);
  return { from, to, totals, wasteReasons, topWasted, reducedThenSold };
}
