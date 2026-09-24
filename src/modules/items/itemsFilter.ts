/** Pure filtering for the Items screen (§14), kept apart from the UI so it is unit-tested at scale. */
import type { Batch, BatchKind, DateKind, Product } from '../../domain/expiry/expiryTypes';
import { groupOf, type StatusGroup } from '../../domain/expiry/statusEngine';
import type { Ranked } from '../../domain/expiry/expirySort';
import { foldText } from '../../storage/repoHelpers';

export interface ItemsFilter {
  text: string;
  group?: StatusGroup;
  dateKind?: DateKind;
  locationId?: string;
  categoryId?: string;
  supplierId?: string;
  kind?: BatchKind;
  /** Products: show hidden (archived) products instead of active. Batches: show archived/finished batches. */
  archived: boolean;
}

export const EMPTY_FILTER: ItemsFilter = { text: '', archived: false };

export function activeFilterCount(f: ItemsFilter): number {
  return [f.group, f.dateKind, f.locationId, f.categoryId, f.supplierId, f.kind].filter(Boolean).length + (f.archived ? 1 : 0);
}

function words(text: string): string[] { return foldText(text).split(/\s+/).filter(Boolean); }

export function batchText(b: Batch, p: Product | undefined, locationName: string | undefined, supplierName: string | undefined): string {
  return foldText([b.productName, b.lotNumber, p?.sku, ...(p?.barcodes.map(x => x.code) ?? []), locationName, supplierName].filter(Boolean).join(' '));
}

export function filterBatches(
  rows: Ranked[], f: ItemsFilter, products: Map<string, Product>, locationName: (id?: string) => string | undefined, listName: (id?: string) => string | undefined,
): Ranked[] {
  const w = words(f.text);
  return rows.filter(r => {
    const b = r.batch;
    const p = products.get(b.productId);
    if (f.group && groupOf(r.evaluation.status) !== f.group) return false;
    if (f.dateKind && b.effective.dateKind !== f.dateKind) return false;
    if (f.locationId && b.locationId !== f.locationId) return false;
    if (f.kind && b.kind !== f.kind) return false;
    if (f.categoryId && p?.categoryId !== f.categoryId) return false;
    if (f.supplierId && p?.supplierId !== f.supplierId) return false;
    if (w.length) {
      const text = batchText(b, p, locationName(b.locationId), listName(p?.supplierId));
      if (!w.every(x => text.includes(x))) return false;
    }
    return true;
  });
}

export function filterProducts(products: Product[], f: ItemsFilter, listName: (id?: string) => string | undefined, locationName: (id?: string) => string | undefined): Product[] {
  const w = words(f.text);
  return products
    .filter(p => (f.archived ? p.status === 'hidden' : p.status === 'active'))
    .filter(p => !f.categoryId || p.categoryId === f.categoryId)
    .filter(p => !f.supplierId || p.supplierId === f.supplierId)
    .filter(p => !f.locationId || p.defaultLocationId === f.locationId)
    .filter(p => !f.dateKind || p.defaultDateKind === f.dateKind)
    .filter(p => {
      if (!w.length) return true;
      const text = foldText([p.name, p.sku, ...p.barcodes.map(b => b.code), listName(p.supplierId), listName(p.categoryId), locationName(p.defaultLocationId)].filter(Boolean).join(' '));
      return w.every(x => text.includes(x));
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
