/**
 * Global search (§20), adapted from Till Note's approach: one folded-text index over the ACTIVE workspace's own
 * records only (products, batches, locations, rules, suppliers). Built from the strict repositories on demand, so it
 * can never be stale or leak another workspace's records (T30). Search is best-effort convenience: a record that fails
 * to read is skipped by the stores and reported as unreadable, never guessed.
 */
import type { Batch, ExpiryRule, Product, StorageLocation, BusinessListItem } from '../../domain/expiry/expiryTypes';
import { foldText } from '../../storage/repoHelpers';
import { listBatches } from '../batches/batchStore';
import { listProducts } from '../products/productStore';
import { listLocations } from '../locations/locationStore';
import { listRules } from '../rules/ruleStore';
import { listItems } from '../lists/listStore';

export type SearchHit =
  | { type: 'product'; id: string; title: string; detail?: string; record: Product }
  | { type: 'batch'; id: string; title: string; detail?: string; record: Batch }
  | { type: 'location'; id: string; title: string; record: StorageLocation }
  | { type: 'rule'; id: string; title: string; detail?: string; record: ExpiryRule }
  | { type: 'supplier'; id: string; title: string; record: BusinessListItem };

interface Entry { hit: SearchHit; text: string }

export interface SearchIndex { workspaceId: string; entries: Entry[] }

export const SEARCH_TYPE_ORDER: SearchHit['type'][] = ['batch', 'product', 'location', 'rule', 'supplier'];
export const SEARCH_LIMIT = 100;

export async function buildSearchIndex(workspaceId: string): Promise<SearchIndex> {
  const [products, batches, locations, rules, suppliers, categories] = await Promise.all([
    listProducts(workspaceId), listBatches(workspaceId, { status: 'any' }), listLocations(workspaceId), listRules(workspaceId),
    listItems(workspaceId, 'supplier'), listItems(workspaceId, 'category'),
  ]);
  const productById = new Map(products.map(p => [p.id, p]));
  const locationById = new Map(locations.map(l => [l.id, l.name]));
  const listName = new Map([...suppliers, ...categories].map(i => [i.id, i.name]));
  const entries: Entry[] = [];
  for (const p of products) {
    entries.push({
      hit: { type: 'product', id: p.id, title: p.name, detail: p.sku, record: p },
      text: foldText([p.name, p.sku, ...p.barcodes.map(b => b.code), listName.get(p.supplierId ?? ''), listName.get(p.categoryId ?? '')].filter(Boolean).join(' ')),
    });
  }
  for (const b of batches) {
    if (b.status === 'archived') continue;
    const p = productById.get(b.productId);
    entries.push({
      hit: { type: 'batch', id: b.id, title: b.productName, detail: b.lotNumber, record: b },
      text: foldText([b.productName, b.lotNumber, locationById.get(b.locationId ?? ''), p?.sku, ...(p?.barcodes.map(x => x.code) ?? []), listName.get(p?.supplierId ?? '')].filter(Boolean).join(' ')),
    });
  }
  for (const l of locations) entries.push({ hit: { type: 'location', id: l.id, title: l.name, record: l }, text: foldText(l.name) });
  for (const r of rules) entries.push({ hit: { type: 'rule', id: r.id, title: r.name, detail: r.sourceText, record: r }, text: foldText(`${r.name} ${r.sourceText}`) });
  for (const s of suppliers) entries.push({ hit: { type: 'supplier', id: s.id, title: s.name, record: s }, text: foldText(s.name) });
  return { workspaceId, entries };
}

/** Every word of the query must appear (in any order). Codes match with or without spaces. */
export function searchIndex(index: SearchIndex, query: string, limit = SEARCH_LIMIT): SearchHit[] {
  const words = foldText(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const hits: SearchHit[] = [];
  for (const e of index.entries) {
    if (words.every(w => e.text.includes(w))) hits.push(e.hit);
  }
  hits.sort((a, b) => SEARCH_TYPE_ORDER.indexOf(a.type) - SEARCH_TYPE_ORDER.indexOf(b.type) || a.title.localeCompare(b.title));
  return hits.slice(0, limit);
}
