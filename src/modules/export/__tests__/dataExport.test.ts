/** §18.3 / §19 CSV export: exact money, CSV-injection-safe cells, archived option, workspace isolation, round trip. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///docs/',
  cacheDirectory: 'file:///cache/',
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
  writeAsStringAsync: jest.fn(async () => undefined),
}));
import { createWorkspace, __resetWorkspaceCache } from '../../workspaces/workspaceStore';
import { saveProduct, setProductHidden, listProducts } from '../../products/productStore';
import { createDatedBatch, listBatches, setBatchArchived } from '../../batches/batchStore';
import { saveLocation } from '../../locations/locationStore';
import { addListItem } from '../../lists/listStore';
import { toCsv } from '../../../utils/csv';
import type { Workspace } from '../../../domain/expiry/expiryTypes';
import { batchExportRows, exportFileName, loadExportData, productExportRows, writeExportFile } from '../dataExport';
import { commitImport, decodeCsvText, defaultImportOptions, loadImportContext, planImport } from '../../import/csvImport';

const store = AsyncStorage as any;
beforeEach(async () => { store.clear(); __resetWorkspaceCache(); });

const ws = (name = 'Corner Shop') => createWorkspace({ name, mode: 'mixed', currency: 'GBP', timeZone: 'Europe/London' });

async function seed(w: Workspace) {
  const cat = await addListItem(w.id, 'category', '=HYPERLINK("http://x")');
  const fridge = await saveLocation(w.id, { name: 'Fridge 1', kind: 'fridge' });
  const milk = await saveProduct(w.id, { name: 'Milk 2L', barcodes: [{ code: '5000157024671' }], categoryId: cat.id, costPerTrackingUnit: { minor: 85, currency: 'GBP' }, sellingPrice: { minor: 149, currency: 'GBP' }, defaultLocationId: fridge.id });
  const evil = await saveProduct(w.id, { name: '+SUM(A1:A9)', notes: '@cmd, "quoted"' });
  await createDatedBatch({ workspaceId: w.id, kind: 'bought_in', productId: milk.id, lotNumber: 'A1', quantity: 6, dateKind: 'use_by', deadline: { precision: 'date', date: '2026-09-26' }, locationId: fridge.id });
  await createDatedBatch({ workspaceId: w.id, kind: 'bought_in', productId: milk.id, lotNumber: '-A2', quantity: 2.5, dateKind: 'best_before', deadline: { precision: 'month', month: '2027-03' } });
  const old = await createDatedBatch({ workspaceId: w.id, kind: 'other', productId: evil.id, dateKind: 'internal_cutoff', deadline: { precision: 'datetime', at: '2026-09-24T14:00:00+01:00' } });
  await setBatchArchived(w.id, old.id, true);
  return { milk, evil, fridge };
}

describe('data export', () => {
  it('product rows: exact money, category / location names, hidden products only when asked', async () => {
    const w = await ws();
    const { evil } = await seed(w);
    await setProductHidden(w.id, evil.id, true);
    const data = await loadExportData(w);
    const rows = productExportRows(data, { includeArchived: false });
    expect(rows[0]).toContain('cost');
    const milk = rows.find(r => r[0] === 'Milk 2L')!;
    const col = (n: string) => milk[(rows[0] as string[]).indexOf(n)];
    expect([col('cost'), col('selling_price'), col('currency'), col('category'), col('default_location')]).toEqual(['0.85', '1.49', 'GBP', '=HYPERLINK("http://x")', 'Fridge 1']);
    expect(rows).toHaveLength(2);
    expect(productExportRows(data, { includeArchived: true })).toHaveLength(3);
  });
  it('unknown cost is an empty cell, never 0', async () => {
    const w = await ws();
    await saveProduct(w.id, { name: 'Tea' });
    const rows = productExportRows(await loadExportData(w), { includeArchived: false });
    const i = (rows[0] as string[]).indexOf('cost');
    expect(rows[1][i]).toBe('');
  });
  it('batch rows keep date precision; archived batches only when asked', async () => {
    const w = await ws();
    await seed(w);
    const data = await loadExportData(w);
    const active = batchExportRows(data, { includeArchived: false });
    const h = active[0] as string[];
    expect(active.slice(1).map(r => [r[h.indexOf('lot')], r[h.indexOf('date_kind')], r[h.indexOf('date')], r[h.indexOf('quantity')], r[h.indexOf('location')]])).toEqual([
      ['A1', 'use_by', '2026-09-26', 6, 'Fridge 1'],
      ['-A2', 'best_before', '2027-03', 2.5, 'Fridge 1'], // the product's usual location
    ]);
    const all = batchExportRows(data, { includeArchived: true });
    expect(all).toHaveLength(4);
    expect(all.find(r => r[h.indexOf('status')] === 'archived')![h.indexOf('date')]).toBe('2026-09-24T14:00:00+01:00');
  });
  it('CSV injection: text cells starting with = + - @ are escaped with a quote; numbers are untouched', async () => {
    const w = await ws();
    await seed(w);
    const data = await loadExportData(w);
    const text = toCsv(productExportRows(data, { includeArchived: true })) + '\r\n' + toCsv(batchExportRows(data, { includeArchived: true }));
    expect(text).toContain("'+SUM(A1:A9)");
    expect(text).toContain('"\'=HYPERLINK(""http://x"")"');
    expect(text).toContain('"\'@cmd, ""quoted"""');
    expect(text).toContain(",'-A2,");
    expect(text).not.toMatch(/(^|,)[=+@]/m);
    expect(text).toContain(',2.5,');
  });
  it('workspace isolation: another workspace exports nothing of this one', async () => {
    const a = await ws('Shop A');
    const b = await ws('Shop B');
    await seed(a);
    const data = await loadExportData(b);
    expect(productExportRows(data, { includeArchived: true })).toHaveLength(1);
    expect(batchExportRows(data, { includeArchived: true })).toHaveLength(1);
  });
  it('round trip: an export re-imports into another workspace with the same products, money and batches', async () => {
    const a = await ws('Shop A');
    await seed(a);
    const data = await loadExportData(a);
    const b = await ws('Shop B');
    const ctx = await loadImportContext(b);
    const prodCsv = decodeCsvText(toCsv(productExportRows(data, { includeArchived: false })), 'products.csv');
    if (!prodCsv.ok) throw new Error(prodCsv.error);
    const pp = planImport('products', prodCsv.csv, defaultImportOptions('products', prodCsv.csv), ctx);
    expect(pp.blockers).toEqual([]);
    expect(pp.counts).toMatchObject({ new: 2, errors: 0 });
    await commitImport(pp);
    const bp = await listProducts(b.id);
    const milkB = bp.find(p => p.name === 'Milk 2L')!;
    expect(milkB.costPerTrackingUnit).toEqual({ minor: 85, currency: 'GBP' });
    expect(milkB.sellingPrice).toEqual({ minor: 149, currency: 'GBP' });
    expect(bp.map(p => p.name).sort()).toEqual(['+SUM(A1:A9)', 'Milk 2L']);
    expect(bp.find(p => p.name === '+SUM(A1:A9)')!.notes).toBe('@cmd, "quoted"');

    const batchCsv = decodeCsvText(toCsv(batchExportRows(data, { includeArchived: false })), 'batches.csv');
    if (!batchCsv.ok) throw new Error(batchCsv.error);
    const opts = defaultImportOptions('batches', batchCsv.csv);
    expect(opts.mapping.filter(f => f !== 'ignore')).toEqual(['name', 'barcode', 'sku', 'lot', 'quantity', 'quantity_unit', 'date_kind', 'date', 'location', 'received_at', 'notes']);
    const plan = planImport('batches', batchCsv.csv, opts, await loadImportContext(b));
    expect(plan.issues.filter(i => i.severity === 'error')).toEqual([]);
    await commitImport(plan);
    const strip = (x: Awaited<ReturnType<typeof listBatches>>) => x.map(q => [q.productName, q.lotNumber, q.dateKind, q.datePrecision, q.printedDate ?? q.printedMonth, q.quantityInitial]).sort();
    expect(strip(await listBatches(b.id))).toEqual(strip(await listBatches(a.id)));
  });
  it('writes a real BOM-prefixed file with a sanitised name', async () => {
    const w = await ws('Café "Nord" / 2');
    await seed(w);
    const rows = productExportRows(await loadExportData(w), { includeArchived: false });
    expect(exportFileName('products', w, Date.parse('2026-09-24T10:00:00Z'))).toBe('tillexpiry-products-cafe-nord-2-2026-09-24.csv');
    const uri = await writeExportFile('products', w, rows);
    expect(uri).toMatch(/^file:\/\/\/docs\/tillexpiry-products-cafe-nord-2-\d{4}-\d{2}-\d{2}\.csv$/);
    const written = (FileSystem.writeAsStringAsync as jest.Mock).mock.calls.at(-1)[1] as string;
    expect(written.charCodeAt(0)).toBe(0xfeff);
    expect(written.slice(1)).toBe(toCsv(rows));
  });
});
