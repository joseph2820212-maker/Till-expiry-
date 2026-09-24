/**
 * Products (§7.2). A product holds what stays the same; every dated quantity is a separate Batch. Barcode matching
 * treats UPC-A and its EAN-13 form as one code (family rule from TillCalc's barcode utils). Products are hidden,
 * never deleted, so batch history stays readable. Unknown cost / price stay undefined, never 0.
 */
import type { MoneyValue, Product, ProductBarcode, TrackingUnit, BarcodeRole, DateKind } from '../../domain/expiry/expiryTypes';
import { DATE_KINDS, TRACKING_UNITS } from '../../domain/expiry/expiryTypes';
import { K } from '../../storage/keys';
import { listRecords, newId, nowIso, readRecord, runTxn, type Txn } from '../../storage/entityStore';
import { DomainError, cleanText, foldText, mustGet, optText, putRecord } from '../../storage/repoHelpers';
import { notifyDataChanged } from '../../storage/changeBus';
import { normalizeBarcode, type BarcodeSymbology } from './utils/barcode';

export const PRODUCT_LIMITS = { name: 120, sku: 40, notes: 300, customUnit: 20 } as const;

export interface ProductDraft {
  name: string;
  sku?: string;
  barcodes?: { code: string; symbology?: string; role?: BarcodeRole; unitCount?: number }[];
  categoryId?: string;
  supplierId?: string;
  trackingUnit?: TrackingUnit;
  customUnitLabel?: string;
  costPerTrackingUnit?: MoneyValue;
  sellingPrice?: MoneyValue;
  defaultLocationId?: string;
  defaultRuleId?: string;
  defaultDateKind?: DateKind;
  isPrepared?: boolean;
  notes?: string;
}

function validMoney(m: MoneyValue | undefined): boolean {
  return !m || (Number.isSafeInteger(m.minor) && m.minor > 0 && /^[A-Z]{3}$/.test(m.currency));
}

function toBarcodes(list: ProductDraft['barcodes'], existing: ProductBarcode[] = []): ProductBarcode[] {
  const out: ProductBarcode[] = [];
  for (const b of list ?? []) {
    const code = (b.code ?? '').trim();
    if (!code) continue;
    const kept = !b.symbology ? existing.find(x => x.code === code) : undefined;
    const normalized = kept?.normalized ?? normalizeBarcode(code, (b.symbology as BarcodeSymbology) ?? 'unknown');
    if (!normalized || out.some(x => x.normalized === normalized)) continue;
    const role: BarcodeRole = b.role ?? kept?.role ?? 'single';
    if (!['single', 'pack', 'case'].includes(role)) throw new DomainError('badBarcodeRole');
    if (b.unitCount != null && !(Number.isInteger(b.unitCount) && b.unitCount >= 1 && b.unitCount <= 10000)) throw new DomainError('badUnitCount');
    out.push({ code, normalized, symbology: b.symbology ?? kept?.symbology, role, unitCount: b.unitCount ?? kept?.unitCount });
  }
  return out;
}

