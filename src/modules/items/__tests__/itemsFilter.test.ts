/** §14 Items filters and T68: 20,000 batches filtered without rendering them all. */
import { filterBatches, filterProducts, activeFilterCount, EMPTY_FILTER } from '../itemsFilter';
import { rankBatches } from '../../../domain/expiry/expirySort';
import { DEFAULT_STATUS_SETTINGS as S, type Batch, type Product } from '../../../domain/expiry/expiryTypes';

const NOW = Date.parse('2026-09-24T09:00:00Z');
const iso = '2026-09-01T00:00:00Z';

function product(i: number, extra: Partial<Product> = {}): Product {
  return { id: `p${i}`, workspaceId: 'w', name: `Item ${i}`, sku: `SKU-${i}`, barcodes: [{ code: `50000${i}`, normalized: `50000${i}`, role: 'single' }], trackingUnit: 'each', status: 'active', createdAt: iso, updatedAt: iso, schemaVersion: 1, ...extra };
}

function batch(i: number, date: string | null, extra: Partial<Batch> = {}): Batch {
  return {
    id: `b${i}`, workspaceId: 'w', productId: `p${i % 50}`, productName: `Item ${i % 50}`, kind: 'bought_in', dateKind: date ? 'use_by' : 'none', datePrecision: 'date',
    printedDate: date ?? undefined, timeZone: 'Europe/London', lotNumber: `L${i}`, locationId: i % 2 ? 'fridge' : 'shelf',
    effective: date ? { dateKind: 'use_by', deadline: { precision: 'date', date }, reason: 'printed' } : { dateKind: 'none', reason: 'none' },
    status: 'active', createdAt: iso, updatedAt: iso, schemaVersion: 1, ...extra,
  };
}

const names = (id?: string) => ({ fridge: 'Back fridge', shelf: 'Shelf 1', sup: 'Dairy Direct', cat: 'Chilled' } as Record<string, string>)[id ?? ''];

describe('items filters', () => {
  const products = new Map(Array.from({ length: 50 }, (_, i) => [`p${i}`, product(i, i === 3 ? { supplierId: 'sup', categoryId: 'cat' } : {})]));
  const rows = rankBatches([batch(1, '2026-09-20'), batch(2, '2026-09-24'), batch(3, '2026-10-30'), batch(4, null)], NOW, S);

  it('filters batches by status group, place, supplier, date kind and words across name, lot and place', () => {
    expect(filterBatches(rows, { ...EMPTY_FILTER, group: 'past_hard' }, products, names, names).map(r => r.batch.id)).toEqual(['b1']);
    expect(filterBatches(rows, { ...EMPTY_FILTER, group: 'needs_checking' }, products, names, names).map(r => r.batch.id)).toEqual(['b4']);
    expect(filterBatches(rows, { ...EMPTY_FILTER, locationId: 'fridge' }, products, names, names).map(r => r.batch.id).sort()).toEqual(['b1', 'b3']);
    expect(filterBatches(rows, { ...EMPTY_FILTER, supplierId: 'sup' }, products, names, names).map(r => r.batch.id)).toEqual(['b3']);
    expect(filterBatches(rows, { ...EMPTY_FILTER, dateKind: 'none' }, products, names, names).map(r => r.batch.id)).toEqual(['b4']);
    expect(filterBatches(rows, { ...EMPTY_FILTER, text: 'back fridge item 1' }, products, names, names).map(r => r.batch.id)).toEqual(['b1']);
    expect(filterBatches(rows, { ...EMPTY_FILTER, text: 'dairy' }, products, names, names).map(r => r.batch.id)).toEqual(['b3']);
  });

  it('filters products: hidden only when asked, by supplier / category / words', () => {
    const list = [product(1), product(2, { status: 'hidden' }), product(3, { supplierId: 'sup', categoryId: 'cat', name: 'Butter' })];
    expect(filterProducts(list, EMPTY_FILTER, names, names).map(p => p.id)).toEqual(['p3', 'p1']);
    expect(filterProducts(list, { ...EMPTY_FILTER, archived: true }, names, names).map(p => p.id)).toEqual(['p2']);
    expect(filterProducts(list, { ...EMPTY_FILTER, text: 'chilled' }, names, names).map(p => p.id)).toEqual(['p3']);
    expect(filterProducts(list, { ...EMPTY_FILTER, text: 'sku-1' }, names, names).map(p => p.id)).toEqual(['p1']);
    expect(activeFilterCount({ ...EMPTY_FILTER, supplierId: 'x', archived: true })).toBe(2);
  });

  it('T68 20,000 batches are ranked and filtered well within an interactive budget', () => {
    const big: Batch[] = [];
    for (let i = 0; i < 20000; i++) {
      const d = new Date(Date.UTC(2026, 8, 1 + (i % 90))).toISOString().slice(0, 10);
      big.push(batch(i, i % 11 === 0 ? null : d));
    }
    const t0 = Date.now();
    const ranked = rankBatches(big, NOW, S);
    const t1 = Date.now();
    const soon = filterBatches(ranked, { ...EMPTY_FILTER, group: 'due_soon', locationId: 'fridge' }, products, names, names);
    const text = filterBatches(ranked, { ...EMPTY_FILTER, text: 'l1999' }, products, names, names);
    const t2 = Date.now();
    expect(ranked).toHaveLength(20000);
    expect(soon.length).toBeGreaterThan(0);
    expect(text.map(r => r.batch.id)).toContain('b1999');
    // Generous CI bounds; the screen renders these through a windowed FlatList (initialNumToRender 12).
    expect(t1 - t0).toBeLessThan(4000);
    expect(t2 - t1).toBeLessThan(2000);
  });
});
