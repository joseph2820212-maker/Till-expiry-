/**
 * CSV import of products and dated batches (§19). The ten steps of §19.3:
 *
 *  1. select file            → screens/CsvImportScreen (expo-document-picker)
 *  2. decode safely          → csvDecode.decodeCsvBytes (size / row / column caps, BOM, UTF-8 or Windows-1252, ; or ,)
 *  3. header mapping         → csvMapping.guessMapping (six languages), changed by the user
 *  4. preview                → planImport (pure: nothing is written)
 *  5. row validation         → per-row issues (a use-by can never be month-only: expiryValidation.validateDeadline)
 *  6. duplicate detection    → inside the file and against the workspace's existing products / batches
 *  7. conflicts shown        → existing products that differ are listed; the user chooses skip or update
 *  8. user confirms          → screens/CsvImportPreviewScreen
 *  9. one atomic import      → commitImport: ONE journaled runTxn; any failure writes nothing (T26)
 * 10. import history record  → an ImportRecord under imports:item:<id>, listed by listImportHistory
 *
 * Rules kept here:
 * - The same file (same normalised content, kind and workspace) is never imported twice: the SHA-256 fingerprint is the
 *   ImportRecord id, checked at preview AND inside the transaction (T35). The spec gives no override, so none exists.
 * - Two rows with the same barcode but a different lot or date stay two separate batches; batches are never merged (T36).
 * - Money is parsed exactly into integer minor units of the WORKSPACE currency. A workspace without a currency cannot
 *   import money columns at all: they are refused with a clear message, never guessed. A cost of 0 is refused (unknown
 *   cost stays unknown, never 0).
 * - A date's meaning is never guessed: an unknown date-kind word is an error, and rows without a kind use the kind the
 *   user chose on the mapping screen (or the product's usual kind).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  BarcodeRole, Batch, BusinessListItem, DateKind, DeadlineValue, ImportRecord, MoneyValue, Product, StorageLocation, TrackingUnit, Workspace,
} from '../../domain/expiry/expiryTypes';
import { DATE_KINDS, TRACKING_UNITS } from '../../domain/expiry/expiryTypes';
import { isLocalMonth, isOffsetIso, isTime, zonedIso } from '../../domain/expiry/datePrecision';
import { validateDeadline } from '../../domain/expiry/expiryValidation';
import { isLocalDate, parseDateInOrder, type DateOrder } from '../../domain/dates';
import { parseMoney } from '../../domain/money';
import { parseQuantity } from '../../domain/quantity/quantity';
import { normalizeArabicNumerals } from '../../utils/locale';
import { K } from '../../storage/keys';
import { phys } from '../../storage/scope';
import { listRecords, newId, nowIso, readRecord, RecordCorruptError, runTxn, type Txn } from '../../storage/entityStore';
import { DomainError, cleanText, foldText, putRecord } from '../../storage/repoHelpers';
import { notifyDataChanged } from '../../storage/changeBus';
import { buildProduct, PRODUCT_LIMITS, type ProductDraft } from '../products/productStore';
import { normalizeBarcode } from '../products/utils/barcode';
import { BATCH_LIMITS, createDatedBatchTx, listBatches } from '../batches/batchStore';
import { ensureListItemTx } from '../lists/listStore';
import { BufferedIndexTxn } from './bulkTxn';
import { importFingerprint, type DecodedCsv, type ImportKind } from './csvDecode';
import { foldHeader, guessMapping, mappingProblems, MONEY_FIELDS, type ImportField, type MappingProblem } from './csvMapping';

export * from './csvDecode';
export * from './csvMapping';

// ─── options ─────────────────────────────────────────────────────────────────

export interface ImportOptions {
  mapping: ImportField[];
  /** How slash dates are written: 03/04/2026 is 3 April (dmy) or 4 March (mdy). ISO dates always work. */
  dateOrder: DateOrder;
  /** Decimal mark of money cells. No thousands separators are accepted, so "1,234" can never be misread. */
  decimal: '.' | ',';
  /** Batches: the kind of date for rows without a date-kind cell (and whose product has no usual kind). Chosen by the user. */
  defaultDateKind: DateKind | null;
  /** Products: what to do with a row that matches an existing product whose details differ. */
  onExisting: 'skip' | 'update';
  /** Batches: what to do with a row identical to another row or to an existing batch. */
  onDuplicate: 'skip' | 'import';
}

/** The kind a date column's header names ("Use by", "MHD", "SKT" …), offered as the default kind; the user confirms it. */
export function kindFromHeader(header: string): DateKind | null {
  const k = parseDateKindCell(header);
  return k && k !== 'none' ? k : null;
}

export function defaultImportOptions(kind: ImportKind, csv: Pick<DecodedCsv, 'header' | 'delimiter'>): ImportOptions {
  const mapping = guessMapping(kind, csv.header);
  const dateCol = mapping.indexOf('date');
  return {
    mapping,
    dateOrder: 'dmy',
    decimal: csv.delimiter === ';' ? ',' : '.',
    defaultDateKind: kind === 'batches' && dateCol >= 0 && !mapping.includes('date_kind') ? kindFromHeader(csv.header[dateCol]) : null,
    onExisting: 'skip',
    onDuplicate: 'skip',
  };
}

// ─── cell parsers (pure) ─────────────────────────────────────────────────────

/** Trim / collapse spaces and undo the formula-injection escape our own export adds ("'=A1" → "=A1"). */
export function cleanCell(raw: string | undefined): string {
  const c = cleanText(raw ?? '');
  return /^'[=+\-@]/.test(c) ? c.slice(1) : c;
}

