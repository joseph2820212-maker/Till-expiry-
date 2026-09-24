/**
 * The product list. A product holds what stays the same between deliveries (name, barcodes, usual date kind,
 * typical shelf life, optional price); each date on the shelf is a separate DateBatch (dates/storage).
 * Products are archived, never deleted, so the history of their dates stays readable.
 */
import { TE_KEYS } from '../../../storage/keys';
import { readList, transact, updateList } from '../../../storage/repo';
import { notifyDataChanged } from '../../../storage/changeBus';
import { SCHEMA_VERSIONS, DATE_TYPES, type DateType, type Product, type ProductBarcode } from '../../../domain/types';
import type { Money } from '../../../domain/money';
import { ALERT_DAYS_MAX, SHELF_LIFE_MAX } from '../../../domain/expiry';
import { normalizeBarcode, type BarcodeSymbology } from '../utils/barcode';
import { makeId, nowIso } from '../utils/ids';

export const PRODUCT_LIMITS = { name: 120, sku: 40, shelfLocation: 40, category: 40 } as const;

export interface ProductDraft {
  name: string;
  barcodes?: { raw: string; symbology?: BarcodeSymbology }[];
  sku?: string;
  shelfLocation?: string;
  category?: string;
  defaultDateType?: DateType;
  shelfLifeDays?: number;
  alertDays?: number;
  price?: Money;
}

export type ProductError =
  | 'nameRequired' | 'nameTooLong' | 'skuTooLong' | 'shelfTooLong' | 'categoryTooLong'
  | 'badShelfLife' | 'badAlertDays' | 'badPrice' | 'badDateType' | 'duplicateBarcode' | 'notFound';

export class ProductValidationError extends Error {
  constructor(public readonly code: ProductError, public readonly otherProductId?: string) { super(code); this.name = 'ProductValidationError'; }
}

const len = (s?: string) => [...(s ?? '')].length;
export const cleanText = (s?: string) => (s ?? '').replace(/\s+/g, ' ').trim();

export function barcodeFormatOf(raw: string): ProductBarcode['format'] {
  if (/^\d{13}$/.test(raw)) return 'ean13';
  if (/^\d{12}$/.test(raw)) return 'upca';
  if (/^\d{8}$/.test(raw)) return 'ean8';
  if (/^[\x20-\x7E]+$/.test(raw) && !/^\d+$/.test(raw)) return 'code128';
  return 'unknown';
}

function toBarcodes(list: ProductDraft['barcodes'], existing: ProductBarcode[] = []): ProductBarcode[] {
  const out: ProductBarcode[] = [];
  for (const b of list ?? []) {
    const raw = (b.raw ?? '').trim();
    if (!raw) continue;
    // An unchanged code keeps how it was first read (e.g. a UPC-E expanded to UPC-A), so scans still match it.
    const kept = (!b.symbology || b.symbology === 'unknown') ? existing.find(x => x.raw === raw) : undefined;
    if (kept) { if (!out.some(x => x.normalized === kept.normalized)) out.push(kept); continue; }
    const normalized = normalizeBarcode(raw, b.symbology ?? 'unknown');
    if (!normalized || out.some(x => x.normalized === normalized)) continue;
    out.push({ raw, normalized, format: barcodeFormatOf(raw) });
  }
  return out;
}

const optInt = (v: unknown) => v === undefined || v === null;

export function validateDraft(d: ProductDraft): ProductError | null {
  const name = cleanText(d.name);
  if (!name) return 'nameRequired';
  if (len(name) > PRODUCT_LIMITS.name) return 'nameTooLong';
  if (len(cleanText(d.sku)) > PRODUCT_LIMITS.sku) return 'skuTooLong';
  if (len(cleanText(d.shelfLocation)) > PRODUCT_LIMITS.shelfLocation) return 'shelfTooLong';
  if (len(cleanText(d.category)) > PRODUCT_LIMITS.category) return 'categoryTooLong';
  if (!optInt(d.shelfLifeDays) && !(Number.isInteger(d.shelfLifeDays) && (d.shelfLifeDays as number) >= 1 && (d.shelfLifeDays as number) <= SHELF_LIFE_MAX)) return 'badShelfLife';
  if (!optInt(d.alertDays) && !(Number.isInteger(d.alertDays) && (d.alertDays as number) >= 0 && (d.alertDays as number) <= ALERT_DAYS_MAX)) return 'badAlertDays';
  if (d.price && (!Number.isSafeInteger(d.price.minor) || d.price.minor <= 0 || !/^[A-Z]{3}$/.test(d.price.currency))) return 'badPrice';
  if (d.defaultDateType && !DATE_TYPES.includes(d.defaultDateType)) return 'badDateType';
  return null;
}

