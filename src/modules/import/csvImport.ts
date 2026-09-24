/**
 * CSV import of products and their dates (pure planning + one all-or-nothing commit).
 *
 * - Columns are guessed from the header in six languages and can be changed by the user.
 * - The date order (year-month-day, day/month/year, month/day/year) is chosen by the user, never guessed:
 *   "03/04/2026" is a different day in different countries. Ambiguous cells are counted on the preview.
 * - A row matches an existing product by barcode, then SKU, then exact name; otherwise it creates one.
 * - The commit re-reads the lists inside the transaction and refuses if the product list changed since the preview.
 */
import { TE_KEYS } from '../../storage/keys';
import { transact } from '../../storage/repo';
import { notifyDataChanged } from '../../storage/changeBus';
import { SCHEMA_VERSIONS, DATE_TYPES, type DateBatch, type DateType, type LocalDate, type Product } from '../../domain/types';
import { isAmbiguousDayMonth, parseDateInOrder, type DateOrder } from '../../domain/dates';
import { SHELF_LIFE_MAX } from '../../domain/expiry';
import { applyDraft, cleanText, foldText, PRODUCT_LIMITS, validateDraft, type ProductDraft } from '../products/storage/productStore';
import { BATCH_LIMITS } from '../dates/storage/batchStore';
import { normalizeBarcode } from '../products/utils/barcode';
import { normaliseHeader } from '../products/utils/csvParse';
import { makeId, nowIso } from '../products/utils/ids';

export type ImportField = 'name' | 'barcode' | 'sku' | 'date' | 'dateType' | 'quantity' | 'location' | 'category' | 'shelfLife' | 'ignore';
export const IMPORT_FIELDS: readonly ImportField[] = ['name', 'barcode', 'sku', 'date', 'dateType', 'quantity', 'location', 'category', 'shelfLife', 'ignore'] as const;

export const MAX_IMPORT_ROWS = 5000;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** Header words in the six app languages (folded, underscores for spaces). */
const SYNONYMS: Record<Exclude<ImportField, 'ignore'>, string[]> = {
  name: ['name', 'product', 'product_name', 'description', 'item', 'title', 'اسم', 'المنتج', 'اسم_المنتج', 'urun', 'urun_adi', 'ad', 'nom', 'produit', 'libelle', 'nombre', 'producto', 'descripcion', 'artikel', 'bezeichnung', 'produktname'],
  barcode: ['barcode', 'ean', 'gtin', 'upc', 'ean13', 'code_barre', 'code_barres', 'codigo_de_barras', 'barkod', 'باركود', 'الباركود', 'strichcode', 'ean_code'],
  sku: ['sku', 'code', 'item_code', 'ref', 'reference', 'plu', 'stok_kodu', 'kod', 'referencia', 'codigo', 'artikelnummer', 'art_nr', 'رمز', 'الرمز'],
  date: ['date', 'expiry', 'expiry_date', 'expires', 'exp', 'best_before', 'use_by', 'bbe', 'sell_by', 'تاريخ', 'تاريخ_الانتهاء', 'skt', 'son_kullanma', 'son_kullanma_tarihi', 'tarih', 'dlc', 'ddm', 'date_limite', 'peremption', 'caducidad', 'fecha', 'fecha_de_caducidad', 'mhd', 'ablaufdatum', 'verbrauchsdatum', 'datum'],
  dateType: ['date_type', 'type', 'kind', 'نوع', 'نوع_التاريخ', 'tur', 'tarih_turu', 'type_de_date', 'tipo', 'tipo_de_fecha', 'datumsart', 'art'],
  quantity: ['quantity', 'qty', 'count', 'units', 'stock', 'الكمية', 'كمية', 'adet', 'miktar', 'quantite', 'qte', 'cantidad', 'menge', 'anzahl', 'stuck'],
  location: ['location', 'shelf', 'aisle', 'bay', 'fridge', 'place', 'الموقع', 'الرف', 'raf', 'konum', 'emplacement', 'rayon', 'etagere', 'ubicacion', 'estante', 'pasillo', 'regal', 'platz', 'ort', 'lagerort'],
  category: ['category', 'department', 'group', 'الفئة', 'فئة', 'kategori', 'categorie', 'categoria', 'kategorie', 'warengruppe'],
  shelfLife: ['shelf_life', 'shelf_life_days', 'life_days', 'days', 'مدة_الصلاحية', 'raf_omru', 'duree_de_conservation', 'vida_util', 'haltbarkeit', 'haltbarkeit_tage'],
};

function fold(h: string): string {
  return foldText(normaliseHeader(h)).replace(/[^\p{L}\p{N}_]/gu, '');
}