const KIND_WORDS: [DateKind, RegExp][] = [
  ['use_by', /^(useby|usebydate|usebyend|dlc|datelimitedeconsommation|verbrauchsdatum|verbrauchenbis|zuverbrauchenbis|skt|sonkullanmatarihi|sonkullanma|fechadecaducidad|caducidad|consumirantesde|استخدمقبل|يستخدمقبل|تاريخالاستخدام)$/],
  ['best_before', /^(bestbefore|bestbeforeend|bbe|bb|ddm|dluo|datededurabiliteminimale|aconsommerdepreferenceavant|mhd|mindesthaltbarkeitsdatum|mindestenshaltbarbis|tett|tavsiyeedilentuketimtarihi|consumirpreferentemente|consumirpreferentementeantesde|preferentemente|يفضلاستخدامهقبل|يفضلقبل|افضلقبل|أفضلقبل)$/],
  ['manufacturer_expiry', /^(manufacturerexpiry|manufacturersexpiry|expiry|expirydate|exp|expires|expiration|expirationdate|peremption|dateperemption|verfallsdatum|verfall|fechadevencimiento|vencimiento|miadi|انتهاءالصلاحية|تاريخالانتهاء)$/],
  ['internal_cutoff', /^(internalcutoff|cutoff|internal|internaldeadline|limiteinterne|dateinterne|corteinterno|limiteinterno|internefrist|internesdatum|dahilison|ickesim|حدداخلي|موعدداخلي)$/],
  ['quality_review', /^(qualityreview|review|qualitycheck|controlequalite|revisiondecalidad|revision|qualitatsprufung|qualitaetspruefung|prufung|kalitekontrolu|مراجعةالجودة|مراجعة)$/],
  ['none', /^(none|nodate|sansdate|aucune|sinfecha|ninguna|keindatum|kein|tarihyok|yok|بدونتاريخ|لايوجد)$/],
];

/** A date-kind cell: undefined when empty, null when the word is not recognised (never guessed). */
export function parseDateKindCell(cell: string): DateKind | null | undefined {
  const c = cleanCell(cell);
  if (!c) return undefined;
  if ((DATE_KINDS as readonly string[]).includes(c)) return c as DateKind;
  const f = foldText(c).replace(/[^\p{L}\p{N}]/gu, '');
  for (const [kind, re] of KIND_WORDS) if (re.test(f)) return kind;
  return null;
}

export type DateCellError = 'badDate' | 'badTime' | 'timeWithMonth';

/**
 * A date cell (+ optional time cell) → a deadline that keeps its precision. YYYY-MM-DD and slash / dot dates in the
 * chosen order are days; YYYY-MM and MM/YYYY are month-only; an ISO timestamp with an offset, or a day plus a time,
 * is an exact deadline in the workspace zone. Empty → undefined.
 */
export function parseDateCell(dateCell: string, timeCell: string, order: DateOrder, tz: string): { ok: true; deadline?: DeadlineValue } | { ok: false; error: DateCellError } {
  const d = normalizeArabicNumerals(cleanCell(dateCell));
  const tRaw = normalizeArabicNumerals(cleanCell(timeCell));
  if (!d) return tRaw ? { ok: false, error: 'badDate' } : { ok: true };
  const exact: boolean = isOffsetIso(d);
  if (exact) return tRaw ? { ok: false, error: 'badTime' } : { ok: true, deadline: { precision: 'datetime', at: d } };
  let month: string | null = null;
  if (/^\d{4}-\d{1,2}$/.test(d)) { const [y, m] = d.split('-'); month = `${y}-${m.padStart(2, '0')}`; }
  else if (/^\d{1,2}[/.\-\s]\d{4}$/.test(d)) { const [m, y] = d.split(/[/.\-\s]/); month = `${y}-${m.padStart(2, '0')}`; }
  if (month !== null) {
    if (!isLocalMonth(month)) return { ok: false, error: 'badDate' };
    if (tRaw) return { ok: false, error: 'timeWithMonth' };
    return { ok: true, deadline: { precision: 'month', month } };
  }
  // "2026-09-24 14:00" or "2026-09-24T14:00" (no offset): a local wall-clock time in the workspace zone.
  const local = /^(\d{4}-\d{2}-\d{2})[T\s](\d{1,2}:\d{2})(:\d{2})?$/.exec(d);
  if (local) {
    if (tRaw) return { ok: false, error: 'badTime' };
    const time = local[2].padStart(5, '0');
    if (!isLocalDate(local[1]) || !isTime(time)) return { ok: false, error: 'badDate' };
    return { ok: true, deadline: { precision: 'datetime', at: zonedIso(local[1], time, tz) } };
  }
  const date = parseDateInOrder(d, order);
  if (!date) return { ok: false, error: 'badDate' };
  if (!tRaw) return { ok: true, deadline: { precision: 'date', date } };
  const tm = /^(\d{1,2}):(\d{2})(:\d{2})?$/.exec(tRaw);
  const time = tm ? `${tm[1].padStart(2, '0')}:${tm[2]}` : '';
  if (!isTime(time)) return { ok: false, error: 'badTime' };
  return { ok: true, deadline: { precision: 'datetime', at: zonedIso(date, time, tz) } };
}

export type MoneyCellError = 'noCurrency' | 'badMoney' | 'moneyZero' | 'currencyMismatch' | 'tooManyDecimals';

/**
 * A money cell → exact minor units of the workspace currency. The workspace's own ISO code may be written before or
 * after the number; any other currency mark is refused. No grouping separators, no rounding, no floats.
 */
export function parseMoneyCell(cell: string, currency: string, decimal: '.' | ','): { ok: true; money: MoneyValue } | { ok: false; error: MoneyCellError } {
  if (!/^[A-Z]{3}$/.test(currency || '')) return { ok: false, error: 'noCurrency' };
  let s = normalizeArabicNumerals(cleanCell(cell)).replace(/[\s  ]/g, '');
  const up = s.toUpperCase();
  if (up.startsWith(currency)) s = s.slice(3);
  else if (up.endsWith(currency)) s = s.slice(0, -3);
  if (/^[A-Z]{3}|[A-Z]{3}$|\p{Sc}/u.test(s)) return { ok: false, error: 'currencyMismatch' };
  if (!/^[0-9.,]+$/.test(s)) return { ok: false, error: 'badMoney' };
  const r = parseMoney(s, currency, { decimal, grouping: 'none' });
  if (!r.ok) return { ok: false, error: r.error === 'tooManyDecimals' ? 'tooManyDecimals' : 'badMoney' };
  if (r.money.minor === 0) return { ok: false, error: 'moneyZero' };
  return { ok: true, money: { minor: r.money.minor, currency: r.money.currency } };
}

