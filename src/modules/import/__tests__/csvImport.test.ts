import AsyncStorage from '@react-native-async-storage/async-storage';
import { commitImport, guessMapping, ImportChangedError, parseDateType, planImport } from '../csvImport';
import { listBatches } from '../../dates/storage/batchStore';
import { listProducts, saveProduct } from '../../products/storage/productStore';
import { detectDelimiter, parseCsv } from '../../products/utils/csvParse';

beforeEach(() => { (AsyncStorage as any).clear(); });
const rowsOf = (text: string) => parseCsv(text, detectDelimiter(text));

describe('column guessing', () => {
  it('recognises headers in the six languages and uses each field once', () => {
    expect(guessMapping(['Product name', 'EAN', 'Expiry date', 'Qty', 'Shelf'])).toEqual(['name', 'barcode', 'date', 'quantity', 'location']);
    expect(guessMapping(['Nom', 'Code-barres', 'DLC', 'Quantité'])).toEqual(['name', 'barcode', 'date', 'quantity']);
    expect(guessMapping(['Artikel', 'Strichcode', 'MHD', 'Menge', 'Regal'])).toEqual(['name', 'barcode', 'date', 'quantity', 'location']);
    expect(guessMapping(['Ürün adı', 'Barkod', 'SKT', 'Adet'])).toEqual(['name', 'barcode', 'date', 'quantity']);
    expect(guessMapping(['Producto', 'Código de barras', 'Fecha de caducidad', 'Cantidad'])).toEqual(['name', 'barcode', 'date', 'quantity']);
    expect(guessMapping(['اسم المنتج', 'الباركود', 'تاريخ الانتهاء', 'الكمية'])).toEqual(['name', 'barcode', 'date', 'quantity']);
    expect(guessMapping(['name', 'name', 'price'])).toEqual(['name', 'ignore', 'ignore']);
  });
  it('reads date-kind words, falling back to the default', () => {
    expect(parseDateType('Use by', 'bestBefore')).toBe('useBy');
    expect(parseDateType('BBE', 'useBy')).toBe('bestBefore');
    expect(parseDateType('DLC', 'bestBefore')).toBe('useBy');
    expect(parseDateType('MHD', 'useBy')).toBe('bestBefore');
    expect(parseDateType('display until', 'useBy')).toBe('displayUntil');
    expect(parseDateType('whatever', 'sellBy')).toBe('sellBy');
    expect(parseDateType('', 'useBy')).toBe('useBy');
  });
});

