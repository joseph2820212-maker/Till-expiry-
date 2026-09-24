import AsyncStorage from '@react-native-async-storage/async-storage';
import { TE_KEYS } from '../../../storage/keys';
import { onDataChanged } from '../../../storage/changeBus';
import { moneyFromMinor } from '../../../domain/money';
import { addDate, batchesForProduct, BatchValidationError, checkMany, deleteBatch, editBatch, getBatch, listBatches, recordEvent, undoLastEvent } from '../storage/batchStore';
import { countProductsForLimit, findByBarcode, listProducts, ProductValidationError, saveProduct, searchProducts, setArchived, validateDraft } from '../../products/storage/productStore';

const TODAY = '2026-09-24';
beforeEach(() => { (AsyncStorage as any).clear(); });

describe('products', () => {
  it('validates names, shelf life, warning days and prices', () => {
    expect(validateDraft({ name: '  ' })).toBe('nameRequired');
    expect(validateDraft({ name: 'x'.repeat(121) })).toBe('nameTooLong');
    expect(validateDraft({ name: 'Milk', shelfLifeDays: 0 })).toBe('badShelfLife');
    expect(validateDraft({ name: 'Milk', shelfLifeDays: 2.5 })).toBe('badShelfLife');
    expect(validateDraft({ name: 'Milk', alertDays: 61 })).toBe('badAlertDays');
    expect(validateDraft({ name: 'Milk', alertDays: 0 })).toBeNull();
    expect(validateDraft({ name: 'Milk', price: { minor: 0, currency: 'EUR', exponent: 2 } })).toBe('badPrice');
    expect(validateDraft({ name: 'Milk', price: { minor: 100, currency: '', exponent: 2 } })).toBe('badPrice');
    expect(validateDraft({ name: 'Milk', defaultDateType: 'eatBy' as any })).toBe('badDateType');
  });
  it('refuses a barcode another active product has (UPC-A = EAN-13) and finds by either form', async () => {
    const a = await saveProduct({ name: 'Cola', barcodes: [{ raw: '036000291452' }] });
    await expect(saveProduct({ name: 'Other', barcodes: [{ raw: '0036000291452' }] })).rejects.toMatchObject({ code: 'duplicateBarcode', otherProductId: a.id });
    expect((await findByBarcode('0036000291452'))?.id).toBe(a.id);
    await setArchived(a.id, true);
    expect(await findByBarcode('036000291452')).toBeNull();
    expect((await listProducts()).length).toBe(0);
    expect(await countProductsForLimit()).toBe(1); // archiving is not a way around the limit
  });
  it('search folds case and accents and looks at codes and places', async () => {
    await saveProduct({ name: 'Crème fraîche', shelfLocation: 'Chiller 2', sku: 'CF-1', barcodes: [{ raw: '5012345678900' }] });
    const all = await listProducts();
    for (const q of ['creme', 'CHILLER', 'cf-1', '50123']) expect(searchProducts(all, q)).toHaveLength(1);
    expect(searchProducts(all, 'yoghurt')).toHaveLength(0);
  });
  it('a renamed product renames its OPEN dates only; history keeps the old name', async () => {
    const r = await addDate({ newProduct: { name: 'Old name' }, date: TODAY, dateType: 'useBy', quantity: 2 });
    const done = await addDate({ productId: r.product.id, date: '2026-09-01', dateType: 'useBy' });
    await recordEvent(done.batch.id, { kind: 'sold' }, TODAY);
    await saveProduct({ name: 'New name' }, r.product.id);
    const list = await batchesForProduct(r.product.id);
    expect(list.map(b => [b.status, b.productName])).toEqual([['open', 'New name'], ['closed', 'Old name']]);
  });
});