/** How well a header matches a field: exact word beats a contained word, and a longer contained word beats a shorter one. */
function score(folded: string, field: Exclude<ImportField, 'ignore'>): number {
  let best = 0;
  for (const s of SYNONYMS[field]) {
    if (folded === s) return 1000;
    if (s.length > 3 && folded.includes(s)) best = Math.max(best, s.length);
  }
  return best;
}

/** Best guess for each column; each field is used once, extra columns are ignored. */
export function guessMapping(header: string[]): ImportField[] {
  const used = new Set<ImportField>();
  return header.map(h => {
    const f = fold(h);
    let hit: Exclude<ImportField, 'ignore'> | null = null;
    let best = 0;
    for (const k of Object.keys(SYNONYMS) as Exclude<ImportField, 'ignore'>[]) {
      if (used.has(k)) continue;
      const sc = score(f, k);
      if (sc > best) { best = sc; hit = k; }
    }
    if (hit) { used.add(hit); return hit; }
    return 'ignore';
  });
}

/** Date-kind words in a file ("use by", "BBE", "DLC", "SKT", "MHD" …). Unknown words fall back to the default kind. */
export function parseDateType(cell: string, fallback: DateType): DateType {
  const f = foldText(cell).replace(/[^\p{L}\p{N}]/gu, '');
  if (!f) return fallback;
  if (DATE_TYPES.includes(cell as DateType)) return cell as DateType;
  if (/^(useby|usebydate|dlc|verbrauchsdatum|verbrauchenbis|skt|sonkullanma|caducidad|fechadecaducidad|استخدمقبل|يستخدمقبل)/.test(f)) return 'useBy';
  if (/^(bestbefore|bbe|bb|ddm|dluo|mhd|mindesthaltbarkeit|tett|consumirpreferentemente|preferentemente|يفضلاستخدامهقبل|افضلقبل)/.test(f)) return 'bestBefore';
  if (/^(sellby|vendreavant|verkaufenbis|venderantes|satis)/.test(f)) return 'sellBy';
  if (/^(displayuntil|display|affichage|anzeige|exhibir|teshir)/.test(f)) return 'displayUntil';
  return fallback;
}

export type RowProblem = 'noName' | 'badDate' | 'badQuantity' | 'badShelfLife' | 'nameTooLong' | 'barcodeConflict';

export interface PlannedRow {
  line: number;
  productKey: string;
  /** Existing product id, or undefined when this row creates (or shares) a new product. */
  productId?: string;
  newProduct?: ProductDraft;
  date?: { date: LocalDate; dateType: DateType; quantity?: number; location?: string };
  problem?: RowProblem;
  ambiguousDate: boolean;
}

export interface ImportPlan {
  rows: PlannedRow[];
  counts: { newProducts: number; matchedProducts: number; dates: number; invalid: number; ambiguousDates: number; overLimit: number };
  /** Fingerprint of the product list the plan was made against. */
  basis: string;
}

export function productsBasis(products: Product[]): string {
  return products.map(p => `${p.id}:${p.updatedAt}:${p.status}`).sort().join('|');
}