export async function listProducts(opts: { includeArchived?: boolean } = {}): Promise<Product[]> {
  const all = await readList<Product>(TE_KEYS.products);
  return all.filter(p => p && p.id && (opts.includeArchived || p.status !== 'archived'));
}

export async function getProduct(id: string): Promise<Product | null> {
  return (await readList<Product>(TE_KEYS.products)).find(p => p.id === id) ?? null;
}

export async function findByBarcode(raw: string, symbology: BarcodeSymbology = 'unknown'): Promise<Product | null> {
  const n = normalizeBarcode(raw, symbology);
  if (!n) return null;
  return (await readList<Product>(TE_KEYS.products)).find(p => p.status !== 'archived' && p.barcodes?.some(b => b.normalized === n)) ?? null;
}

/** Products that count toward the Free limit (archived ones too: archiving is not a way around the limit). */
export async function countProductsForLimit(): Promise<number> {
  return (await listProducts({ includeArchived: true })).filter(p => !p.isSample).length;
}

/** Build the next product record from a draft (pure; shared with the importer). */
export function applyDraft(existing: Product | undefined, draft: ProductDraft, now = nowIso()): Product {
  const fields = {
    name: cleanText(draft.name),
    barcodes: toBarcodes(draft.barcodes, existing?.barcodes),
    sku: cleanText(draft.sku) || undefined,
    shelfLocation: cleanText(draft.shelfLocation) || undefined,
    category: cleanText(draft.category) || undefined,
    defaultDateType: draft.defaultDateType,
    shelfLifeDays: draft.shelfLifeDays ?? undefined,
    alertDays: draft.alertDays ?? undefined,
    price: draft.price,
  };
  if (existing) return { ...existing, ...fields, updatedAt: now };
  return { schemaVersion: SCHEMA_VERSIONS.product, id: makeId('prd'), ...fields, status: 'active', isSample: false, createdAt: now, updatedAt: now };
}

/** Refuse a barcode another active product already has (UPC-A and its EAN-13 form are the same code). */
export function assertBarcodesFree(products: Product[], product: Product): void {
  for (const b of product.barcodes) {
    const other = products.find(p => p.id !== product.id && p.status !== 'archived' && p.barcodes?.some(x => x.normalized === b.normalized));
    if (other) throw new ProductValidationError('duplicateBarcode', other.id);
  }
}

/** Create (no id) or update a product. When the name changes, open dates keep showing the new name. */
export async function saveProduct(draft: ProductDraft, id?: string): Promise<Product> {
  const err = validateDraft(draft);
  if (err) throw new ProductValidationError(err);
  const saved = await transact([TE_KEYS.products, TE_KEYS.batches], read => {
    const products = read<Product>(TE_KEYS.products);
    const existing = id ? products.find(p => p.id === id) : undefined;
    if (id && !existing) throw new ProductValidationError('notFound');
    const product = applyDraft(existing, draft);
    assertBarcodesFree(products, product);
    const nextProducts = existing ? products.map(p => (p.id === product.id ? product : p)) : [...products, product];
    const writes: Record<string, unknown> = { [TE_KEYS.products]: nextProducts };
    if (existing && existing.name !== product.name) {
      writes[TE_KEYS.batches] = read<any>(TE_KEYS.batches).map(b => (b.productId === product.id && b.status === 'open' ? { ...b, productName: product.name } : b));
    }
    return { writes, result: product };
  });
  notifyDataChanged();
  return saved;
}

export async function setArchived(id: string, archived: boolean): Promise<void> {
  await updateList<Product>(TE_KEYS.products, list => {
    if (!list.some(p => p.id === id)) throw new ProductValidationError('notFound');
    return { list: list.map(p => (p.id === id ? { ...p, status: archived ? 'archived' : 'active', updatedAt: nowIso() } : p)), result: undefined };
  });
  notifyDataChanged();
}

/** Search by name, SKU, barcode, category or shelf location (case- and accent-insensitive). */
export function searchProducts(list: Product[], query: string): Product[] {
  const q = foldText(query.trim());
  if (!q) return list;
  return list.filter(p => [p.name, p.sku, p.shelfLocation, p.category, ...(p.barcodes ?? []).map(b => b.raw)].some(v => v && foldText(v).includes(q)));
}

export function foldText(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase();
}