describe('dates', () => {
  it('adds a date with a new product in one transaction and signals a change', async () => {
    const seen = jest.fn();
    const off = onDataChanged(seen);
    const r = await addDate({ newProduct: { name: 'Milk 2L', barcodes: [{ raw: '5000157024671', symbology: 'ean13' }] }, date: '2026-09-26', dateType: 'useBy', quantity: 6, location: ' Chiller  1 ' });
    off();
    expect(r.createdProduct).toBe(true);
    expect(r.batch).toMatchObject({ productName: 'Milk 2L', date: '2026-09-26', quantity: 6, location: 'Chiller 1', status: 'open', events: [] });
    expect(seen).toHaveBeenCalled();
    expect((await findByBarcode('5000157024671'))?.id).toBe(r.product.id);
  });
  it('the same product + date + kind tops up instead of duplicating; uncounted stays uncounted', async () => {
    const r = await addDate({ newProduct: { name: 'Bread' }, date: TODAY, dateType: 'bestBefore', quantity: 3 });
    const again = await addDate({ productId: r.product.id, date: TODAY, dateType: 'bestBefore', quantity: 2 });
    expect(again.merged).toBe(true);
    expect(again.batch.quantity).toBe(5);
    const other = await addDate({ productId: r.product.id, date: TODAY, dateType: 'useBy', quantity: 1 });
    expect(other.merged).toBe(false);
    const uncounted = await addDate({ productId: r.product.id, date: TODAY, dateType: 'bestBefore' });
    expect(uncounted.batch.quantity).toBeUndefined();
    expect((await listBatches()).length).toBe(2);
  });
  it('rejects bad input without writing', async () => {
    await expect(addDate({ newProduct: { name: 'X' }, date: '2026-02-30', dateType: 'useBy' })).rejects.toMatchObject({ code: 'badDate' });
    await expect(addDate({ newProduct: { name: 'X' }, date: TODAY, dateType: 'useBy', quantity: 0 })).rejects.toMatchObject({ code: 'badQuantity' });
    await expect(addDate({ date: TODAY, dateType: 'useBy' })).rejects.toMatchObject({ code: 'productRequired' });
    await expect(addDate({ productId: 'nope', date: TODAY, dateType: 'useBy' })).rejects.toMatchObject({ code: 'productNotFound' });
    await expect(addDate({ newProduct: { name: '' }, date: TODAY, dateType: 'useBy' })).rejects.toBeInstanceOf(ProductValidationError);
    expect(await AsyncStorage.getItem(TE_KEYS.batches)).toBeNull();
    expect(await AsyncStorage.getItem(TE_KEYS.products)).toBeNull();
  });
  it('a failed write rolls both lists back', async () => {
    await addDate({ newProduct: { name: 'First' }, date: TODAY, dateType: 'useBy' });
    const before = [await AsyncStorage.getItem(TE_KEYS.products), await AsyncStorage.getItem(TE_KEYS.batches)];
    const setItem = AsyncStorage.setItem as jest.Mock;
    const original = setItem.getMockImplementation() as (k: string, v: string) => Promise<void>;
    setItem.mockImplementation(async (k: string, v: string) => { if (k === TE_KEYS.batches) throw new Error('disk full'); return original(k, v); });
    try {
      await expect(addDate({ newProduct: { name: 'Second' }, date: TODAY, dateType: 'useBy' })).rejects.toThrow('disk full');
    } finally { setItem.mockImplementation(original); }
    expect([await AsyncStorage.getItem(TE_KEYS.products), await AsyncStorage.getItem(TE_KEYS.batches)]).toEqual(before);
  });
  it('removals: partial keeps it open, the rest closes it, too many is refused; checks happen once a day', async () => {
    const { batch } = await addDate({ newProduct: { name: 'Yoghurt' }, date: TODAY, dateType: 'useBy', quantity: 6 });
    await recordEvent(batch.id, { kind: 'checked' }, TODAY);
    await recordEvent(batch.id, { kind: 'checked' }, TODAY);
    let b = await recordEvent(batch.id, { kind: 'reduced', price: moneyFromMinor(50, 'EUR') }, TODAY);
    expect(b.events.map(e => e.kind)).toEqual(['checked', 'reduced']);
    b = await recordEvent(batch.id, { kind: 'sold', quantity: 4 }, TODAY);
    expect(b.status).toBe('open');
    await expect(recordEvent(batch.id, { kind: 'wasted', quantity: 3 }, TODAY)).rejects.toMatchObject({ code: 'quantityTooHigh' });
    b = await recordEvent(batch.id, { kind: 'wasted' }, TODAY);
    expect(b.status).toBe('closed');
    expect(b.events[b.events.length - 1]).toMatchObject({ kind: 'wasted', quantity: 2, reason: 'expired' });
    await expect(recordEvent(batch.id, { kind: 'checked' }, TODAY)).rejects.toMatchObject({ code: 'closed' });
    await expect(editBatch(batch.id, { date: TODAY, dateType: 'useBy' })).rejects.toMatchObject({ code: 'closed' });
  });
  it('a reduction needs a real price', async () => {
    const { batch } = await addDate({ newProduct: { name: 'Ham' }, date: TODAY, dateType: 'useBy' });
    await expect(recordEvent(batch.id, { kind: 'reduced' }, TODAY)).rejects.toBeInstanceOf(BatchValidationError);
    await expect(recordEvent(batch.id, { kind: 'reduced', price: { minor: 0, currency: 'EUR', exponent: 2 } }, TODAY)).rejects.toMatchObject({ code: 'priceRequired' });
  });
  it('an uncounted date closes on a removal without a number and stays open with one', async () => {
    const { batch } = await addDate({ newProduct: { name: 'Salad' }, date: TODAY, dateType: 'useBy' });
    let b = await recordEvent(batch.id, { kind: 'donated', quantity: 2 }, TODAY);
    expect(b.status).toBe('open');
    b = await recordEvent(batch.id, { kind: 'donated' }, TODAY);
    expect(b.status).toBe('closed');
    expect(b.events[1].quantity).toBeUndefined();
  });
  it('undo takes back the last action and reopens; delete removes the entry entirely', async () => {
    const { batch } = await addDate({ newProduct: { name: 'Cheese' }, date: TODAY, dateType: 'useBy', quantity: 2 });
    await expect(undoLastEvent(batch.id)).rejects.toMatchObject({ code: 'nothingToUndo' });
    await recordEvent(batch.id, { kind: 'sold' }, TODAY);
    const b = await undoLastEvent(batch.id);
    expect(b.status).toBe('open');
    expect(b.events).toEqual([]);
    expect(b.closedAt).toBeUndefined();
    await deleteBatch(batch.id);
    expect(await getBatch(batch.id)).toBeNull();
    await expect(deleteBatch(batch.id)).rejects.toMatchObject({ code: 'notFound' });
  });
  it('editing cannot drop the count below what already left', async () => {
    const { batch } = await addDate({ newProduct: { name: 'Eggs' }, date: TODAY, dateType: 'bestBefore', quantity: 12 });
    await recordEvent(batch.id, { kind: 'sold', quantity: 5 }, TODAY);
    await expect(editBatch(batch.id, { date: TODAY, dateType: 'bestBefore', quantity: 4 })).rejects.toMatchObject({ code: 'quantityBelowRemoved' });
    const b = await editBatch(batch.id, { date: '2026-09-30', dateType: 'bestBefore', quantity: 10, note: ' check box ' });
    expect(b).toMatchObject({ date: '2026-09-30', quantity: 10, note: 'check box' });
  });
  it('check many ticks open dates once and skips closed ones', async () => {
    const a = await addDate({ newProduct: { name: 'A' }, date: TODAY, dateType: 'useBy' });
    const c = await addDate({ newProduct: { name: 'C' }, date: TODAY, dateType: 'useBy' });
    await recordEvent(c.batch.id, { kind: 'sold' }, TODAY);
    expect(await checkMany([a.batch.id, c.batch.id], TODAY)).toBe(1);
    expect(await checkMany([a.batch.id], TODAY)).toBe(0);
    expect(await checkMany([], TODAY)).toBe(0);
  });
  it('corrupt stored rows are ignored when listing', async () => {
    await AsyncStorage.setItem(TE_KEYS.batches, JSON.stringify([{ id: 'bad' }, { id: 'ok', date: TODAY, events: [], status: 'open' }, null]));
    expect((await listBatches()).map(b => b.id)).toEqual(['ok']);
  });
});