export function buildProduct(workspaceId: string, d: ProductDraft, existing?: Product, now = nowIso()): Product {
  const name = cleanText(d.name);
  if (!name) throw new DomainError('nameRequired');
  if ([...name].length > PRODUCT_LIMITS.name) throw new DomainError('textTooLong');
  const trackingUnit = d.trackingUnit ?? existing?.trackingUnit ?? 'each';
  if (!TRACKING_UNITS.includes(trackingUnit)) throw new DomainError('badUnit');
  if (trackingUnit === 'custom' && !cleanText(d.customUnitLabel)) throw new DomainError('customUnitRequired');
  if (!validMoney(d.costPerTrackingUnit) || !validMoney(d.sellingPrice)) throw new DomainError('badMoney');
  if (d.defaultDateKind && !DATE_KINDS.includes(d.defaultDateKind)) throw new DomainError('badDateKind');
  const fields = {
    name,
    sku: optText(d.sku, PRODUCT_LIMITS.sku),
    barcodes: toBarcodes(d.barcodes, existing?.barcodes),
    categoryId: d.categoryId || undefined,
    supplierId: d.supplierId || undefined,
    trackingUnit,
    customUnitLabel: trackingUnit === 'custom' ? optText(d.customUnitLabel, PRODUCT_LIMITS.customUnit) : undefined,
    costPerTrackingUnit: d.costPerTrackingUnit,
    sellingPrice: d.sellingPrice,
    defaultLocationId: d.defaultLocationId || undefined,
    defaultRuleId: d.defaultRuleId || undefined,
    defaultDateKind: d.defaultDateKind,
    isPrepared: d.isPrepared || undefined,
    notes: optText(d.notes, PRODUCT_LIMITS.notes),
  };
  if (existing) return { ...existing, ...fields, updatedAt: now };
  return { id: newId('prd'), workspaceId, ...fields, status: 'active', createdAt: now, updatedAt: now, schemaVersion: 1 };
}

/** Inside a transaction: refuse a barcode another active product of the same workspace already has. */
export async function assertBarcodesFree(tx: Txn, p: Product): Promise<void> {
  if (!p.barcodes.length) return;
  const ids = await tx.getIndex(K.index('products', p.workspaceId));
  for (const id of ids) {
    if (id === p.id) continue;
    const other = await tx.get<Product>(K.item('products', id));
    if (!other || other.status !== 'active') continue;
    if (other.barcodes.some(b => p.barcodes.some(x => x.normalized === b.normalized))) throw new DomainError('duplicateBarcode', other.id);
  }
}

export async function createProductTx(tx: Txn, workspaceId: string, d: ProductDraft): Promise<Product> {
  const p = buildProduct(workspaceId, d);
  await assertBarcodesFree(tx, p);
  await putRecord(tx, 'products', p);
  return p;
}

export async function saveProduct(workspaceId: string, d: ProductDraft, id?: string): Promise<Product> {
  const p = await runTxn(async tx => {
    if (!id) return createProductTx(tx, workspaceId, d);
    const existing = await mustGet<Product>(tx, 'products', id, workspaceId);
    const next = buildProduct(workspaceId, d, existing);
    await assertBarcodesFree(tx, next);
    tx.set(K.item('products', id), next);
    return next;
  });
  notifyDataChanged();
  return p;
}

export async function setProductHidden(workspaceId: string, id: string, hidden: boolean): Promise<void> {
  await runTxn(async tx => {
    const p = await mustGet<Product>(tx, 'products', id, workspaceId);
    tx.set(K.item('products', id), { ...p, status: hidden ? 'hidden' : 'active', updatedAt: nowIso() });
  });
  notifyDataChanged();
}

export async function listProducts(workspaceId: string, opts: { includeHidden?: boolean } = {}): Promise<Product[]> {
  const { items } = await listRecords<Product>('products', workspaceId);
  return items.filter(p => p.workspaceId === workspaceId && (opts.includeHidden || p.status === 'active'));
}

export async function getProduct(workspaceId: string, id: string): Promise<Product | null> {
  const p = await readRecord<Product>(K.item('products', id));
  return p && p.workspaceId === workspaceId ? p : null;
}

export function findByBarcodeIn(list: Product[], code: string, symbology: BarcodeSymbology = 'unknown'): Product | null {
  const n = normalizeBarcode(code, symbology);
  if (!n) return null;
  return list.find(p => p.status === 'active' && p.barcodes.some(b => b.normalized === n)) ?? null;
}

export async function findByBarcode(workspaceId: string, code: string, symbology: BarcodeSymbology = 'unknown'): Promise<Product | null> {
  return findByBarcodeIn(await listProducts(workspaceId), code, symbology);
}

/** Search text for a product (name, SKU, barcodes), folded for case / accent-insensitive matching. */
export function productSearchText(p: Product): string {
  return foldText([p.name, p.sku, ...p.barcodes.map(b => b.code)].filter(Boolean).join(' '));
}