describe('plan and commit', () => {
  const csv = [
    'name;barcode;date;type;qty;shelf',
    'Milk 2L;5000157024671;03/10/2026;use by;6;Chiller 1',
    'Milk 2L;5000157024671;05/10/2026;use by;4;Chiller 1',
    'Bread;;25/09/2026;BBE;;Bakery',
    ';;01/10/2026;;;',
    'Cheese;;31/02/2026;;2;',
    'Ham;;04/10/2026;;two;',
    'Existing;;;;;',
  ].join('\n');

  it('never guesses the date order: dmy and mdy give different dates; ambiguous ones are counted', async () => {
    const rows = rowsOf(csv);
    const mapping = guessMapping(rows[0]);
    expect(mapping).toEqual(['name', 'barcode', 'date', 'dateType', 'quantity', 'location']);
    const dmy = planImport(rows, mapping, true, 'dmy', [], 'bestBefore');
    const mdy = planImport(rows, mapping, true, 'mdy', [], 'bestBefore');
    expect(dmy.rows[0].date?.date).toBe('2026-10-03');
    expect(mdy.rows[0].date?.date).toBe('2026-03-10');
    expect(dmy.counts.ambiguousDates).toBe(2);
  });

  it('counts new / existing / dates / skipped and explains each skipped row', async () => {
    await saveProduct({ name: 'Existing' });
    const products = await listProducts({ includeArchived: true });
    const rows = rowsOf(csv);
    const plan = planImport(rows, guessMapping(rows[0]), true, 'dmy', products, 'bestBefore');
    expect(plan.counts).toEqual({ newProducts: 2, matchedProducts: 1, dates: 3, invalid: 3, ambiguousDates: 2, overLimit: 0 });
    expect(plan.rows.filter(r => r.problem).map(r => [r.line, r.problem])).toEqual([[5, 'noName'], [6, 'badDate'], [7, 'badQuantity']]);
    expect(plan.rows[2].date).toMatchObject({ dateType: 'bestBefore', location: 'Bakery' });

    const r = await commitImport(plan);
    expect(r).toEqual({ products: 2, dates: 3 });
    const all = await listProducts();
    expect(all.map(p => p.name).sort()).toEqual(['Bread', 'Existing', 'Milk 2L']);
    const milk = all.find(p => p.name === 'Milk 2L')!;
    expect(milk.barcodes[0].raw).toBe('5000157024671');
    expect(milk.shelfLocation).toBe('Chiller 1');
    const dates = await listBatches();
    expect(dates.filter(d => d.productId === milk.id).map(d => [d.date, d.quantity, d.dateType])).toEqual([['2026-10-03', 6, 'useBy'], ['2026-10-05', 4, 'useBy']]);
  });

  it('matches by barcode first and tops up the same open date when the file is imported twice', async () => {
    const text = 'name,barcode,date,qty\nWhatever,5000157024671,2026-10-03,2\n';
    const rows = rowsOf(text);
    const first = planImport(rows, guessMapping(rows[0]), true, 'ymd', [], 'useBy');
    await commitImport(first);
    const products = await listProducts({ includeArchived: true });
    const second = planImport(rows, guessMapping(rows[0]), true, 'ymd', products, 'useBy');
    expect(second.counts).toMatchObject({ newProducts: 0, matchedProducts: 1, dates: 1 });
    await commitImport(second);
    const dates = await listBatches();
    expect(dates).toHaveLength(1);
    expect(dates[0].quantity).toBe(4);
  });

  it('refuses the commit when the product list changed after the preview; nothing is written', async () => {
    const rows = rowsOf('name,date\nTea,2026-12-01\n');
    const plan = planImport(rows, guessMapping(rows[0]), true, 'ymd', [], 'useBy');
    await saveProduct({ name: 'Someone else added this' });
    await expect(commitImport(plan)).rejects.toBeInstanceOf(ImportChangedError);
    expect(await listBatches()).toEqual([]);
  });

  it('two different names with one barcode in the file: the second is refused, never merged', () => {
    const rows = rowsOf('name,barcode\nCola,5000112637922\nLemonade,5000112637922\n');
    const plan = planImport(rows, guessMapping(rows[0]), true, 'ymd', [], 'useBy');
    expect(plan.rows.map(r => r.problem)).toEqual([undefined, 'barcodeConflict']);
    expect(plan.counts.newProducts).toBe(1);
  });

  it('rows beyond the row limit are counted, never silently dropped', () => {
    const rows = [['name'], ...Array.from({ length: 5003 }, (_, i) => [`P${i}`])];
    const plan = planImport(rows, ['name'], true, 'ymd', [], 'useBy');
    expect(plan.counts).toMatchObject({ newProducts: 5000, overLimit: 3 });
  });

  it('a file of products only (no date column) creates products and no dates', async () => {
    const rows = rowsOf('Product,SKU,Shelf life days\nCrisps,CR-1,90\nNuts,NU-1,abc\n');
    const plan = planImport(rows, guessMapping(rows[0]), true, 'ymd', [], 'useBy');
    expect(plan.counts).toMatchObject({ newProducts: 1, dates: 0, invalid: 1 });
    await commitImport(plan);
    expect((await listProducts())[0]).toMatchObject({ name: 'Crisps', sku: 'CR-1', shelfLifeDays: 90 });
  });
});
