/** Master handoff §17 / T57 — the price helper is exact, and never offered after a hard deadline. */
import type { Batch, DeadlineInfo, Product } from '../../../domain/expiry/expiryTypes';
import { DEFAULT_STATUS_SETTINGS as S } from '../../../domain/expiry/expiryTypes';
import { markdownAllowed, markdownSuggestion, priceAtPercent } from '../markdownHelper';

const NOW = Date.parse('2026-09-24T12:00:00Z');
const product: Pick<Product, 'costPerTrackingUnit' | 'sellingPrice'> = {
  costPerTrackingUnit: { minor: 120, currency: 'GBP' },
  sellingPrice: { minor: 199, currency: 'GBP' },
};

function batch(effective: DeadlineInfo, extra: Partial<Batch> = {}): Batch {
  return {
    id: 'b1', workspaceId: 'w1', productId: 'p1', productName: 'Milk', kind: 'bought_in', dateKind: effective.dateKind,
    datePrecision: 'date', timeZone: 'Europe/London', effective, status: 'active', createdAt: '', updatedAt: '', schemaVersion: 1, ...extra,
  };
}
const date = (d: string) => ({ precision: 'date' as const, date: d });

describe('markdown helper', () => {
  it('T57 past use-by: no markdown suggestion at all', () => {
    const b = batch({ dateKind: 'use_by', deadline: date('2026-09-23'), reason: 'printed' });
    expect(markdownAllowed(b, NOW, S)).toBe(false);
    expect(markdownSuggestion(b, product, NOW, S)).toBeNull();
  });
  it('past an exact internal cutoff (even an hour ago): no suggestion', () => {
    const b = batch({ dateKind: 'internal_cutoff', deadline: { precision: 'datetime', at: '2026-09-24T12:00:00+01:00' }, reason: 'rule' }, { kind: 'prepared' });
    expect(markdownSuggestion(b, product, NOW, S)).toBeNull();
  });
  it('an opened pack whose kept original hard date has passed: no suggestion', () => {
    const b = batch(
      { dateKind: 'best_before', deadline: date('2026-10-10'), reason: 'rule' },
      { kind: 'opened', secondary: { dateKind: 'use_by', deadline: date('2026-09-20'), reason: 'original_hard' } },
    );
    expect(markdownSuggestion(b, product, NOW, S)).toBeNull();
  });
  it('unknown date or an inactive batch: no suggestion (unknown is never okay)', () => {
    expect(markdownSuggestion(batch({ dateKind: 'none', reason: 'none' }), product, NOW, S)).toBeNull();
    expect(markdownSuggestion(batch({ dateKind: 'use_by', deadline: date('2026-09-30'), reason: 'printed' }, { status: 'completed' }), product, NOW, S)).toBeNull();
  });
  it('allowed before a use-by, and for a best-before even after its date (flagged as a quality date)', () => {
    const before = markdownSuggestion(batch({ dateKind: 'use_by', deadline: date('2026-09-24'), reason: 'printed' }), product, NOW, S);
    expect(before).toMatchObject({ available: true, qualityDate: false });
    const bb = markdownSuggestion(batch({ dateKind: 'best_before', deadline: date('2026-09-20'), reason: 'printed' }), product, NOW, S);
    expect(bb).toMatchObject({ available: true, qualityDate: true });
  });
  it('exact prices, rounded half-up to the minor unit; below-cost steps kept apart for explicit confirmation', () => {
    const s = markdownSuggestion(batch({ dateKind: 'best_before', deadline: date('2026-10-20'), reason: 'printed' }), product, NOW, S);
    if (!s || !s.available) throw new Error('expected a suggestion');
    // 199 × 0.9 = 179.1 → 179; × 0.8 = 159.2 → 159; × 0.75 = 149.25 → 149; × 0.7 = 139.3 → 139; × 0.5 = 99.5 → 100
    expect(s.steps.map(x => [x.percentOff, x.price.minor, x.overCostMinor])).toEqual([[10, 179, 59], [20, 159, 39], [25, 149, 29], [30, 139, 19]]);
    expect(s.belowCostSteps.map(x => [x.percentOff, x.price.minor, x.belowCost])).toEqual([[50, 100, true]]);
    expect(priceAtPercent({ minor: 125, currency: 'GBP' }, 10).minor).toBe(113); // 112.5 → 113
    expect(priceAtPercent({ minor: 1999, currency: 'JPY' }, 15)).toEqual({ minor: 1699, currency: 'JPY' }); // 1699.15
    expect(priceAtPercent({ minor: 1250, currency: 'KWD' }, 33).minor).toBe(838); // 837.5 → 838
    expect(() => priceAtPercent({ minor: 100, currency: 'GBP' }, 0)).toThrow();
    expect(() => priceAtPercent({ minor: 100, currency: 'GBP' }, 12.5)).toThrow();
  });
  it('unknown cost or price keeps the helper unavailable instead of using 0', () => {
    const b = batch({ dateKind: 'best_before', deadline: date('2026-10-20'), reason: 'printed' });
    expect(markdownSuggestion(b, { sellingPrice: product.sellingPrice }, NOW, S)).toEqual({ available: false, reason: 'noCost' });
    expect(markdownSuggestion(b, { costPerTrackingUnit: product.costPerTrackingUnit }, NOW, S)).toEqual({ available: false, reason: 'noPrice' });
    expect(markdownSuggestion(b, null, NOW, S)).toEqual({ available: false, reason: 'noPrice' });
    expect(markdownSuggestion(b, { costPerTrackingUnit: { minor: 1, currency: 'EUR' }, sellingPrice: product.sellingPrice }, NOW, S)).toEqual({ available: false, reason: 'currencyMismatch' });
  });
});
