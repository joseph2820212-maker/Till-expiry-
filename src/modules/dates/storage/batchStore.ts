/**
 * Dates on the shelf. Each DateBatch is one product with one date; what happens to it is appended as events, so
 * the shelf list, the history and the waste report come from the same records. Every write is one transaction
 * (products + batches when a product is created with its first date) and a failed write changes nothing.
 */
import { TE_KEYS } from '../../../storage/keys';
import { readList, transact } from '../../../storage/repo';
import { notifyDataChanged } from '../../../storage/changeBus';
import { DATE_TYPES, REMOVAL_KINDS, SCHEMA_VERSIONS, type BatchEvent, type BatchEventKind, type DateBatch, type DateType, type LocalDate, type Product, type WasteReason } from '../../../domain/types';
import type { Money } from '../../../domain/money';
import { isLocalDate, todayLocal } from '../../../domain/dates';
import { remainingQuantity, removedQuantity } from '../../../domain/expiry';
import { applyDraft, assertBarcodesFree, cleanText, ProductValidationError, validateDraft, type ProductDraft } from '../../products/storage/productStore';
import { makeId, nowIso } from '../../products/utils/ids';

export const BATCH_LIMITS = { quantity: 99_999, location: 40, note: 200 } as const;

export type BatchErrorCode =
  | 'productRequired' | 'productNotFound' | 'badDate' | 'badDateType' | 'badQuantity' | 'locationTooLong' | 'noteTooLong'
  | 'notFound' | 'closed' | 'quantityTooHigh' | 'quantityBelowRemoved' | 'priceRequired' | 'nothingToUndo';

export class BatchValidationError extends Error {
  constructor(public readonly code: BatchErrorCode) { super(code); this.name = 'BatchError'; }
}

export interface DateDraft {
  date: LocalDate;
  dateType: DateType;
  quantity?: number;
  location?: string;
  note?: string;
}

const len = (s?: string) => [...(s ?? '')].length;
const validQty = (q: unknown) => q === undefined || (Number.isInteger(q) && (q as number) >= 1 && (q as number) <= BATCH_LIMITS.quantity);

export function validateDateDraft(d: DateDraft): BatchErrorCode | null {
  if (!isLocalDate(d.date)) return 'badDate';
  if (!DATE_TYPES.includes(d.dateType)) return 'badDateType';
  if (!validQty(d.quantity)) return 'badQuantity';
  if (len(cleanText(d.location)) > BATCH_LIMITS.location) return 'locationTooLong';
  if (len(cleanText(d.note)) > BATCH_LIMITS.note) return 'noteTooLong';
  return null;
}

export async function listBatches(opts: { status?: DateBatch['status'] } = {}): Promise<DateBatch[]> {
  const all = await readList<DateBatch>(TE_KEYS.batches);
  return all.filter(b => b && b.id && isLocalDate(b.date) && Array.isArray(b.events) && (!opts.status || b.status === opts.status));
}

export async function getBatch(id: string): Promise<DateBatch | null> {
  return (await listBatches()).find(b => b.id === id) ?? null;
}

export interface AddDateResult { batch: DateBatch; product: Product; merged: boolean; createdProduct: boolean }

/**
 * Add a date for an existing product (`productId`) or for a new one (`newProduct`, created in the same
 * transaction). The same product with the same date and date kind already open is topped up instead of
 * duplicated (quantities add; if either was not counted the result is not counted).
 */
export async function addDate(input: { productId?: string; newProduct?: ProductDraft } & DateDraft): Promise<AddDateResult> {
  const err = validateDateDraft(input);
  if (err) throw new BatchValidationError(err);
  if (!input.productId && !input.newProduct) throw new BatchValidationError('productRequired');
  if (input.newProduct) {
    const perr = validateDraft(input.newProduct);
    if (perr) throw new ProductValidationError(perr);
  }
  const result = await transact([TE_KEYS.products, TE_KEYS.batches], read => {
    let products = read<Product>(TE_KEYS.products);
    const batches = read<DateBatch>(TE_KEYS.batches);
    let product: Product | undefined;
    let createdProduct = false;
    if (input.productId) {
      product = products.find(p => p.id === input.productId);
      if (!product) throw new BatchValidationError('productNotFound');
    } else {
      product = applyDraft(undefined, input.newProduct as ProductDraft);
      assertBarcodesFree(products, product);
      products = [...products, product];
      createdProduct = true;
    }
    const now = nowIso();
    const same = batches.find(b => b.status === 'open' && b.productId === product!.id && b.date === input.date && b.dateType === input.dateType);
    if (same) {
      const quantity = same.quantity != null && input.quantity != null ? same.quantity + input.quantity : undefined;
      if (quantity != null && quantity > BATCH_LIMITS.quantity) throw new BatchValidationError('badQuantity');
      const merged: DateBatch = { ...same, quantity, location: cleanText(input.location) || same.location, note: cleanText(input.note) || same.note, updatedAt: now };
      return { writes: { [TE_KEYS.products]: products, [TE_KEYS.batches]: batches.map(b => (b.id === same.id ? merged : b)) }, result: { batch: merged, product: product!, merged: true, createdProduct } };
    }
    const batch: DateBatch = {
      schemaVersion: SCHEMA_VERSIONS.batch, id: makeId('dt'), productId: product.id, productName: product.name,
      date: input.date, dateType: input.dateType, quantity: input.quantity, location: cleanText(input.location) || undefined, note: cleanText(input.note) || undefined,
      status: 'open', events: [], createdAt: now, updatedAt: now,
    };
    return { writes: { [TE_KEYS.products]: products, [TE_KEYS.batches]: [...batches, batch] }, result: { batch, product: product!, merged: false, createdProduct } };
  });
  notifyDataChanged();
  return result;
}

