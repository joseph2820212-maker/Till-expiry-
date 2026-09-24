/**
 * Step 3 of the CSV import (§19.3): header mapping. The app guesses which column holds which field from the header
 * words in the six app languages; the user sees the guess and can change every column before the preview.
 * Adapted from the v1 importer (git f6f4de8 src/modules/import/csvImport.ts, guessMapping / SYNONYMS).
 */
import { foldText } from '../../storage/repoHelpers';
import { normaliseHeader } from '../products/utils/csvParse';
import type { ImportKind } from './csvDecode';

export type ProductField =
  | 'name' | 'barcode' | 'barcode_role' | 'sku' | 'category' | 'supplier' | 'unit' | 'cost' | 'price' | 'currency'
  | 'default_location' | 'default_date_kind' | 'notes';
export type BatchField =
  | 'name' | 'barcode' | 'sku' | 'date_kind' | 'date' | 'time' | 'lot' | 'quantity' | 'quantity_unit' | 'location'
  | 'received_at' | 'cost' | 'currency' | 'notes';
export type ImportField = ProductField | BatchField | 'ignore';

export const PRODUCT_FIELDS: readonly ProductField[] = ['name', 'barcode', 'barcode_role', 'sku', 'category', 'supplier', 'unit', 'cost', 'price', 'currency', 'default_location', 'default_date_kind', 'notes'];
export const BATCH_FIELDS: readonly BatchField[] = ['name', 'barcode', 'sku', 'date_kind', 'date', 'time', 'lot', 'quantity', 'quantity_unit', 'location', 'received_at', 'cost', 'currency', 'notes'];

export function fieldsFor(kind: ImportKind): readonly ImportField[] {
  return [...(kind === 'products' ? PRODUCT_FIELDS : BATCH_FIELDS), 'ignore'];
}

/** Money fields: they need the workspace currency and are never guessed without one. */
export const MONEY_FIELDS: readonly ImportField[] = ['cost', 'price'];

type Guessable = Exclude<ImportField, 'ignore'>;

/** Header words (folded: lower case, no accents, "_" for spaces) in English, Arabic, Turkish, French, Spanish, German. */
const SYNONYMS: Record<Guessable, string[]> = {
  name: ['name', 'product', 'product_name', 'item', 'item_name', 'description', 'title', 'اسم', 'الاسم', 'المنتج', 'اسم_المنتج', 'urun', 'urun_adi', 'ad', 'adi', 'nom', 'produit', 'nom_du_produit', 'libelle', 'article', 'nombre', 'producto', 'articulo', 'descripcion', 'artikel', 'bezeichnung', 'produktname', 'produkt'],
  barcode: ['barcode', 'barcodes', 'ean', 'gtin', 'upc', 'ean13', 'ean_code', 'code_barre', 'code_barres', 'codigo_de_barras', 'codigo_barras', 'barkod', 'باركود', 'الباركود', 'strichcode', 'barcode_number'],
  barcode_role: ['barcode_role', 'barcode_type', 'pack_level', 'role', 'نوع_الباركود', 'barkod_turu', 'type_de_code', 'tipo_de_codigo', 'barcode_art'],
  sku: ['sku', 'item_code', 'product_code', 'code', 'ref', 'reference', 'plu', 'stok_kodu', 'urun_kodu', 'kod', 'referencia', 'codigo', 'artikelnummer', 'art_nr', 'artnr', 'رمز', 'الرمز', 'رمز_المنتج'],
  category: ['category', 'department', 'group', 'الفئة', 'فئة', 'القسم', 'kategori', 'categorie', 'rayon', 'categoria', 'kategorie', 'warengruppe'],
  supplier: ['supplier', 'vendor', 'brand', 'المورد', 'مورد', 'tedarikci', 'fournisseur', 'proveedor', 'lieferant'],
  unit: ['unit', 'tracking_unit', 'uom', 'الوحدة', 'وحدة', 'birim', 'unite', 'unidad', 'einheit'],
  cost: ['cost', 'unit_cost', 'cost_price', 'buy_price', 'purchase_price', 'التكلفة', 'تكلفة', 'سعر_الشراء', 'maliyet', 'alis_fiyati', 'cout', 'prix_d_achat', 'prix_achat', 'coste', 'costo', 'precio_de_compra', 'kosten', 'einkaufspreis', 'ek_preis'],
  price: ['price', 'selling_price', 'sell_price', 'retail_price', 'السعر', 'سعر', 'سعر_البيع', 'fiyat', 'satis_fiyati', 'prix', 'prix_de_vente', 'precio', 'precio_de_venta', 'preis', 'verkaufspreis', 'vk_preis'],
  currency: ['currency', 'العملة', 'عملة', 'para_birimi', 'doviz', 'devise', 'monnaie', 'moneda', 'divisa', 'wahrung', 'waehrung'],
  default_location: ['default_location', 'usual_location', 'الموقع_الافتراضي', 'varsayilan_konum', 'emplacement_par_defaut', 'ubicacion_predeterminada', 'standardort'],
  default_date_kind: ['default_date_kind', 'usual_date_kind', 'default_date_type', 'نوع_التاريخ_الافتراضي', 'varsayilan_tarih_turu', 'type_de_date_par_defaut', 'tipo_de_fecha_predeterminado', 'standard_datumsart'],
  notes: ['notes', 'note', 'comment', 'comments', 'remarks', 'ملاحظات', 'ملاحظة', 'notlar', 'not', 'aciklama', 'remarque', 'remarques', 'commentaire', 'notas', 'nota', 'comentario', 'notizen', 'notiz', 'bemerkung', 'kommentar'],
  date_kind: ['date_kind', 'date_type', 'kind', 'type', 'نوع', 'نوع_التاريخ', 'tur', 'tarih_turu', 'type_de_date', 'tipo', 'tipo_de_fecha', 'datumsart', 'datumstyp', 'art'],
  date: ['date', 'expiry', 'expiry_date', 'expiration', 'expiration_date', 'expires', 'exp', 'best_before', 'use_by', 'bbe', 'deadline', 'تاريخ', 'التاريخ', 'تاريخ_الانتهاء', 'skt', 'son_kullanma', 'son_kullanma_tarihi', 'tarih', 'dlc', 'ddm', 'date_limite', 'peremption', 'date_de_peremption', 'caducidad', 'fecha', 'fecha_de_caducidad', 'mhd', 'ablaufdatum', 'verbrauchsdatum', 'datum'],
  time: ['time', 'deadline_time', 'الوقت', 'وقت', 'saat', 'heure', 'hora', 'uhrzeit', 'zeit'],
  lot: ['lot', 'lot_number', 'batch', 'batch_number', 'batch_no', 'lot_no', 'التشغيلة', 'رقم_التشغيلة', 'دفعة', 'parti', 'parti_no', 'lot_numarasi', 'numero_de_lot', 'lote', 'numero_de_lote', 'charge', 'chargennummer', 'charge_nr'],
  quantity: ['quantity', 'qty', 'count', 'units', 'amount', 'الكمية', 'كمية', 'adet', 'miktar', 'quantite', 'qte', 'cantidad', 'menge', 'anzahl', 'stuck', 'stueck'],
  quantity_unit: ['quantity_unit', 'qty_unit', 'unit', 'uom', 'وحدة_الكمية', 'الوحدة', 'miktar_birimi', 'birim', 'unite_de_quantite', 'unite', 'unidad_de_cantidad', 'unidad', 'mengeneinheit', 'einheit'],
  location: ['location', 'shelf', 'place', 'storage', 'fridge', 'الموقع', 'مكان', 'الرف', 'konum', 'yer', 'raf', 'emplacement', 'etagere', 'ubicacion', 'estante', 'lugar', 'lagerort', 'ort', 'regal', 'platz'],
  received_at: ['received_at', 'received', 'received_date', 'delivery_date', 'delivered', 'تاريخ_الاستلام', 'الاستلام', 'teslim_tarihi', 'teslim_alma', 'date_de_reception', 'reception', 'recu_le', 'fecha_de_recepcion', 'recepcion', 'eingang', 'eingangsdatum', 'lieferdatum'],
};