const UNIT_WORDS: Record<string, TrackingUnit> = {
  each: 'each', ea: 'each', pc: 'each', pcs: 'each', piece: 'each', pieces: 'each', unit: 'each', units: 'each', item: 'each', x: 'each',
  adet: 'each', piece_s: 'each', piece_fr: 'each', unite: 'each', unidad: 'each', unidades: 'each', stuck: 'each', stk: 'each', قطعة: 'each', حبة: 'each',
  pack: 'pack', pk: 'pack', packet: 'pack', paket: 'pack', paquet: 'pack', paquete: 'pack', packung: 'pack', packchen: 'pack', عبوة: 'pack',
  case: 'case', cs: 'case', box: 'case', koli: 'case', carton: 'case', caja: 'case', karton: 'case', kiste: 'case', كرتون: 'case', صندوق: 'case',
  g: 'g', gr: 'g', gram: 'g', grams: 'g', gramme: 'g', grammes: 'g', gramo: 'g', gramos: 'g', غرام: 'g', جرام: 'g',
  kg: 'kg', kilo: 'kg', kilos: 'kg', kilogram: 'kg', kilograms: 'kg', kilogramme: 'kg', kilogramo: 'kg', كيلو: 'kg', كغ: 'kg',
  ml: 'ml', millilitre: 'ml', milliliter: 'ml', mililitre: 'ml', mililitro: 'ml', مل: 'ml',
  l: 'l', lt: 'l', ltr: 'l', litre: 'l', liter: 'l', litres: 'l', liters: 'l', litro: 'l', litros: 'l', لتر: 'l',
};

/** A tracking-unit cell: a known word → that unit; anything else → a custom unit with the cell as its label. */
export function parseTrackingUnit(cell: string): { unit: TrackingUnit; customLabel?: string } | undefined {
  const c = cleanCell(cell);
  if (!c) return undefined;
  if ((TRACKING_UNITS as readonly string[]).includes(c) && c !== 'custom') return { unit: c as TrackingUnit };
  const w = UNIT_WORDS[foldText(c).replace(/[^\p{L}\p{N}]/gu, '')];
  return w ? { unit: w } : { unit: 'custom', customLabel: c };
}

export function parseBarcodeRole(cell: string): BarcodeRole | null | undefined {
  const f = foldText(cleanCell(cell)).replace(/[^\p{L}]/gu, '');
  if (!f) return undefined;
  if (/^(single|unit|each|item|tekli|unite|unidad|einzel|einzeln|مفرد|وحدة)$/.test(f)) return 'single';
  if (/^(pack|multipack|paket|paquet|paquete|packung|عبوة)$/.test(f)) return 'pack';
  if (/^(case|outer|carton|box|koli|caja|karton|كرتون)$/.test(f)) return 'case';
  return null;
}

/** Several barcodes can share one cell, separated by "|". */
export function splitBarcodes(cell: string): string[] {
  return cleanCell(cell).split('|').map(s => s.trim()).filter(Boolean);
}

// ─── context (what already exists in the workspace) ─────────────────────────

export interface ImportHistoryRecord extends ImportRecord {
  updatedCount: number;
  errorCount: number;
  newProductCount?: number;
  newLocationCount?: number;
  /** Request id of the confirming tap (a repeated tap returns this record instead of failing). */
  requestId?: string;
}

export interface ImportContext {
  workspace: Workspace;
  /** All products, including hidden ones (only active ones are matched). */
  products: Product[];
  /** Active batches. */
  batches: Batch[];
  /** All locations, including hidden ones (a hidden one with the same name is shown again, never duplicated). */
  locations: StorageLocation[];
  lists: BusinessListItem[];
  importedFingerprints: Set<string>;
  /** Import history of the workspace, newest first. */
  history: ImportHistoryRecord[];
}

export const importRecordId = (fingerprint: string) => `imp_${fingerprint}`;