async function mutateBatch<R>(id: string, fn: (b: DateBatch) => { batch: DateBatch | null; result: R }): Promise<R> {
  const r = await transact([TE_KEYS.batches], read => {
    const batches = read<DateBatch>(TE_KEYS.batches);
    const b = batches.find(x => x.id === id);
    if (!b) throw new BatchValidationError('notFound');
    const out = fn(b);
    const next = out.batch ? batches.map(x => (x.id === id ? out.batch as DateBatch : x)) : batches.filter(x => x.id !== id);
    return { writes: { [TE_KEYS.batches]: next }, result: out.result };
  });
  notifyDataChanged();
  return r;
}

/** Correct the date, kind, count, place or note of an open date. The count can never drop below what already left the shelf. */
export async function editBatch(id: string, draft: DateDraft): Promise<DateBatch> {
  const err = validateDateDraft(draft);
  if (err) throw new BatchValidationError(err);
  return mutateBatch(id, b => {
    if (b.status !== 'open') throw new BatchValidationError('closed');
    if (draft.quantity != null && draft.quantity < removedQuantity(b)) throw new BatchValidationError('quantityBelowRemoved');
    const next: DateBatch = { ...b, date: draft.date, dateType: draft.dateType, quantity: draft.quantity, location: cleanText(draft.location) || undefined, note: cleanText(draft.note) || undefined, updatedAt: nowIso() };
    return { batch: next, result: next };
  });
}

export interface EventInput {
  kind: BatchEventKind;
  /** Removal kinds: units that left. Omitted = everything that was left. */
  quantity?: number;
  /** Reduced: the new price. */
  price?: Money;
  reason?: WasteReason;
  note?: string;
}

/**
 * Record what happened. `checked` and `reduced` keep the date open; a removal (sold, wasted, returned, donated)
 * without a quantity, or one that takes the counted stock to zero, closes it. Checking twice on the same day
 * records one check.
 */
export async function recordEvent(id: string, input: EventInput, today: LocalDate = todayLocal()): Promise<DateBatch> {
  return mutateBatch(id, b => {
    if (b.status !== 'open') throw new BatchValidationError('closed');
    const now = nowIso();
    const ev: BatchEvent = { id: makeId('ev'), kind: input.kind, on: today, at: now };
    if (cleanText(input.note)) ev.note = cleanText(input.note).slice(0, BATCH_LIMITS.note);
    let close = false;
    if (input.kind === 'checked') {
      if (b.events.some(e => e.kind === 'checked' && e.on === today)) return { batch: b, result: b };
    } else if (input.kind === 'reduced') {
      if (!input.price || !Number.isSafeInteger(input.price.minor) || input.price.minor <= 0) throw new BatchValidationError('priceRequired');
      ev.price = input.price;
    } else if (REMOVAL_KINDS.includes(input.kind)) {
      const left = remainingQuantity(b);
      if (input.quantity != null) {
        if (!validQty(input.quantity)) throw new BatchValidationError('badQuantity');
        if (left != null && input.quantity > left) throw new BatchValidationError('quantityTooHigh');
        ev.quantity = input.quantity;
        close = left != null && input.quantity === left;
      } else {
        if (left != null) ev.quantity = left;
        close = true;
      }
      if (input.kind === 'wasted') ev.reason = input.reason ?? 'expired';
    }
    const next: DateBatch = { ...b, events: [...b.events, ev], status: close ? 'closed' : 'open', updatedAt: now, ...(close ? { closedAt: now } : {}) };
    return { batch: next, result: next };
  });
}

/** Mark several open dates as checked today (the date check "all still fine" action). */
export async function checkMany(ids: string[], today: LocalDate = todayLocal()): Promise<number> {
  if (!ids.length) return 0;
  const r = await transact([TE_KEYS.batches], read => {
    const want = new Set(ids);
    let n = 0;
    const now = nowIso();
    const next = read<DateBatch>(TE_KEYS.batches).map(b => {
      if (!want.has(b.id) || b.status !== 'open' || b.events.some(e => e.kind === 'checked' && e.on === today)) return b;
      n++;
      return { ...b, events: [...b.events, { id: makeId('ev'), kind: 'checked' as const, on: today, at: now }], updatedAt: now };
    });
    return { writes: { [TE_KEYS.batches]: next }, result: n };
  });
  notifyDataChanged();
  return r;
}

/** Take back the last action on a date (e.g. "wasted" pressed by mistake). A closed date opens again. */
export async function undoLastEvent(id: string): Promise<DateBatch> {
  return mutateBatch(id, b => {
    if (!b.events.length) throw new BatchValidationError('nothingToUndo');
    const next: DateBatch = { ...b, events: b.events.slice(0, -1), status: 'open', closedAt: undefined, updatedAt: nowIso() };
    return { batch: next, result: next };
  });
}

/** Remove a date that was entered by mistake. It leaves no history (use a removal event for real stock). */
export async function deleteBatch(id: string): Promise<void> {
  await mutateBatch(id, () => ({ batch: null, result: undefined }));
}

/** Dates of one product, open first (soonest first), then history (newest first). */
export async function batchesForProduct(productId: string): Promise<DateBatch[]> {
  const list = (await listBatches()).filter(b => b.productId === productId);
  const open = list.filter(b => b.status === 'open').sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const closed = list.filter(b => b.status === 'closed').sort((a, b) => ((b.closedAt ?? b.updatedAt) < (a.closedAt ?? a.updatedAt) ? -1 : 1));
  return [...open, ...closed];
}