export function foldHeader(h: string): string {
  return foldText(normaliseHeader(h)).replace(/[^\p{L}\p{N}_]/gu, '');
}

/** How well a header matches a field: an exact word beats a contained word, and a longer contained word a shorter one. */
function score(folded: string, field: Guessable): number {
  if (!folded) return 0;
  let best = 0;
  for (const s of SYNONYMS[field]) {
    if (folded === s) return 1000;
    if (s.length > 3 && folded.includes(s)) best = Math.max(best, s.length);
  }
  return best;
}

/**
 * Best guess for each column of the header. Each field is used by one column at most; exact matches are assigned
 * first so "Date" is never stolen by a column called "Date kind". Anything unrecognised is "ignore".
 */
export function guessMapping(kind: ImportKind, header: string[]): ImportField[] {
  const fields = (kind === 'products' ? PRODUCT_FIELDS : BATCH_FIELDS) as readonly Guessable[];
  const folded = header.map(foldHeader);
  const cand: { col: number; field: Guessable; score: number }[] = [];
  folded.forEach((f, col) => { for (const field of fields) { const sc = score(f, field); if (sc > 0) cand.push({ col, field, score: sc }); } });
  cand.sort((a, b) => b.score - a.score || a.col - b.col || fields.indexOf(a.field) - fields.indexOf(b.field));
  const out: ImportField[] = header.map(() => 'ignore');
  const usedField = new Set<Guessable>();
  const usedCol = new Set<number>();
  for (const c of cand) {
    if (usedField.has(c.field) || usedCol.has(c.col)) continue;
    out[c.col] = c.field;
    usedField.add(c.field);
    usedCol.add(c.col);
  }
  return out;
}

/** Set column `col` to `field`; a field is used by one column only, so the column that had it becomes "ignore". */
export function setColumnField(mapping: ImportField[], col: number, field: ImportField): ImportField[] {
  const next = mapping.map(f => (field !== 'ignore' && f === field ? 'ignore' : f));
  next[col] = field;
  return next;
}

export type MappingProblem = 'nameRequired' | 'productIdRequired' | 'dateRequired';

/** What the mapping still lacks before a preview makes sense. */
export function mappingProblems(kind: ImportKind, mapping: ImportField[]): MappingProblem[] {
  const has = (f: ImportField) => mapping.includes(f);
  if (kind === 'products') return has('name') ? [] : ['nameRequired'];
  const out: MappingProblem[] = [];
  if (!has('name') && !has('barcode') && !has('sku')) out.push('productIdRequired');
  if (!has('date')) out.push('dateRequired');
  return out;
}
