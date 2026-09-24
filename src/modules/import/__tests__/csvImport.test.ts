/** §19 CSV import (T35–T38 and the import side of T26–T28) against the real storage layer. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createWorkspace, __resetWorkspaceCache } from '../../workspaces/workspaceStore';
import { listProducts, saveProduct } from '../../products/productStore';
import { listBatches, listBatchEvents } from '../../batches/batchStore';
import { listLocations, saveLocation } from '../../locations/locationStore';
import { listItems } from '../../lists/listStore';
import type { Workspace } from '../../../domain/expiry/expiryTypes';
import {
  commitImport, decodeCsvBytes, decodeCsvText, defaultImportOptions, guessMapping, importFingerprint, IMPORT_LIMITS, listImportHistory,
  loadImportContext, parseDateCell, parseDateKindCell, parseMoneyCell, planImport, setColumnField, type DecodedCsv, type ImportKind, type ImportOptions,
} from '../csvImport';

const store = AsyncStorage as any;
beforeEach(async () => { store.clear(); __resetWorkspaceCache(); });

async function ws(name = 'Corner Shop', currency = 'GBP'): Promise<Workspace> {
  return createWorkspace({ name, mode: 'mixed', currency, timeZone: 'Europe/London' });
}

function csvOf(text: string, name = 'file.csv'): DecodedCsv {
  const r = decodeCsvText(text, name);
  if (!r.ok) throw new Error(`decode failed: ${r.error}`);
  return r.csv;
}

async function plan(w: Workspace, kind: ImportKind, text: string, patch: Partial<ImportOptions> = {}) {
  const csv = csvOf(text);
  const opts = { ...defaultImportOptions(kind, csv), ...patch };
  return planImport(kind, csv, opts, await loadImportContext(w));
}

const utf8 = (s: string) => new TextEncoder().encode(s);

describe('decode safely', () => {
  it('reads a UTF-8 BOM file with ";" delimiters, quoted fields, embedded delimiters, quotes and newlines', () => {
    const text = '﻿Name;Barcode;Notes\r\n"Milk; 2L";5000157024671;"He said ""fresh""\nsecond line"\r\nBread;;\r\n';
    const r = decodeCsvBytes(utf8(text), 'x.csv');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.csv.delimiter).toBe(';');
    expect(r.csv.encoding).toBe('utf-8');
    expect(r.csv.header).toEqual(['Name', 'Barcode', 'Notes']);
    expect(r.csv.rows).toEqual([['Milk; 2L', '5000157024671', 'He said "fresh"\nsecond line'], ['Bread', '', '']]);
  });
  it('falls back to Windows-1252 so £ is not garbled', () => {
    const bytes = new Uint8Array([...utf8('name,cost\nTea,'), 0xa3, ...utf8('1.50\n')]);
    const r = decodeCsvBytes(bytes, 'x.csv');
    expect(r.ok && r.csv.encoding).toBe('windows-1252');
    expect(r.ok && r.csv.rows[0][1]).toBe('£1.50');
  });
  it('refuses spreadsheets, binary, empty, oversized, too many rows / columns', () => {
    expect(decodeCsvBytes(new Uint8Array([0x50, 0x4b, 3, 4]), 'a.xlsx')).toEqual({ ok: false, error: 'spreadsheet' });
    expect(decodeCsvBytes(new Uint8Array([]), 'a.csv')).toEqual({ ok: false, error: 'empty' });
    expect(decodeCsvBytes(utf8('a,b\n1\u00002,3'), 'a.csv')).toEqual({ ok: false, error: 'binary' });
    expect(decodeCsvBytes(new Uint8Array(IMPORT_LIMITS.fileBytes + 1).fill(65), 'a.csv')).toEqual({ ok: false, error: 'tooLarge' });
    expect(decodeCsvText('name\n' + 'x\n'.repeat(IMPORT_LIMITS.rows + 1), 'a.csv')).toEqual({ ok: false, error: 'tooManyRows' });
    expect(decodeCsvText(Array(IMPORT_LIMITS.columns + 1).fill('c').join(',') + '\n1', 'a.csv')).toEqual({ ok: false, error: 'tooManyColumns' });
    expect(decodeCsvText('name\n', 'a.csv')).toEqual({ ok: false, error: 'noDataRows' });
  });
  it('pads short rows to the header width', () => {
    expect(csvOf('a,b,c\n1\n').rows).toEqual([['1', '', '']]);
  });
  it('the fingerprint ignores BOM / line endings but depends on kind and workspace', () => {
    const a = importFingerprint('﻿name\r\nMilk\r\n', 'products', 'w1');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(importFingerprint('name\nMilk', 'products', 'w1')).toBe(a);
    expect(importFingerprint('name\nMilk', 'batches', 'w1')).not.toBe(a);
    expect(importFingerprint('name\nMilk', 'products', 'w2')).not.toBe(a);
    expect(importFingerprint('name\nMilk2', 'products', 'w1')).not.toBe(a);
  });
});

describe('header mapping', () => {
  it('guesses English and the other five languages, each field once, and the user can change it', () => {
    expect(guessMapping('batches', ['Product', 'EAN', 'Lot', 'Qty', 'Use by', 'Location', 'Whatever'])).toEqual(['name', 'barcode', 'lot', 'quantity', 'date', 'location', 'ignore']);
    expect(guessMapping('batches', ['Désignation', 'Code-barres', 'Lot', 'Quantité', 'DLC', 'Emplacement'])).toEqual(['ignore', 'barcode', 'lot', 'quantity', 'date', 'location']);
    expect(guessMapping('batches', ['Ürün adı', 'Barkod', 'SKT', 'Miktar'])).toEqual(['name', 'barcode', 'date', 'quantity']);
    expect(guessMapping('batches', ['Artikel', 'Strichcode', 'MHD', 'Menge', 'Charge'])).toEqual(['name', 'barcode', 'date', 'quantity', 'lot']);
    expect(guessMapping('batches', ['Producto', 'Código de barras', 'Fecha de caducidad', 'Cantidad', 'Lote'])).toEqual(['name', 'barcode', 'date', 'quantity', 'lot']);
    expect(guessMapping('batches', ['اسم المنتج', 'الباركود', 'تاريخ الانتهاء', 'الكمية'])).toEqual(['name', 'barcode', 'date', 'quantity']);
    expect(guessMapping('products', ['Name', 'Barcode', 'Category', 'Supplier', 'Cost', 'Selling price', 'Unit', 'Notes'])).toEqual(['name', 'barcode', 'category', 'supplier', 'cost', 'price', 'unit', 'notes']);
    // "Date kind" does not steal "Date".
    expect(guessMapping('batches', ['Date kind', 'Date'])).toEqual(['date_kind', 'date']);
    const m = setColumnField(['name', 'barcode', 'ignore'], 2, 'name');
    expect(m).toEqual(['ignore', 'barcode', 'name']);
  });
  it('a date column named after a kind proposes that kind (shown for confirmation, never applied silently)', () => {
    const csv = csvOf('Product,Use by\nMilk,2026-10-01\n');
    expect(defaultImportOptions('batches', csv).defaultDateKind).toBe('use_by');
    expect(defaultImportOptions('batches', csvOf('Product,Date\nMilk,2026-10-01\n')).defaultDateKind).toBeNull();
  });
});

describe('cell parsing', () => {
  it('dates keep their precision: day, month-only, exact time in the workspace zone', () => {
    expect(parseDateCell('2026-09-24', '', 'dmy', 'Europe/London')).toEqual({ ok: true, deadline: { precision: 'date', date: '2026-09-24' } });
    expect(parseDateCell('03/04/2026', '', 'dmy', 'Europe/London')).toEqual({ ok: true, deadline: { precision: 'date', date: '2026-04-03' } });
    expect(parseDateCell('03/04/2026', '', 'mdy', 'Europe/London')).toEqual({ ok: true, deadline: { precision: 'date', date: '2026-03-04' } });
    expect(parseDateCell('2026-09', '', 'dmy', 'Europe/London')).toEqual({ ok: true, deadline: { precision: 'month', month: '2026-09' } });
    expect(parseDateCell('09/2026', '', 'dmy', 'Europe/London')).toEqual({ ok: true, deadline: { precision: 'month', month: '2026-09' } });
    expect(parseDateCell('2026-09-24', '14:30', 'dmy', 'Europe/London')).toEqual({ ok: true, deadline: { precision: 'datetime', at: '2026-09-24T14:30:00+01:00' } });
    expect(parseDateCell('2026-09-24T14:30:00+01:00', '', 'dmy', 'UTC')).toEqual({ ok: true, deadline: { precision: 'datetime', at: '2026-09-24T14:30:00+01:00' } });
    expect(parseDateCell('31/02/2026', '', 'dmy', 'UTC')).toEqual({ ok: false, error: 'badDate' });
    expect(parseDateCell('2026-13', '', 'dmy', 'UTC')).toEqual({ ok: false, error: 'badDate' });
    expect(parseDateCell('2026-09', '10:00', 'dmy', 'UTC')).toEqual({ ok: false, error: 'timeWithMonth' });
    expect(parseDateCell('2026-09-24', '25:00', 'dmy', 'UTC')).toEqual({ ok: false, error: 'badTime' });
  });
  it('date-kind words in six languages; an unknown word is refused, not guessed', () => {
    expect(parseDateKindCell('Use by')).toBe('use_by');
    expect(parseDateKindCell('DLC')).toBe('use_by');
    expect(parseDateKindCell('MHD')).toBe('best_before');
    expect(parseDateKindCell('BBE')).toBe('best_before');
    expect(parseDateKindCell('TETT')).toBe('best_before');
    expect(parseDateKindCell('best_before')).toBe('best_before');
    expect(parseDateKindCell('internal cutoff')).toBe('internal_cutoff');
    expect(parseDateKindCell('')).toBeUndefined();
    expect(parseDateKindCell('sell by')).toBeNull();
  });
  it('money is exact minor units of the workspace currency; no currency → refused, never guessed', () => {
    expect(parseMoneyCell('1.50', 'GBP', '.')).toEqual({ ok: true, money: { minor: 150, currency: 'GBP' } });
    expect(parseMoneyCell('0.29', 'GBP', '.')).toEqual({ ok: true, money: { minor: 29, currency: 'GBP' } });
    expect(parseMoneyCell('1,05', 'EUR', ',')).toEqual({ ok: true, money: { minor: 105, currency: 'EUR' } });
    expect(parseMoneyCell('GBP 2.10', 'GBP', '.')).toEqual({ ok: true, money: { minor: 210, currency: 'GBP' } });
    expect(parseMoneyCell('1250', 'JPY', '.')).toEqual({ ok: true, money: { minor: 1250, currency: 'JPY' } });
    expect(parseMoneyCell('1.250', 'KWD', '.')).toEqual({ ok: true, money: { minor: 1250, currency: 'KWD' } });
    expect(parseMoneyCell('1.505', 'GBP', '.')).toEqual({ ok: false, error: 'tooManyDecimals' });
    expect(parseMoneyCell('1,234', 'GBP', '.')).toEqual({ ok: false, error: 'badMoney' });
    expect(parseMoneyCell('0', 'GBP', '.')).toEqual({ ok: false, error: 'moneyZero' });
    expect(parseMoneyCell('-1', 'GBP', '.')).toEqual({ ok: false, error: 'badMoney' });
    expect(parseMoneyCell('USD 1.50', 'GBP', '.')).toEqual({ ok: false, error: 'currencyMismatch' });
    expect(parseMoneyCell('$1.50', 'GBP', '.')).toEqual({ ok: false, error: 'currencyMismatch' });
    expect(parseMoneyCell('1.50', '', '.')).toEqual({ ok: false, error: 'noCurrency' });
  });
});

describe('products import', () => {
  it('imports products with categories, suppliers, unit, exact money and a default location in one go', async () => {
    const w = await ws();
    const p = await plan(w, 'products', 'Name,Barcode,Category,Supplier,Unit,Cost,Selling price,Default location\nMilk 2L,036000291452,Dairy,Acme,each,0.85,1.49,Fridge 1\nCheddar,,Dairy,,kg,7.20,,Fridge 1\n');
    expect(p.blockers).toEqual([]);
    expect(p.counts).toMatchObject({ new: 2, updated: 0, skipped: 0, errors: 0, newLocations: 1 });
    const r = await commitImport(p, 'req_1');
    expect(r.record).toMatchObject({ kind: 'products', createdCount: 2, fingerprint: p.fingerprint });
    const products = await listProducts(w.id);
    const milk = products.find(x => x.name === 'Milk 2L')!;
    expect(milk.costPerTrackingUnit).toEqual({ minor: 85, currency: 'GBP' });
    expect(milk.sellingPrice).toEqual({ minor: 149, currency: 'GBP' });
    expect(milk.barcodes[0].normalized).toBe('0036000291452');
    expect(products.find(x => x.name === 'Cheddar')!.costPerTrackingUnit).toEqual({ minor: 720, currency: 'GBP' });
    expect(products.find(x => x.name === 'Cheddar')!.sellingPrice).toBeUndefined();
    expect((await listItems(w.id, 'category')).map(c => c.name)).toEqual(['Dairy']);
    expect((await listLocations(w.id)).map(l => l.name)).toEqual(['Fridge 1']);
    expect(milk.defaultLocationId).toBe((await listLocations(w.id))[0].id);
  });
  it('a workspace without a currency refuses money columns with a clear blocker', async () => {
    const w = await ws('No currency', '');
    const p = await plan(w, 'products', 'Name,Cost\nMilk,0.85\n');
    expect(p.blockers).toContain('moneyNoCurrency');
    await expect(commitImport(p)).rejects.toMatchObject({ code: 'moneyNoCurrency' });
    expect(await listProducts(w.id)).toEqual([]);
    // Ignoring the column makes the rest importable.
    const p2 = await plan(w, 'products', 'Name,Cost\nMilk,0.85\n', { mapping: ['name', 'ignore'] });
    expect(p2.blockers).toEqual([]);
  });
  it('existing products: unchanged rows skip, differing rows are conflicts the user chooses to skip or update', async () => {
    const w = await ws();
    await saveProduct(w.id, { name: 'Milk 2L', barcodes: [{ code: '5000157024671' }], costPerTrackingUnit: { minor: 80, currency: 'GBP' } });
    const text = 'Name,Barcode,Cost\nMilk 2L,5000157024671,0.80\nMilk 2L renamed,5000157024671,0.95\n';
    const skip = await plan(w, 'products', text);
    expect(skip.counts).toMatchObject({ new: 0, updated: 0, skipped: 2, errors: 0, conflicts: 1 });
    expect(skip.issues.map(i => i.code)).toEqual(['unchanged', 'conflictSkipped']);
    const text2 = 'Name,Barcode,Cost\nMilk 2L,5000157024671,0.95\n';
    const conflict = await plan(w, 'products', text2);
    expect(conflict.counts).toMatchObject({ skipped: 1, conflicts: 1 });
    expect(conflict.issues[0]).toMatchObject({ code: 'conflictSkipped', params: { fields: 'cost' } });
    const upd = await plan(w, 'products', text2, { onExisting: 'update' });
    expect(upd.counts).toMatchObject({ updated: 1 });
    await commitImport(upd);
    expect((await listProducts(w.id))[0].costPerTrackingUnit).toEqual({ minor: 95, currency: 'GBP' });
  });
  it('rows with problems are listed with their line numbers and are not imported (T37)', async () => {
    const w = await ws();
    const p = await plan(w, 'products', 'Name,Cost,Default date kind\n,1.00,\nTea,abc,\nCoffee,1.00,sell by\nSugar,0.99,best before\n');
    expect(p.counts).toMatchObject({ new: 1, errors: 3 });
    expect(p.issues.map(i => [i.line, i.code])).toEqual([[2, 'nameRequired'], [3, 'money_badMoney'], [4, 'badDateKind']]);
    await commitImport(p);
    expect((await listProducts(w.id)).map(x => x.name)).toEqual(['Sugar']);
  });
});

describe('batches import', () => {
  const header = 'Product,Barcode,Lot,Qty,Date kind,Date,Location\n';
  it('T04 / validation: a month-only use-by is refused per row; a month-only best-before keeps month precision', async () => {
    const w = await ws();
    const p = await plan(w, 'batches', `${header}Ham,,L1,2,use by,2026-10,Fridge\nJam,,J1,1,best before,2027-03,Shelf\n`);
    expect(p.issues).toEqual([expect.objectContaining({ line: 2, severity: 'error', code: 'deadline_monthNotAllowed' })]);
    expect(p.counts).toMatchObject({ new: 1, errors: 1, newProducts: 1 });
    await commitImport(p);
    const [jam] = await listBatches(w.id);
    expect(jam).toMatchObject({ productName: 'Jam', dateKind: 'best_before', datePrecision: 'month', printedMonth: '2027-03', lotNumber: 'J1', quantityInitial: 1 });
    expect((await listProducts(w.id)).map(x => x.name)).toEqual(['Jam']);
  });
  it('T36 two batches with the same barcode but a different lot or date stay distinct (never merged)', async () => {
    const w = await ws();
    const p = await plan(w, 'batches', `${header}Milk,5000157024671,A1,6,use by,26/09/2026,Fridge\nMilk,5000157024671,A2,6,use by,26/09/2026,Fridge\nMilk,5000157024671,A1,6,use by,02/10/2026,Fridge\n`);
    expect(p.counts).toMatchObject({ new: 3, newProducts: 1, skipped: 0 });
    await commitImport(p);
    const list = await listBatches(w.id);
    expect(list).toHaveLength(3);
    expect(new Set(list.map(b => b.productId)).size).toBe(1);
    expect(list.map(b => `${b.lotNumber}:${b.printedDate}`).sort()).toEqual(['A1:2026-09-26', 'A1:2026-10-02', 'A2:2026-09-26']);
    expect((await listProducts(w.id))).toHaveLength(1);
    expect((await listLocations(w.id)).map(l => l.name)).toEqual(['Fridge']);
    // Every batch has its own "created" event and remembers the file row it came from.
    for (const b of list) {
      expect(b.importRef).toMatch(new RegExp(`^${p.fingerprint}:\\d+$`));
      expect((await listBatchEvents(w.id, b.id)).map(e => e.type)).toEqual(['created']);
    }
  });
  it('identical rows are flagged as duplicates (skipped by default, or imported as separate batches if chosen)', async () => {
    const w = await ws();
    const text = `${header}Milk,5000157024671,A1,6,use by,26/09/2026,Fridge\nMilk,5000157024671,A1,6,use by,26/09/2026,Fridge\n`;
    const skip = await plan(w, 'batches', text);
    expect(skip.counts).toMatchObject({ new: 1, skipped: 1 });
    expect(skip.issues[0]).toMatchObject({ line: 3, code: 'duplicateInFile', params: { line: 2 } });
    const both = await plan(w, 'batches', text, { onDuplicate: 'import' });
    expect(both.counts).toMatchObject({ new: 2, skipped: 0 });
    await commitImport(skip);
    // Against existing data: the same row in another file is a duplicate of the stored batch.
    const again = await plan(w, 'batches', `${header}Milk,5000157024671,A1,6,use by,26/09/2026,Fridge\nMilk,5000157024671,A3,6,use by,26/09/2026,Fridge\n`);
    expect(again.counts).toMatchObject({ new: 1, skipped: 1 });
    expect(again.issues[0]).toMatchObject({ code: 'duplicateExisting' });
  });
  it('T35 the same file imported twice does not duplicate batches (fingerprint blocks it, also inside the transaction)', async () => {
    const w = await ws();
    const text = `${header}Milk,5000157024671,A1,6,use by,26/09/2026,Fridge\n`;
    const first = await plan(w, 'batches', text);
    const stale = await plan(w, 'batches', text); // a second preview made before the first commit
    await commitImport(first, 'req_a');
    // A repeated tap with the same request returns the first result and writes nothing.
    expect((await commitImport(first, 'req_a')).repeated).toBe(true);
    await expect(commitImport(stale, 'req_b')).rejects.toMatchObject({ code: 'alreadyImported' });
    const second = await plan(w, 'batches', '﻿' + text.replace(/\n/g, '\r\n'));
    expect(second.blockers).toContain('alreadyImported');
    await expect(commitImport(second)).rejects.toMatchObject({ code: 'alreadyImported' });
    expect(await listBatches(w.id)).toHaveLength(1);
    const history = await listImportHistory(w.id);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ kind: 'batches', createdCount: 1, fileName: 'file.csv', requestId: 'req_a' });
  });
  it('matches existing products by barcode, then SKU, then name; unknown barcode without a name is an error', async () => {
    const w = await ws();
    const milk = await saveProduct(w.id, { name: 'Milk', barcodes: [{ code: '5000157024671' }], sku: 'M-1', defaultDateKind: 'use_by' });
    const p = await plan(w, 'batches', 'Barcode,SKU,Product,Date\n5000157024671,,,2026-10-01\n,M-1,,2026-10-02\n,,milk,2026-10-03\n4006381333931,,,2026-10-04\n');
    expect(p.batches.map(b => b.productId ?? b.status)).toEqual([milk.id, milk.id, milk.id, 'error']);
    expect(p.issues.every(i => i.line === 5)).toBe(true);
    expect(p.issues).toContainEqual(expect.objectContaining({ line: 5, code: 'productNotFound', value: '4006381333931' }));
    // The product's usual kind (use-by) is used when the row has none.
    expect(p.batches[0].dateKind).toBe('use_by');
  });
  it('without a date-kind column or product default, rows need the kind the user chose', async () => {
    const w = await ws();
    const text = 'Product,Date\nRice,2027-05\n';
    const none = await plan(w, 'batches', text);
    expect(none.issues[0]).toMatchObject({ code: 'dateKindMissing' });
    const chosen = await plan(w, 'batches', text, { defaultDateKind: 'best_before' });
    expect(chosen.counts.new).toBe(1);
  });
  it('T26 an injected write failure rolls the whole import back', async () => {
    const w = await ws();
    await saveProduct(w.id, { name: 'Existing' });
    const p = await plan(w, 'batches', `${header}Milk,5000157024671,A1,6,use by,26/09/2026,Fridge\nEggs,,E1,12,best before,2026-10-10,Shelf\n`);
    const snapshot = JSON.stringify(Object.entries(await AsyncStorage.multiGet(await AsyncStorage.getAllKeys() as string[])).sort());
    const multiSet = AsyncStorage.multiSet as jest.Mock;
    const original = multiSet.getMockImplementation() as any;
    multiSet.mockImplementationOnce(async (pairs: [string, string][]) => { await original(pairs.slice(0, 3)); throw new Error('disk full'); });
    try {
      await expect(commitImport(p)).rejects.toThrow('disk full');
    } finally { multiSet.mockImplementation(original); }
    expect(JSON.stringify(Object.entries(await AsyncStorage.multiGet(await AsyncStorage.getAllKeys() as string[])).sort())).toBe(snapshot);
    expect(await listImportHistory(w.id)).toEqual([]);
    // The file is not marked as imported, so it can be retried.
    await commitImport(p);
    expect(await listBatches(w.id)).toHaveLength(2);
  });
  it('a product whose barcode was taken after the preview aborts the import (nothing written)', async () => {
    const w = await ws();
    const p = await plan(w, 'batches', `${header}Milk,5000157024671,A1,6,use by,26/09/2026,\n`);
    await saveProduct(w.id, { name: 'Other milk', barcodes: [{ code: '5000157024671' }] });
    await expect(commitImport(p)).rejects.toMatchObject({ code: 'importChanged' });
    expect(await listBatches(w.id)).toEqual([]);
    expect((await listProducts(w.id)).map(x => x.name)).toEqual(['Other milk']);
  });
  it('T27 / T28 workspace isolation: the preview sees only its workspace; the same file can be imported into another one', async () => {
    const a = await ws('Shop A');
    const b = await ws('Shop B');
    await saveProduct(a.id, { name: 'Milk', barcodes: [{ code: '5000157024671' }] });
    await saveLocation(a.id, { name: 'Fridge', kind: 'fridge' });
    const text = `${header}Milk,5000157024671,A1,6,use by,26/09/2026,Fridge\n`;
    const pa = await plan(a, 'batches', text);
    expect(pa.counts).toMatchObject({ newProducts: 0, newLocations: 0 });
    await commitImport(pa);
    const pb = await plan(b, 'batches', text);
    expect(pb.blockers).toEqual([]);
    expect(pb.counts).toMatchObject({ new: 1, newProducts: 1, newLocations: 1 });
    await commitImport(pb);
    expect(await listBatches(a.id)).toHaveLength(1);
    expect(await listBatches(b.id)).toHaveLength(1);
    expect((await listBatches(b.id))[0].productId).not.toBe((await listBatches(a.id))[0].productId);
    expect(await listImportHistory(a.id)).toHaveLength(1);
    expect(await listImportHistory(b.id)).toHaveLength(1);
  });
  it('batch cost: exact for a new product; never silently changes an existing product (warning)', async () => {
    const w = await ws();
    await saveProduct(w.id, { name: 'Tea', costPerTrackingUnit: { minor: 100, currency: 'GBP' } });
    const p = await plan(w, 'batches', 'Product,Date kind,Date,Cost\nTea,best before,2027-01,1.20\nCoffee,best before,2027-01,3.05\n');
    expect(p.issues).toEqual([expect.objectContaining({ line: 2, severity: 'warning', code: 'costNotApplied' })]);
    await commitImport(p);
    const products = await listProducts(w.id);
    expect(products.find(x => x.name === 'Tea')!.costPerTrackingUnit).toEqual({ minor: 100, currency: 'GBP' });
    expect(products.find(x => x.name === 'Coffee')!.costPerTrackingUnit).toEqual({ minor: 305, currency: 'GBP' });
  });
  it('T38 planning never writes; only the confirmed commit does', async () => {
    const w = await ws();
    const before = JSON.stringify(Object.entries(await AsyncStorage.multiGet(await AsyncStorage.getAllKeys() as string[])).sort());
    const p = await plan(w, 'batches', `${header}Milk,5000157024671,A1,6,use by,26/09/2026,Fridge\n`);
    expect(p.counts.new).toBe(1);
    expect(JSON.stringify(Object.entries(await AsyncStorage.multiGet(await AsyncStorage.getAllKeys() as string[])).sort())).toBe(before);
  });
  it('handles a 5,000-row file in one transaction', async () => {
    const w = await ws();
    const lines = Array.from({ length: 5000 }, (_, i) => `Item ${i % 500},,L${i},1,best before,2027-01-${String((i % 28) + 1).padStart(2, '0')},Shelf ${i % 5}`);
    const p = await plan(w, 'batches', `${header}${lines.join('\n')}\n`);
    expect(p.counts).toMatchObject({ new: 5000, newProducts: 500, newLocations: 5, errors: 0 });
    const t0 = Date.now();
    await commitImport(p);
    expect(Date.now() - t0).toBeLessThan(20000);
    expect(await listBatches(w.id)).toHaveLength(5000);
    expect(await listProducts(w.id)).toHaveLength(500);
  }, 60000);
});
