/** §20 global search and §32 scale: T30 workspace isolation, T67 5,000 products indexed and searched. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createWorkspace, __resetWorkspaceCache } from '../../workspaces/workspaceStore';
import { saveProduct } from '../../products/productStore';
import { saveLocation } from '../../locations/locationStore';
import { saveRule } from '../../rules/ruleStore';
import { addListItem } from '../../lists/listStore';
import { createDatedBatch } from '../../batches/batchStore';
import { buildSearchIndex, searchIndex, SEARCH_LIMIT } from '../searchIndex';
import { K } from '../../../storage/keys';
import type { Product } from '../../../domain/expiry/expiryTypes';

const store = AsyncStorage as any;
beforeEach(() => { store.clear(); __resetWorkspaceCache(); });

describe('global search', () => {
  it('finds products by name, barcode and SKU, batches by lot and place, rules, places and suppliers', async () => {
    const w = await createWorkspace({ name: 'Shop', mode: 'retail', timeZone: 'Europe/London' });
    const sup = await addListItem(w.id, 'supplier', 'Dairy Direct');
    const fridge = await saveLocation(w.id, { name: 'Back fridge', kind: 'fridge' });
    const p = await saveProduct(w.id, { name: 'Crème fraîche 300ml', sku: 'CF-300', barcodes: [{ code: '5012345678900' }], supplierId: sup.id });
    await createDatedBatch({ workspaceId: w.id, kind: 'bought_in', productId: p.id, dateKind: 'use_by', deadline: { precision: 'date', date: '2026-10-01' }, lotNumber: 'LOT77', locationId: fridge.id });
    await saveRule(w.id, { name: 'Opened cream', appliesTo: 'after_opening', class: 'hard_cutoff', durationMinutes: 2880, sourceText: 'Supplier spec sheet' });
    const idx = await buildSearchIndex(w.id);

    expect(searchIndex(idx, 'creme').map(h => h.type).sort()).toEqual(['batch', 'product']); // accents folded
    expect(searchIndex(idx, '5012345678900').map(h => h.type).sort()).toEqual(['batch', 'product']);
    expect(searchIndex(idx, 'cf-300').some(h => h.type === 'product')).toBe(true);
    expect(searchIndex(idx, 'lot77').map(h => h.type)).toEqual(['batch']);
    expect(searchIndex(idx, 'back fridge').map(h => h.type).sort()).toEqual(['batch', 'location']);
    expect(searchIndex(idx, 'spec sheet').map(h => h.type)).toEqual(['rule']);
    expect(searchIndex(idx, 'dairy').map(h => h.type).sort()).toEqual(['batch', 'product', 'supplier']);
    expect(searchIndex(idx, '   ')).toEqual([]);
  });

  it('T30 search is isolated by workspace', async () => {
    const a = await createWorkspace({ name: 'A', mode: 'retail', timeZone: 'Europe/London' });
    const b = await createWorkspace({ name: 'B', mode: 'retail', timeZone: 'Europe/London' });
    await saveProduct(a.id, { name: 'Oat milk', barcodes: [{ code: '4006381333931' }] });
    await createDatedBatch({ workspaceId: a.id, kind: 'bought_in', newProduct: { name: 'Oat yoghurt' }, dateKind: 'use_by', deadline: { precision: 'date', date: '2026-10-01' } });
    await saveLocation(a.id, { name: 'Oat shelf', kind: 'shelf' });
    const inB = await buildSearchIndex(b.id);
    expect(searchIndex(inB, 'oat')).toEqual([]);
    expect(searchIndex(inB, '4006381333931')).toEqual([]);
    const inA = await buildSearchIndex(a.id);
    expect(searchIndex(inA, 'oat').length).toBe(4);
    expect(inA.entries.every(e => (e.hit.record as { workspaceId: string }).workspaceId === a.id)).toBe(true);
  });

  it('T67 5,000 products are indexed and searched quickly, with a bounded result list', async () => {
    const w = await createWorkspace({ name: 'Big', mode: 'retail', timeZone: 'Europe/London' });
    const now = new Date().toISOString();
    const ids: string[] = [];
    const pairs: [string, string][] = [];
    for (let i = 0; i < 5000; i++) {
      const id = `p_${i}`;
      ids.push(id);
      const p: Product = { id, workspaceId: w.id, name: `Product ${i} ${i % 7 === 0 ? 'cheddar' : 'bread'}`, sku: `SKU${i}`, barcodes: [{ code: String(5000000000000 + i), normalized: String(5000000000000 + i), role: 'single' }], trackingUnit: 'each', status: 'active', createdAt: now, updatedAt: now, schemaVersion: 1 };
      pairs.push([K.item('products', id), JSON.stringify(p)]);
    }
    pairs.push([K.index('products', w.id), JSON.stringify(ids)]);
    await AsyncStorage.multiSet(pairs);

    const t0 = Date.now();
    const idx = await buildSearchIndex(w.id);
    const hits = searchIndex(idx, 'cheddar');
    const exact = searchIndex(idx, 'sku4321');
    const elapsed = Date.now() - t0;
    expect(idx.entries.length).toBe(5000);
    expect(hits.length).toBe(SEARCH_LIMIT); // 715 matches, the list is capped — never 5,000 rows rendered
    expect(exact.map(h => h.id)).toEqual(['p_4321']);
    expect(elapsed).toBeLessThan(3000);
  });
});