export function planImport(rows: string[][], mapping: ImportField[], hasHeader: boolean, order: DateOrder, products: Product[], defaultType: DateType): ImportPlan {
  const all = hasHeader ? rows.slice(1) : rows;
  const body = all.slice(0, MAX_IMPORT_ROWS);
  const col = (f: ImportField) => mapping.indexOf(f);
  const cell = (r: string[], f: ImportField) => { const i = col(f); return i >= 0 ? cleanText(r[i] ?? '') : ''; };
  const active = products.filter(p => p.status !== 'archived');
  const byBarcode = new Map<string, Product>();
  for (const p of active) for (const b of p.barcodes ?? []) byBarcode.set(b.normalized, p);
  const bySku = new Map(active.filter(p => p.sku).map(p => [foldText(p.sku as string), p]));
  const byName = new Map(active.map(p => [foldText(p.name), p]));
  const fresh = new Map<string, ProductDraft>();
  const freshBarcodes = new Map<string, string>();
  const out: PlannedRow[] = [];
  body.forEach((r, i) => {
    const line = i + (hasHeader ? 2 : 1);
    const name = cell(r, 'name');
    const barcode = cell(r, 'barcode');
    const sku = cell(r, 'sku');
    const norm = barcode ? normalizeBarcode(barcode) : '';
    const existing = (norm && byBarcode.get(norm)) || (sku && bySku.get(foldText(sku))) || (name && byName.get(foldText(name))) || undefined;
    const row: PlannedRow = { line, productKey: '', ambiguousDate: false };
    const dateCell = cell(r, 'date');
    if (dateCell) {
      const date = parseDateInOrder(dateCell, order);
      if (!date) row.problem = 'badDate';
      else {
        row.ambiguousDate = order !== 'ymd' && isAmbiguousDayMonth(dateCell);
        const qCell = cell(r, 'quantity');
        const quantity = qCell ? Number(qCell) : undefined;
        if (qCell && !(Number.isInteger(quantity) && (quantity as number) >= 1 && (quantity as number) <= BATCH_LIMITS.quantity)) row.problem = 'badQuantity';
        row.date = { date, dateType: parseDateType(cell(r, 'dateType'), existing?.defaultDateType ?? defaultType), quantity, location: cell(r, 'location').slice(0, BATCH_LIMITS.location) || undefined };
      }
    }
    if (existing) {
      row.productId = existing.id;
      row.productKey = `id:${existing.id}`;
    } else {
      if (!name) row.problem = row.problem ?? 'noName';
      const key = norm ? `bc:${norm}` : `nm:${foldText(name)}`;
      row.productKey = key;
      const lifeCell = cell(r, 'shelfLife');
      const shelfLifeDays = lifeCell ? Number(lifeCell) : undefined;
      if (lifeCell && !(Number.isInteger(shelfLifeDays) && (shelfLifeDays as number) >= 1 && (shelfLifeDays as number) <= SHELF_LIFE_MAX)) row.problem = row.problem ?? 'badShelfLife';
      if (name && [...name].length > PRODUCT_LIMITS.name) row.problem = row.problem ?? 'nameTooLong';
      if (norm && freshBarcodes.has(norm) && freshBarcodes.get(norm) !== foldText(name)) row.problem = row.problem ?? 'barcodeConflict';
      if (!row.problem && !fresh.has(key)) {
        const draft: ProductDraft = {
          name, barcodes: barcode ? [{ raw: barcode }] : [], sku: sku.slice(0, PRODUCT_LIMITS.sku) || undefined,
          category: cell(r, 'category').slice(0, PRODUCT_LIMITS.category) || undefined, shelfLocation: cell(r, 'location').slice(0, PRODUCT_LIMITS.shelfLocation) || undefined,
          shelfLifeDays, defaultDateType: row.date?.dateType,
        };
        if (validateDraft(draft)) row.problem = 'noName';
        else { fresh.set(key, draft); if (norm) freshBarcodes.set(norm, foldText(name)); row.newProduct = draft; }
      }
    }
    if (row.problem) delete row.date;
    out.push(row);
  });
  const ok = out.filter(r => !r.problem);
  return {
    rows: out,
    counts: {
      newProducts: fresh.size,
      matchedProducts: new Set(ok.filter(r => r.productId).map(r => r.productId)).size,
      dates: ok.filter(r => r.date).length,
      invalid: out.length - ok.length,
      ambiguousDates: ok.filter(r => r.ambiguousDate).length,
      overLimit: all.length - body.length,
    },
    basis: productsBasis(products),
  };
}

export class ImportChangedError extends Error { constructor() { super('The product list changed since the preview.'); this.name = 'ImportChangedError'; } }

/** Write every valid row in one transaction. Rows with a problem are skipped (they were shown on the preview). */
export async function commitImport(plan: ImportPlan): Promise<{ products: number; dates: number }> {
  const result = await transact([TE_KEYS.products, TE_KEYS.batches], read => {
    const products = read<Product>(TE_KEYS.products);
    if (productsBasis(products) !== plan.basis) throw new ImportChangedError();
    const batches = read<DateBatch>(TE_KEYS.batches);
    const created = new Map<string, Product>();
    const now = nowIso();
    const nextProducts = [...products];
    const nextBatches = [...batches];
    let dates = 0;
    for (const r of plan.rows) {
      if (r.problem) continue;
      let product = r.productId ? products.find(p => p.id === r.productId) : created.get(r.productKey);
      if (!product && r.newProduct) { product = applyDraft(undefined, r.newProduct, now); created.set(r.productKey, product); nextProducts.push(product); }
      if (!product || !r.date) continue;
      const same = nextBatches.findIndex(b => b.status === 'open' && b.productId === product!.id && b.date === r.date!.date && b.dateType === r.date!.dateType);
      if (same >= 0) {
        const b = nextBatches[same];
        const quantity = b.quantity != null && r.date.quantity != null ? Math.min(BATCH_LIMITS.quantity, b.quantity + r.date.quantity) : undefined;
        nextBatches[same] = { ...b, quantity, updatedAt: now };
      } else {
        nextBatches.push({ schemaVersion: SCHEMA_VERSIONS.batch, id: makeId('dt'), productId: product.id, productName: product.name, date: r.date.date, dateType: r.date.dateType, quantity: r.date.quantity, location: r.date.location, status: 'open', events: [], createdAt: now, updatedAt: now });
      }
      dates++;
    }
    return { writes: { [TE_KEYS.products]: nextProducts, [TE_KEYS.batches]: nextBatches }, result: { products: created.size, dates } };
  });
  notifyDataChanged();
  return result;
}
