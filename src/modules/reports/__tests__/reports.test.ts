import { buildReport, periodStart, unitPriceAt } from '../report';
import { checkSheetHtml, historyRows, openDatesRows } from '../exports';
import { addDays } from '../../../domain/dates';
import { moneyFromMinor } from '../../../domain/money';
import type { DateBatch, Product } from '../../../domain/types';

jest.mock('../../../utils/pdfFile', () => ({ printHtmlToPdfFile: jest.fn(async () => 'file:///x.pdf') }));

const at = '2026-09-01T00:00:00Z';
const P = (id: string, name: string, price?: number, currency = 'GBP'): Product => ({ schemaVersion: 1, id, name, barcodes: [{ raw: `50000${id}`, normalized: `50000${id}`, format: 'unknown' }], status: 'active', isSample: false, createdAt: at, updatedAt: at, ...(price != null ? { price: moneyFromMinor(price, currency) } : {}) });
const B = (id: string, productId: string, over: Partial<DateBatch> = {}): DateBatch => ({ schemaVersion: 1, id, productId, productName: productId, date: '2026-09-20', dateType: 'useBy', status: 'closed', events: [], createdAt: at, updatedAt: at, ...over });
const t = (k: string, o?: Record<string, unknown>) => (o ? `${k}(${Object.values(o).join(',')})` : k);

const products = [P('milk', 'Milk', 145), P('bread', 'Bread'), P('wine', 'Wine', 900, 'EUR')];
const batches: DateBatch[] = [
  B('1', 'milk', { quantity: 6, events: [
    { id: 'a', kind: 'reduced', on: '2026-09-19', at, price: moneyFromMinor(70, 'GBP') },
    { id: 'b', kind: 'sold', on: '2026-09-20', at, quantity: 4 },
    { id: 'c', kind: 'wasted', on: '2026-09-21', at, quantity: 2, reason: 'expired' },
  ] }),
  B('2', 'milk', { quantity: 3, events: [{ id: 'd', kind: 'wasted', on: '2026-09-22', at, quantity: 3, reason: 'damaged' }] }),
  B('3', 'bread', { events: [{ id: 'e', kind: 'wasted', on: '2026-09-22', at, reason: 'quality' }] }),
  B('4', 'wine', { quantity: 1, events: [{ id: 'f', kind: 'wasted', on: '2026-09-23', at, quantity: 1 }] }),
  B('5', 'milk', { quantity: 1, events: [{ id: 'g', kind: 'donated', on: '2026-06-01', at, quantity: 1 }] }),
  B('6', 'milk', { status: 'open', date: '2026-09-25', quantity: 2, location: 'Chiller 2', events: [{ id: 'h', kind: 'checked', on: '2026-09-24', at }] }),
];

describe('waste report', () => {
  it('values units at the reduced price if reduced first, else the normal price; per currency; unvalued counted', () => {
    const r = buildReport(batches, products, '2026-09-01', '2026-09-24');
    expect(r.totals.sold).toEqual({ events: 1, units: 4, value: { GBP: 280 }, unvalued: 0 });
    expect(r.totals.wasted).toEqual({ events: 4, units: 6, value: { GBP: 140 + 435, EUR: 900 }, unvalued: 1 });
    expect(r.totals.reduced.events).toBe(1);
    expect(r.totals.donated.events).toBe(0); // June is outside the period
    expect(r.wasteReasons).toEqual({ expired: 2, damaged: 1, quality: 1, other: 0 });
    expect(r.reducedThenSold).toBe(1);
    expect(r.topWasted.map(w => [w.name, w.units])).toEqual([['Milk', 5], ['Wine', 1], ['Bread', 0]]);
    expect(buildReport(batches, products, null, '2026-09-24').totals.donated.units).toBe(1);
  });
  it('period start and the price in force at an event', () => {
    expect(periodStart('7d', '2026-09-24', addDays)).toBe('2026-09-18');
    expect(periodStart('all', '2026-09-24', addDays)).toBeNull();
    expect(unitPriceAt(batches[0], batches[0].events[1], products[0])?.minor).toBe(70);
    expect(unitPriceAt(batches[1], batches[1].events[0], products[0])?.minor).toBe(145);
  });
});

describe('exports', () => {
  it('open dates CSV: one row per open date with days left, band and what is left', () => {
    const rows = openDatesRows(batches, products, '2026-09-24', 3, t);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual(['Milk', '50000milk', '', '2026-09-25', 'dateType.useBy', 1, 'band.soon', 2, 'Chiller 2', '', '', '']);
  });
  it('history CSV: every event, newest first, exact decimal prices', () => {
    const rows = historyRows(batches, products, t);
    expect(rows).toHaveLength(1 + 8);
    expect(rows[1][0]).toBe('2026-09-24');
    const reduced = rows.find(r => r[5] === 'event.reduced')!;
    expect(reduced.slice(8, 10)).toEqual(['0.70', 'GBP']);
  });
  it('check sheet: escaped, grouped by place, right-to-left for Arabic, empty state', () => {
    const hostile = [P('x', '<script>alert(1)</script>')];
    const open = [B('9', 'x', { status: 'open', date: '2026-09-23', location: 'A & B' }), B('10', 'x', { status: 'open', date: '2026-12-01' })];
    const html = checkSheetHtml(open, hostile, '2026-09-24', 3, 3, t, true);
    expect(html).toContain('dir="rtl"');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('A &amp; B');
    expect(html).toContain('class="expired"');
    expect(html).not.toContain('2026-12-01');
    expect(checkSheetHtml([], [], '2026-09-24', 3, 3, t, false)).toContain('checkSheet.empty');
  });
});