export async function listImportHistory(workspaceId: string): Promise<ImportHistoryRecord[]> {
  const { items } = await listRecords<ImportHistoryRecord>('imports', workspaceId);
  return items.filter(r => r.workspaceId === workspaceId).sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

export async function loadImportContext(workspace: Workspace): Promise<ImportContext> {
  const [products, batches, locations, lists, history] = await Promise.all([
    listRecords<Product>('products', workspace.id).then(r => r.items.filter(p => p.workspaceId === workspace.id)),
    listBatches(workspace.id),
    listRecords<StorageLocation>('locations', workspace.id).then(r => r.items.filter(l => l.workspaceId === workspace.id)),
    listRecords<BusinessListItem>('lists', workspace.id).then(r => r.items.filter(l => l.workspaceId === workspace.id)),
    listImportHistory(workspace.id),
  ]);
  return { workspace, products, batches, locations, lists, importedFingerprints: new Set(history.map(h => h.fingerprint)), history };
}

// ─── plan (pure) ─────────────────────────────────────────────────────────────

export type RowStatus = 'new' | 'update' | 'skip' | 'error';

/** One line of the preview's issue list. `code` is an i18n suffix: import.issue.<code>. */
export interface RowIssue {
  line: number;
  severity: 'error' | 'skip' | 'warning';
  code: string;
  field?: ImportField;
  value?: string;
  params?: Record<string, string | number>;
}

export type PlanBlocker = MappingProblem | 'alreadyImported' | 'moneyNoCurrency' | 'nothingToImport';

interface Refs { category?: string; supplier?: string; defaultLocation?: string }

export interface PlannedProduct {
  line: number;
  status: RowStatus;
  existingId?: string;
  /** updatedAt of the product the plan was made against (the commit refuses if it changed). */
  existingUpdatedAt?: string;
  draft?: ProductDraft;
  refs: Refs;
}

export interface PlannedNewProduct { key: string; line: number; draft: ProductDraft }

export interface PlannedBatch {
  line: number;
  status: RowStatus;
  productId?: string;
  newProductKey?: string;
  lotNumber?: string;
  quantity?: number;
  quantityUnit?: string;
  dateKind: DateKind;
  deadline?: DeadlineValue;
  location?: string;
  receivedAt?: string;
  notes?: string;
}

export interface ImportCounts {
  rows: number;
  new: number;
  updated: number;
  skipped: number;
  errors: number;
  warnings: number;
  conflicts: number;
  newProducts: number;
  newLocations: number;
}

export interface ImportPlan {
  kind: ImportKind;
  workspaceId: string;
  currency: string;
  fileName: string;
  fingerprint: string;
  blockers: PlanBlocker[];
  counts: ImportCounts;
  /** Every problem, skip and warning, in file order (the preview shows it in a virtualised list). */
  issues: RowIssue[];
  products: PlannedProduct[];
  newProducts: PlannedNewProduct[];
  batches: PlannedBatch[];
  /** Location names the import will create (or show again if hidden). */
  locations: string[];
}

const LOCATION_MAX = 40;
const LIST_MAX = 40;

function lineOf(i: number): number { return i + 2; } // 1-based, after the header row

class Matcher {
  readonly byBarcode = new Map<string, Product>();
  readonly bySku = new Map<string, Product>();
  readonly byName = new Map<string, Product>();
  constructor(products: Product[]) {
    for (const p of products) {
      if (p.status !== 'active') continue;
      for (const b of p.barcodes) if (!this.byBarcode.has(b.normalized)) this.byBarcode.set(b.normalized, p);
      if (p.sku && !this.bySku.has(foldText(p.sku))) this.bySku.set(foldText(p.sku), p);
      if (!this.byName.has(foldText(p.name))) this.byName.set(foldText(p.name), p);
    }
  }
}

function tryBuild(workspaceId: string, d: ProductDraft, existing?: Product): string | null {
  try { buildProduct(workspaceId, d, existing); return null; } catch (e) { return e instanceof DomainError ? e.code : 'invalidRow'; }
}

function money(a?: MoneyValue, b?: MoneyValue): boolean { return (a?.minor ?? null) === (b?.minor ?? null) && (a?.currency ?? null) === (b?.currency ?? null); }

export function planImport(kind: ImportKind, csv: DecodedCsv, opts: ImportOptions, ctx: ImportContext): ImportPlan {
  const ws = ctx.workspace;
  const fingerprint = importFingerprint(csv.normalized, kind, ws.id);
  const blockers: PlanBlocker[] = [...mappingProblems(kind, opts.mapping)];
  if (ctx.importedFingerprints.has(fingerprint)) blockers.push('alreadyImported');
  const usesMoney = opts.mapping.some(f => MONEY_FIELDS.includes(f));
  if (usesMoney && !/^[A-Z]{3}$/.test(ws.currency || '')) blockers.push('moneyNoCurrency');
  const plan: ImportPlan = {
    kind, workspaceId: ws.id, currency: ws.currency, fileName: csv.fileName, fingerprint, blockers,
    counts: { rows: csv.rows.length, new: 0, updated: 0, skipped: 0, errors: 0, warnings: 0, conflicts: 0, newProducts: 0, newLocations: 0 },
    issues: [], products: [], newProducts: [], batches: [], locations: [],
  };
  if (blockers.some(b => b !== 'alreadyImported')) return plan;
  if (kind === 'products') planProducts(plan, csv, opts, ctx);
  else planBatches(plan, csv, opts, ctx);
  const c = plan.counts;
  for (const i of plan.issues) if (i.severity === 'warning') c.warnings++;
  if (c.new + c.updated === 0 && !plan.blockers.includes('alreadyImported')) plan.blockers.push('nothingToImport');
  return plan;
}

function cellReader(csv: DecodedCsv, mapping: ImportField[]) {
  const col = new Map<ImportField, number>();
  mapping.forEach((f, i) => { if (f !== 'ignore' && !col.has(f)) col.set(f, i); });
  return {
    has: (f: ImportField) => col.has(f),
    get: (row: string[], f: ImportField) => { const i = col.get(f); return i === undefined ? '' : cleanCell(row[i]); },
  };
}

/** Location names: matched to existing ones (case / accent-insensitive), otherwise planned for creation once. */
function locationPlanner(plan: ImportPlan, ctx: ImportContext) {
  const known = new Set(ctx.locations.filter(l => l.status === 'active').map(l => foldText(l.name)));
  const planned = new Set<string>();
  return (name: string) => {
    const f = foldText(name);
    if (known.has(f) || planned.has(f)) return;
    planned.add(f);
    plan.locations.push(name);
    plan.counts.newLocations++;
  };
}

function planProducts(plan: ImportPlan, csv: DecodedCsv, opts: ImportOptions, ctx: ImportContext): void {
  const ws = ctx.workspace;
  const cell = cellReader(csv, opts.mapping);
  const m = new Matcher(ctx.products);
  const listName = (id?: string) => ctx.lists.find(l => l.id === id)?.name;
  const locName = (id?: string) => ctx.locations.find(l => l.id === id)?.name;
  const seenKeys = new Map<string, number>();
  const seenBarcodes = new Map<string, number>();
  const addLocation = locationPlanner(plan, ctx);
  const c = plan.counts;

  csv.rows.forEach((row, i) => {
    const line = lineOf(i);
    const issues: RowIssue[] = [];
    const err = (code: string, field?: ImportField, value?: string, params?: RowIssue['params']) => issues.push({ line, severity: 'error', code, field, value, params });
    const name = cell.get(row, 'name');
    const sku = cell.get(row, 'sku');
    const codes = splitBarcodes(cell.get(row, 'barcode'));
    const norms = codes.map(x => normalizeBarcode(x));
    const roleCell = cell.get(row, 'barcode_role');
    const role = parseBarcodeRole(roleCell);
    if (role === null) err('badBarcodeRole', 'barcode_role', roleCell);
    const unitCell = cell.get(row, 'unit');
    const unit = parseTrackingUnit(unitCell);
    const currencyCell = cell.get(row, 'currency').toUpperCase();
    if (currencyCell && currencyCell !== ws.currency) err('currencyMismatch', 'currency', currencyCell, { currency: ws.currency || '—' });
    const readMoney = (f: 'cost' | 'price'): MoneyValue | undefined => {
      const v = cell.get(row, f);
      if (!v) return undefined;
      const r = parseMoneyCell(v, ws.currency, opts.decimal);
      if (!r.ok) { err(`money_${r.error}`, f, v, { currency: ws.currency || '—' }); return undefined; }
      return r.money;
    };
    const cost = readMoney('cost');
    const price = readMoney('price');
    const kindCell = cell.get(row, 'default_date_kind');
    const defaultKind = parseDateKindCell(kindCell);
    if (defaultKind === null) err('badDateKind', 'default_date_kind', kindCell);
    const category = cell.get(row, 'category');
    const supplier = cell.get(row, 'supplier');
    const defaultLocation = cell.get(row, 'default_location');
    if ([...category].length > LIST_MAX) err('textTooLong', 'category', category);
    if ([...supplier].length > LIST_MAX) err('textTooLong', 'supplier', supplier);
    if ([...defaultLocation].length > LOCATION_MAX) err('textTooLong', 'default_location', defaultLocation);
    const notes = cell.get(row, 'notes');
    if (!name) err('nameRequired', 'name');
    norms.forEach((n, k) => { if (!n) err('badBarcode', 'barcode', codes[k]); });

    // Duplicates inside the file: the same barcode, or (without barcode / SKU) the same name, twice.
    const key = norms[0] ? `bc:${norms[0]}` : sku ? `sku:${foldText(sku)}` : `nm:${foldText(name)}`;
    for (const n of norms) {
      const first = seenBarcodes.get(n);
      if (first !== undefined) err('duplicateInFile', 'barcode', n, { line: first });
    }
    const firstKey = seenKeys.get(key);
    if (firstKey !== undefined && !issues.some(x => x.code === 'duplicateInFile')) err('duplicateInFile', norms[0] ? 'barcode' : sku ? 'sku' : 'name', undefined, { line: firstKey });

    // Match an existing active product: barcode, then SKU, then name.
    const hits = new Set(norms.map(n => m.byBarcode.get(n)).filter((p): p is Product => !!p));
    if (hits.size > 1) err('barcodeConflict', 'barcode', codes.join('|'));
    const existing = [...hits][0] ?? (sku ? m.bySku.get(foldText(sku)) : undefined) ?? (name ? m.byName.get(foldText(name)) : undefined);

    const barcodes = codes.map(code => ({ code, role: role ?? undefined }));
    const refs: Refs = { category: category || undefined, supplier: supplier || undefined, defaultLocation: defaultLocation || undefined };
    let entry: PlannedProduct = { line, status: 'error', refs };

    if (!issues.length) {
      if (!existing) {
        const draft: ProductDraft = {
          name, sku: sku || undefined, barcodes, trackingUnit: unit?.unit, customUnitLabel: unit?.customLabel,
          costPerTrackingUnit: cost, sellingPrice: price, defaultDateKind: defaultKind ?? undefined, notes: notes || undefined,
        };
        const bad = tryBuild(ws.id, draft);
        if (bad) err(bad);
        else entry = { line, status: 'new', draft, refs };
      } else {
        // Fields the file sets that differ from the product: a conflict the user resolves (skip or update).
        const diffs: string[] = [];
        if (cell.has('name') && name && foldText(name) !== foldText(existing.name)) diffs.push('name');
        if (sku && sku !== (existing.sku ?? '')) diffs.push('sku');
        const newCodes = barcodes.filter((b, k) => !existing.barcodes.some(x => x.normalized === norms[k]));
        if (newCodes.length) diffs.push('barcode');
        if (unit && (unit.unit !== existing.trackingUnit || (unit.customLabel ?? '') !== (existing.customUnitLabel ?? ''))) diffs.push('unit');
        if (cost && !money(cost, existing.costPerTrackingUnit)) diffs.push('cost');
        if (price && !money(price, existing.sellingPrice)) diffs.push('price');
        if (defaultKind && defaultKind !== existing.defaultDateKind) diffs.push('default_date_kind');
        if (category && foldText(category) !== foldText(listName(existing.categoryId) ?? '')) diffs.push('category');
        if (supplier && foldText(supplier) !== foldText(listName(existing.supplierId) ?? '')) diffs.push('supplier');
        if (defaultLocation && foldText(defaultLocation) !== foldText(locName(existing.defaultLocationId) ?? '')) diffs.push('default_location');
        if (notes && notes !== (existing.notes ?? '')) diffs.push('notes');
        const fields = diffs.join(', ');
        if (!diffs.length) {
          issues.push({ line, severity: 'skip', code: 'unchanged', value: existing.name });
          entry = { line, status: 'skip', existingId: existing.id, refs };
        } else if (opts.onExisting === 'skip') {
          issues.push({ line, severity: 'skip', code: 'conflictSkipped', value: existing.name, params: { fields } });
          c.conflicts++;
          entry = { line, status: 'skip', existingId: existing.id, refs };
        } else {
          const draft: ProductDraft = {
            name: name || existing.name,
            sku: sku || existing.sku,
            barcodes: [...existing.barcodes.map(b => ({ code: b.code, role: b.role, unitCount: b.unitCount })), ...newCodes],
            categoryId: existing.categoryId, supplierId: existing.supplierId,
            trackingUnit: unit?.unit ?? existing.trackingUnit,
            customUnitLabel: unit ? unit.customLabel : existing.customUnitLabel,
            costPerTrackingUnit: cost ?? existing.costPerTrackingUnit,
            sellingPrice: price ?? existing.sellingPrice,
            defaultLocationId: existing.defaultLocationId, defaultRuleId: existing.defaultRuleId,
            defaultDateKind: defaultKind ?? existing.defaultDateKind,
            isPrepared: existing.isPrepared,
            notes: notes || existing.notes,
          };
          const bad = tryBuild(ws.id, draft, existing);
          if (bad) err(bad);
          else {
            issues.push({ line, severity: 'warning', code: 'willUpdate', value: existing.name, params: { fields } });
            c.conflicts++;
            entry = { line, status: 'update', existingId: existing.id, existingUpdatedAt: existing.updatedAt, draft, refs };
          }
        }
      }
    }
    if (issues.some(x => x.severity === 'error')) entry = { line, status: 'error', refs };
    if (entry.status === 'new' || entry.status === 'update') {
      if (!seenKeys.has(key)) seenKeys.set(key, line);
      for (const n of norms) if (!seenBarcodes.has(n)) seenBarcodes.set(n, line);
      if (defaultLocation) addLocation(defaultLocation);
    }
    if (entry.status === 'new') c.new++;
    else if (entry.status === 'update') c.updated++;
    else if (entry.status === 'skip') c.skipped++;
    else c.errors++;
    plan.products.push(entry);
    plan.issues.push(...issues);
  });
}

function planBatches(plan: ImportPlan, csv: DecodedCsv, opts: ImportOptions, ctx: ImportContext): void {
  const ws = ctx.workspace;
  const cell = cellReader(csv, opts.mapping);
  const m = new Matcher(ctx.products);
  const newByKey = new Map<string, PlannedNewProduct>();
  const locFold = new Map(ctx.locations.map(l => [l.id, foldText(l.name)]));
  const dupKey = (productKey: string, lot: string | undefined, kind: DateKind, d: DeadlineValue | undefined, loc: string | undefined, q: number | undefined) =>
    [productKey, foldText(lot ?? ''), kind, d ? JSON.stringify(d) : '', foldText(loc ?? ''), q ?? ''].join('\u0001');
  const existingKeys = new Set<string>();
  for (const b of ctx.batches) {
    if (b.status !== 'active' || b.workspaceId !== ws.id) continue;
    const d: DeadlineValue | undefined = b.dateKind === 'none' ? undefined
      : b.datePrecision === 'datetime' && b.exactDeadlineAt ? { precision: 'datetime', at: b.exactDeadlineAt }
      : b.datePrecision === 'month' && b.printedMonth ? { precision: 'month', month: b.printedMonth }
      : b.printedDate ? { precision: 'date', date: b.printedDate } : undefined;
    existingKeys.add([`id:${b.productId}`, foldText(b.lotNumber ?? ''), b.dateKind, d ? JSON.stringify(d) : '', b.locationId ? locFold.get(b.locationId) ?? '' : '', b.quantityInitial ?? ''].join('\u0001'));
  }
  const seen = new Map<string, number>();
  const addLocation = locationPlanner(plan, ctx);
  const c = plan.counts;

  csv.rows.forEach((row, i) => {
    const line = lineOf(i);
    const issues: RowIssue[] = [];
    const err = (code: string, field?: ImportField, value?: string, params?: RowIssue['params']) => issues.push({ line, severity: 'error', code, field, value, params });
    const name = cell.get(row, 'name');
    const sku = cell.get(row, 'sku');
    const code = splitBarcodes(cell.get(row, 'barcode'))[0] ?? '';
    const norm = code ? normalizeBarcode(code) : '';

    // Product: barcode preferred, otherwise SKU, otherwise name (§19.2).
    let product = norm ? m.byBarcode.get(norm) : undefined;
    if (!product && sku) product = m.bySku.get(foldText(sku));
    if (!product && name) product = m.byName.get(foldText(name));
    if (product && norm && !product.barcodes.some(b => b.normalized === norm)) issues.push({ line, severity: 'warning', code: 'barcodeNotOnProduct', value: code, params: { product: product.name } });
    let productKey = '';
    let newKey: string | undefined;
    const costCell = cell.get(row, 'cost');
    let cost: MoneyValue | undefined;
    if (costCell) {
      const r = parseMoneyCell(costCell, ws.currency, opts.decimal);
      if (!r.ok) err(`money_${r.error}`, 'cost', costCell, { currency: ws.currency || '—' });
      else cost = r.money;
    }
    const currencyCell = cell.get(row, 'currency').toUpperCase();
    if (currencyCell && currencyCell !== ws.currency) err('currencyMismatch', 'currency', currencyCell, { currency: ws.currency || '—' });

    // Kind of date: the row's own cell, else the product's usual kind, else the kind chosen for the file.
    const kindCell = cell.get(row, 'date_kind');
    const parsedKind = parseDateKindCell(kindCell);
    let kind: DateKind | undefined;
    if (parsedKind === null) err('badDateKind', 'date_kind', kindCell);
    else kind = parsedKind ?? product?.defaultDateKind ?? opts.defaultDateKind ?? undefined;
    if (parsedKind !== null && !kind) err('dateKindMissing', 'date_kind');

    const dateCell = cell.get(row, 'date');
    const timeCell = cell.get(row, 'time');
    const pd = parseDateCell(dateCell, timeCell, opts.dateOrder, ws.timeZone);
    let deadline: DeadlineValue | undefined;
    if (!pd.ok) err(pd.error, pd.error === 'badDate' ? 'date' : 'time', pd.error === 'badDate' ? dateCell : timeCell);
    else deadline = pd.deadline;
    if (pd.ok && kind) {
      const e = validateDeadline(kind, deadline);
      if (e) err(`deadline_${e}`, 'date', dateCell, { kind });
    }

    const qCell = normalizeArabicNumerals(cell.get(row, 'quantity'));
    let quantity: number | undefined;
    if (qCell) { const q = parseQuantity(qCell); if (q === null) err('badQuantity', 'quantity', qCell); else quantity = q; }
    const lot = cell.get(row, 'lot');
    if ([...lot].length > BATCH_LIMITS.lot) err('textTooLong', 'lot', lot);
    const unitCell = cell.get(row, 'quantity_unit');
    if ([...unitCell].length > 20) err('textTooLong', 'quantity_unit', unitCell);
    const location = cell.get(row, 'location');
    if ([...location].length > LOCATION_MAX) err('textTooLong', 'location', location);
    const notes = cell.get(row, 'notes');
    if ([...notes].length > BATCH_LIMITS.notes) err('textTooLong', 'notes', notes);
    const recCell = normalizeArabicNumerals(cell.get(row, 'received_at'));
    let receivedAt: string | undefined;
    if (recCell) {
      const r = parseDateCell(recCell, '', opts.dateOrder, ws.timeZone);
      if (!r.ok || !r.deadline || r.deadline.precision === 'month') err('badReceivedAt', 'received_at', recCell);
      else receivedAt = r.deadline.precision === 'datetime' ? r.deadline.at : zonedIso(r.deadline.date, '00:00', ws.timeZone);
    }

    if (product) {
      productKey = `id:${product.id}`;
      if (cost && !money(cost, product.costPerTrackingUnit)) issues.push({ line, severity: 'warning', code: 'costNotApplied', value: costCell, params: { product: product.name } });
    } else if (!name) {
      err(code || sku ? 'productNotFound' : 'productIdRequired', code ? 'barcode' : sku ? 'sku' : 'name', code || sku || undefined);
    } else {
      newKey = norm ? `bc:${norm}` : sku ? `sku:${foldText(sku)}` : `nm:${foldText(name)}`;
      productKey = `new:${newKey}`;
      if (!newByKey.has(newKey) && !issues.some(x => x.severity === 'error')) {
        const unit = parseTrackingUnit(unitCell);
        const draft: ProductDraft = {
          name, sku: sku || undefined, barcodes: code ? [{ code }] : [], defaultDateKind: kind,
          trackingUnit: unit && unit.unit !== 'custom' ? unit.unit : undefined, costPerTrackingUnit: cost,
        };
        const bad = tryBuild(ws.id, draft);
        if (bad) err(bad, 'name', name);
        else { newByKey.set(newKey, { key: newKey, line, draft }); plan.newProducts.push(newByKey.get(newKey)!); c.newProducts++; }
      } else if (newByKey.has(newKey) && cost && !money(cost, newByKey.get(newKey)!.draft.costPerTrackingUnit)) {
        issues.push({ line, severity: 'warning', code: 'costNotApplied', value: costCell, params: { product: name } });
      }
    }

    let status: RowStatus = 'error';
    if (!issues.some(x => x.severity === 'error') && kind) {
      // Never merge: an identical row / batch is only flagged; a different lot, date, place or quantity is a new batch.
      const k = dupKey(productKey, lot || undefined, kind, deadline, location || undefined, quantity);
      const firstLine = seen.get(k);
      const dupExisting = productKey.startsWith('id:') && existingKeys.has(k);
      status = 'new';
      if (firstLine !== undefined || dupExisting) {
        const code2 = firstLine !== undefined ? 'duplicateInFile' : 'duplicateExisting';
        const params = firstLine !== undefined ? { line: firstLine } : undefined;
        if (opts.onDuplicate === 'skip') { status = 'skip'; issues.push({ line, severity: 'skip', code: code2, params }); }
        else issues.push({ line, severity: 'warning', code: `${code2}Imported`, params });
      }
      if (firstLine === undefined) seen.set(k, line);
    }
    if (status === 'new') {
      if (location) addLocation(location);
      c.new++;
    } else if (status === 'skip') c.skipped++;
    else c.errors++;
    plan.batches.push({
      line, status, productId: product?.id, newProductKey: product ? undefined : newKey, lotNumber: lot || undefined, quantity,
      quantityUnit: unitCell || undefined, dateKind: kind ?? 'none', deadline, location: location || undefined, receivedAt, notes: notes || undefined,
    });
    plan.issues.push(...issues);
  });
  // A new product used only by rows that ended up skipped / in error is not created.
  const used = new Set(plan.batches.filter(b => b.status === 'new' && b.newProductKey).map(b => b.newProductKey));
  plan.newProducts = plan.newProducts.filter(p => used.has(p.key));
  c.newProducts = plan.newProducts.length;
}

// ─── commit (one atomic transaction) ─────────────────────────────────────────

export interface ImportResult { record: ImportHistoryRecord; repeated: boolean }

/** Strict bulk read of products (one multiGet): an unreadable record aborts the import instead of being ignored. */
async function readProductsStrict(tx: Txn, workspaceId: string): Promise<Product[]> {
  const ids = await tx.getIndex(K.index('products', workspaceId));
  if (!ids.length) return [];
  const pairs = await AsyncStorage.multiGet(ids.map(id => phys(K.item('products', id))));
  const out: Product[] = [];
  for (const [k, v] of pairs) {
    if (v == null) continue;
    let p: Product;
    try { p = JSON.parse(v) as Product; } catch { throw new RecordCorruptError(k, 'unparseable'); }
    if (p && p.workspaceId === workspaceId) out.push(p);
  }
  return out;
}

/** Barcode → active product id, built once per import (store's assertBarcodesFree is O(products) per call). */
function barcodeOwners(products: Product[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const p of products) if (p.status === 'active') for (const b of p.barcodes) map.set(b.normalized, p.id);
  return map;
}

function claimBarcodes(owners: Map<string, string>, p: Product): void {
  for (const b of p.barcodes) {
    const owner = owners.get(b.normalized);
    if (owner && owner !== p.id) throw new DomainError('importChanged', `barcode ${b.code}`);
  }
  for (const b of p.barcodes) owners.set(b.normalized, p.id);
}

async function resolveLocations(tx: Txn, ws: Workspace, names: string[], now: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = await tx.getIndex(K.index('locations', ws.id));
  const existing: StorageLocation[] = [];
  for (const id of ids) { const l = await tx.get<StorageLocation>(K.item('locations', id)); if (l && l.workspaceId === ws.id) existing.push(l); }
  const pick = (f: string) => existing.find(l => l.status === 'active' && foldText(l.name) === f) ?? existing.find(l => foldText(l.name) === f);
  for (const name of names) {
    const f = foldText(name);
    if (out.has(f)) continue;
    const hit = pick(f);
    if (hit) {
      if (hit.status !== 'active') { const next = { ...hit, status: 'active' as const, updatedAt: now }; tx.set(K.item('locations', hit.id), next); hit.status = 'active'; }
      out.set(f, hit.id);
      continue;
    }
    const rec: StorageLocation = { id: newId('loc'), workspaceId: ws.id, name: cleanText(name), kind: 'other', status: 'active', createdAt: now, updatedAt: now };
    await putRecord(tx, 'locations', rec);
    existing.push(rec);
    out.set(f, rec.id);
  }
  // Every location a row names (existing ones too) is resolved here.
  return out;
}

/**
 * Step 9: write every row the preview marked "new" / "update" in ONE journaled transaction, plus the ImportRecord.
 * Nothing is written if any read is corrupt, any write fails, the data changed since the preview in a way that matters,
 * or this file was already imported into this workspace. A repeated confirm with the same requestId returns the record.
 */
export async function commitImport(plan: ImportPlan, requestId?: string): Promise<ImportResult> {
  const blocking = plan.blockers.filter(b => b !== 'nothingToImport');
  if (blocking.length) {
    if (blocking[0] === 'alreadyImported' && requestId) {
      const prior = await readRecord<ImportHistoryRecord>(K.item('imports', importRecordId(plan.fingerprint)));
      if (prior && prior.requestId === requestId && prior.workspaceId === plan.workspaceId) return { record: prior, repeated: true };
    }
    throw new DomainError(blocking[0]);
  }
  if (plan.blockers.includes('nothingToImport')) throw new DomainError('nothingToImport');
  const result = await runTxn(async raw => {
    const ws = await raw.get<Workspace>(K.workspace(plan.workspaceId));
    if (!ws || ws.status !== 'active') throw new DomainError('noWorkspace');
    const recId = importRecordId(plan.fingerprint);
    const prior = await raw.get<ImportHistoryRecord>(K.item('imports', recId));
    if (prior) {
      if (requestId && prior.requestId === requestId) return { record: prior, repeated: true };
      throw new DomainError('alreadyImported');
    }
    const usesMoney = plan.products.some(p => p.draft?.costPerTrackingUnit || p.draft?.sellingPrice) || plan.newProducts.some(p => p.draft.costPerTrackingUnit);
    if (usesMoney && ws.currency !== plan.currency) throw new DomainError('importChanged', 'currency');

    const tx = new BufferedIndexTxn(raw);
    const now = nowIso();
    let created = 0;
    let updated = 0;
    let newProductCount = 0;
    const locationNames = [...plan.locations,
      ...plan.products.filter(p => p.status === 'new' || p.status === 'update').map(p => p.refs.defaultLocation).filter((x): x is string => !!x),
      ...plan.batches.filter(b => b.status === 'new').map(b => b.location).filter((x): x is string => !!x)];
    const locations = await resolveLocations(tx, ws, locationNames, now);
    const needProducts = plan.products.some(p => p.status === 'new' || p.status === 'update') || plan.newProducts.length > 0;
    const owners = needProducts ? barcodeOwners(await readProductsStrict(tx, ws.id)) : new Map<string, string>();

    if (plan.kind === 'products') {
      const lists = new Map<string, string>();
      const listId = async (kind: 'category' | 'supplier', name?: string) => {
        if (!name) return undefined;
        const k = `${kind}:${foldText(name)}`;
        if (!lists.has(k)) lists.set(k, (await ensureListItemTx(tx, ws.id, kind, name)).id);
        return lists.get(k);
      };
      for (const row of plan.products) {
        if ((row.status !== 'new' && row.status !== 'update') || !row.draft) continue;
        const draft: ProductDraft = { ...row.draft };
        if (row.refs.category) draft.categoryId = await listId('category', row.refs.category);
        if (row.refs.supplier) draft.supplierId = await listId('supplier', row.refs.supplier);
        if (row.refs.defaultLocation) draft.defaultLocationId = locations.get(foldText(row.refs.defaultLocation));
        if (row.status === 'new') {
          const p = buildProduct(ws.id, draft, undefined, now);
          claimBarcodes(owners, p);
          await putRecord(tx, 'products', p);
          created++;
        } else {
          const existing = await tx.get<Product>(K.item('products', row.existingId as string));
          if (!existing || existing.workspaceId !== ws.id || existing.status !== 'active' || existing.updatedAt !== row.existingUpdatedAt) throw new DomainError('importChanged', row.existingId);
          const next = buildProduct(ws.id, draft, existing, now);
          claimBarcodes(owners, next);
          tx.set(K.item('products', existing.id), next);
          updated++;
        }
      }
    } else {
      const newIds = new Map<string, string>();
      for (const np of plan.newProducts) {
        const p = buildProduct(ws.id, np.draft, undefined, now);
        claimBarcodes(owners, p);
        await putRecord(tx, 'products', p);
        newIds.set(np.key, p.id);
        newProductCount++;
      }
      const reqBase = `req_imp_${plan.fingerprint.slice(0, 24)}`;
      for (const b of plan.batches) {
        if (b.status !== 'new') continue;
        const productId = b.productId ?? (b.newProductKey ? newIds.get(b.newProductKey) : undefined);
        if (!productId) throw new DomainError('importChanged', `line ${b.line}`);
        await createDatedBatchTx(tx, {
          workspaceId: ws.id, kind: 'bought_in', productId, lotNumber: b.lotNumber, quantity: b.quantity, quantityUnit: b.quantityUnit,
          dateKind: b.dateKind, deadline: b.deadline, locationId: b.location ? locations.get(foldText(b.location)) : undefined,
          receivedAt: b.receivedAt, notes: b.notes, importRef: `${plan.fingerprint}:${b.line}`, requestId: `${reqBase}_${b.line}`,
        });
        created++;
      }
    }

    const record: ImportHistoryRecord = {
      id: recId, workspaceId: ws.id, kind: plan.kind, fileName: plan.fileName.slice(0, 200), fingerprint: plan.fingerprint,
      createdCount: created, updatedCount: updated, skippedCount: plan.counts.skipped + plan.counts.errors, errorCount: plan.counts.errors,
      newProductCount: plan.kind === 'batches' ? newProductCount : undefined, newLocationCount: plan.counts.newLocations,
      requestId, at: now,
    };
    if (record.requestId === undefined) delete record.requestId;
    if (record.newProductCount === undefined) delete record.newProductCount;
    await putRecord(tx, 'imports', record);
    tx.flush();
    return { record, repeated: false };
  });
  if (!result.repeated) notifyDataChanged();
  return result;
}
