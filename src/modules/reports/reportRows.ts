/**
 * Normalized report rows (§18). The expiry report and the waste report are each built ONCE here; the screen list, the
 * CSV file and the PDF file are all rendered from these same rows (T54, see reportTable.ts).
 *
 * - Every read is scoped to one workspace id and every record is re-checked against it (T29).
 * - Money is exact: integer minor units + ISO currency. An unknown cost stays `null` — never 0 — and is counted
 *   separately; totals are kept per currency so two currencies are never added together (T55).
 * - The waste report counts only events explicitly recorded as `wasted`; nothing expires into waste (T56, T24).
 */
import { unitCostFor } from '../batches/unitCost';
import type {
  Batch, BatchEvent, BatchKind, DateKind, DeadlineValue, IsoDateTime, LocalDate, MoneyValue, Product, StatusSettings, StorageLocation, Workspace,
} from '../../domain/expiry/expiryTypes';
import { WASTE_REASONS, type WasteReason } from '../../domain/expiry/expiryTypes';
import { deadlineDate, localDateOf } from '../../domain/expiry/datePrecision';
import { rankBatches } from '../../domain/expiry/expirySort';
import { groupOf, type ExpiryStatus, type StatusGroup } from '../../domain/expiry/statusEngine';
import { listBatches, listEvents } from '../batches/batchStore';
import { listProducts } from '../products/productStore';
import { listLocations } from '../locations/locationStore';
import { getGeneral } from '../settings/settingsStore';
import { readRecord } from '../../storage/entityStore';
import { K } from '../../storage/keys';

// ─── exact money ───────────────────────────────────────────────────────────────

/**
 * Cost of a quantity at a per-unit cost, exact. Quantities carry at most three decimals, so the product is computed in
 * integer thousandths (BigInt) and rounded half-up to the currency's minor unit once. Returns null on overflow.
 */
export function costOfQuantity(unitCost: MoneyValue, quantity: number): MoneyValue | null {
  if (!Number.isSafeInteger(unitCost.minor) || unitCost.minor < 0 || !Number.isFinite(quantity) || quantity < 0) return null;
  const milli = Math.round(quantity * 1000);
  if (Math.abs(milli - quantity * 1000) > 1e-6) return null;
  const product = BigInt(unitCost.minor) * BigInt(milli);
  const minor = (product + BigInt(500)) / BigInt(1000);
  if (minor > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return { minor: Number(minor), currency: unitCost.currency };
}

/** Per-currency totals in minor units (never mixed). */
export type CurrencyTotals = Record<string, number>;

function addTo(totals: CurrencyTotals, m: MoneyValue): boolean {
  const next = (totals[m.currency] ?? 0) + m.minor;
  if (!Number.isSafeInteger(next)) return false;
  totals[m.currency] = next;
  return true;
}

/** Unit a batch is counted in, for display and for grouping quantities (never converted). */
export function unitOf(batch: Pick<Batch, 'quantityUnit'>, product?: Pick<Product, 'trackingUnit' | 'customUnitLabel'>): string | undefined {
  if (batch.quantityUnit) return batch.quantityUnit;
  if (!product) return undefined;
  return product.trackingUnit === 'custom' ? product.customUnitLabel : product.trackingUnit;
}

/** The product's per-unit cost applies only when the batch is counted in the product's own tracking unit. */

// ─── expiry report ─────────────────────────────────────────────────────────────

export interface ExpiryFilter {
  /** Deadline day on or after (workspace zone). Omitted: everything up to `to`, including overdue. */
  from?: LocalDate;
  /** Deadline day on or before. */
  to?: LocalDate;
  locationId?: string;
  groups?: StatusGroup[];
  kinds?: BatchKind[];
  categoryId?: string;
  productId?: string;
}

export interface ExpiryRow {
  batchId: string;
  productId: string;
  productName: string;
  lot?: string;
  kind: BatchKind;
  dateKind: DateKind;
  /** The controlling deadline, precision preserved (a month-only best-before stays a month). */
  deadline?: DeadlineValue;
  /** Calendar day the deadline falls on (month → last day), for range filters. */
  deadlineDay?: LocalDate;
  /** Machine value of the deadline: YYYY-MM-DD, YYYY-MM or an offset ISO instant. */
  deadlineRaw?: string;
  timeZone: string;
  reason: Batch['effective']['reason'];
  status: ExpiryStatus;
  group: StatusGroup;
  isHard: boolean;
  daysLeft?: number;
  msLeft?: number;
  quantity?: number;
  unit?: string;
  locationId?: string;
  locationName?: string;
  ruleName?: string;
  /** Cost of what is left, when both the per-unit cost and the quantity are known; otherwise null (unknown). */
  cost: MoneyValue | null;
}

export interface ExpirySummary {
  rows: number;
  /** Rows with a date. */
  withDeadline: number;
  pastHard: number;
  dueToday: number;
  dueSoon: number;
  qualityReview: number;
  needsChecking: number;
  /** Known quantities per unit (units are never converted or added across). */
  quantities: Record<string, number>;
  costTotals: CurrencyTotals;
  unknownCost: number;
}

export interface ExpiryReport { workspaceId: string; generatedAt: number; filter: ExpiryFilter; rows: ExpiryRow[]; summary: ExpirySummary }

function rawDeadline(d?: DeadlineValue): string | undefined {
  if (!d) return undefined;
  return d.precision === 'date' ? d.date : d.precision === 'month' ? d.month : d.at;
}

/** Pure builder (used by buildExpiryRows and tests). */
export function expiryRowsFrom(
  workspaceId: string, batches: Batch[], products: Product[], locations: StorageLocation[],
  filter: ExpiryFilter, now: number, settings: StatusSettings,
): ExpiryReport {
  const pById = new Map(products.filter(p => p.workspaceId === workspaceId).map(p => [p.id, p]));
  const lById = new Map(locations.filter(l => l.workspaceId === workspaceId).map(l => [l.id, l]));
  const mine = batches.filter(b => b.workspaceId === workspaceId && b.status === 'active');
  const rows: ExpiryRow[] = [];
  for (const { batch: b, evaluation: ev } of rankBatches(mine, now, settings)) {
    const product = pById.get(b.productId);
    const group = groupOf(ev.status);
    const deadline = b.effective.dateKind === 'none' ? undefined : b.effective.deadline;
    const day = deadline ? deadlineDate(deadline, b.timeZone) : undefined;
    // Items without a date always need checking; the date range applies only to dated items.
    if (day && filter.from && day < filter.from) continue;
    if (day && filter.to && day > filter.to) continue;
    if (filter.groups?.length && !filter.groups.includes(group)) continue;
    if (filter.kinds?.length && !filter.kinds.includes(b.kind)) continue;
    if (filter.locationId && b.locationId !== filter.locationId) continue;
    if (filter.productId && b.productId !== filter.productId) continue;
    if (filter.categoryId && product?.categoryId !== filter.categoryId) continue;
    const unitCost = unitCostFor(b, product);
    const cost = unitCost && b.quantityRemaining != null ? costOfQuantity(unitCost, b.quantityRemaining) : null;
    rows.push({
      batchId: b.id, productId: b.productId, productName: product?.name ?? b.productName, lot: b.lotNumber, kind: b.kind,
      dateKind: deadline ? b.effective.dateKind : 'none', deadline, deadlineDay: day, deadlineRaw: rawDeadline(deadline), timeZone: b.timeZone,
      reason: b.effective.reason, status: ev.status, group, isHard: ev.isHard, daysLeft: ev.daysLeft, msLeft: ev.msLeft,
      quantity: b.quantityRemaining, unit: unitOf(b, product),
      locationId: b.locationId, locationName: b.locationId ? lById.get(b.locationId)?.name : undefined,
      ruleName: b.appliedRule?.ruleName, cost,
    });
  }
  return { workspaceId, generatedAt: now, filter, rows, summary: summarizeExpiry(rows) };
}

export function summarizeExpiry(rows: ExpiryRow[]): ExpirySummary {
  const s: ExpirySummary = { rows: rows.length, withDeadline: 0, pastHard: 0, dueToday: 0, dueSoon: 0, qualityReview: 0, needsChecking: 0, quantities: {}, costTotals: {}, unknownCost: 0 };
  for (const r of rows) {
    if (r.deadline) s.withDeadline++;
    if (r.group === 'past_hard') s.pastHard++;
    else if (r.group === 'due_today') s.dueToday++;
    else if (r.group === 'due_soon') s.dueSoon++;
    else if (r.group === 'quality_review') s.qualityReview++;
    else if (r.group === 'needs_checking') s.needsChecking++;
    if (r.quantity != null) {
      const u = r.unit ?? '';
      s.quantities[u] = Math.round(((s.quantities[u] ?? 0) + r.quantity) * 1000) / 1000;
    }
    if (!r.cost || !addTo(s.costTotals, r.cost)) s.unknownCost++;
  }
  return s;
}

export async function buildExpiryRows(workspaceId: string, filter: ExpiryFilter = {}, now: number = Date.now(), settings: StatusSettings = getGeneral()): Promise<ExpiryReport> {
  const [batches, products, locations] = await Promise.all([
    listBatches(workspaceId), listProducts(workspaceId, { includeHidden: true }), listLocations(workspaceId, { includeHidden: true }),
  ]);
  return expiryRowsFrom(workspaceId, batches, products, locations, filter, now, settings);
}

// ─── waste report ──────────────────────────────────────────────────────────────

export interface WasteFilter { from?: LocalDate; to?: LocalDate }

export interface WasteRow {
  eventId: string;
  batchId: string;
  productId?: string;
  productName: string;
  lot?: string;
  kind?: BatchKind;
  at: IsoDateTime;
  /** Calendar day of the event in the batch's (workspace) zone. */
  day: LocalDate;
  timeZone: string;
  quantity?: number;
  unit?: string;
  /** A known waste reason code, or 'other' for anything else. */
  reason: WasteReason;
  /** Free text when the stored reason was not a known code. */
  reasonText?: string;
  note?: string;
  locationName?: string;
  /** Cost of the wasted quantity when both the per-unit cost and the quantity are known; otherwise null (unknown). */
  cost: MoneyValue | null;
}

export interface WasteSummary {
  events: number;
  quantities: Record<string, number>;
  costTotals: CurrencyTotals;
  /** Rows whose cost is unknown (never counted as 0). */
  unknownCost: number;
  reasons: Record<WasteReason, number>;
}

export interface WasteReport { workspaceId: string; generatedAt: number; filter: WasteFilter; rows: WasteRow[]; summary: WasteSummary }

export function wasteRowsFrom(
  workspaceId: string, events: BatchEvent[], batches: Batch[], products: Product[],
  locations: StorageLocation[], filter: WasteFilter, fallbackTz: string, now: number = Date.now(),
): WasteReport {
  const bById = new Map(batches.filter(b => b.workspaceId === workspaceId).map(b => [b.id, b]));
  const pById = new Map(products.filter(p => p.workspaceId === workspaceId).map(p => [p.id, p]));
  const lById = new Map(locations.filter(l => l.workspaceId === workspaceId).map(l => [l.id, l]));
  const rows: WasteRow[] = [];
  for (const e of events) {
    if (e.workspaceId !== workspaceId || e.type !== 'wasted') continue;
    const batch = bById.get(e.batchId);
    const tz = batch?.timeZone ?? fallbackTz;
    const ms = Date.parse(e.at);
    if (!Number.isFinite(ms)) continue;
    const day = localDateOf(ms, tz);
    if (filter.from && day < filter.from) continue;
    if (filter.to && day > filter.to) continue;
    const product = batch ? pById.get(batch.productId) : undefined;
    const known = (WASTE_REASONS as readonly string[]).includes(e.reason ?? '');
    // EXP-REV-10: waste cost is the cost SNAPSHOT taken when the waste was recorded, so a later cost change never
    // rewrites history. Events recorded before snapshots existed have no snapshot: their cost is shown as unknown.
    const cost = e.unitCost && e.quantity != null ? costOfQuantity(e.unitCost, e.quantity) : null;
    rows.push({
      eventId: e.id, batchId: e.batchId, productId: batch?.productId, productName: product?.name ?? batch?.productName ?? '',
      lot: batch?.lotNumber, kind: batch?.kind, at: e.at, day, timeZone: tz, quantity: e.quantity,
      unit: batch ? unitOf(batch, product) : undefined,
      reason: known ? (e.reason as WasteReason) : 'other', reasonText: known ? undefined : e.reason,
      note: e.note, locationName: batch?.locationId ? lById.get(batch.locationId)?.name : undefined, cost,
    });
  }
  rows.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.eventId.localeCompare(b.eventId)));
  return { workspaceId, generatedAt: now, filter, rows, summary: summarizeWaste(rows) };
}

export function summarizeWaste(rows: WasteRow[]): WasteSummary {
  const reasons = Object.fromEntries(WASTE_REASONS.map(r => [r, 0])) as Record<WasteReason, number>;
  const s: WasteSummary = { events: rows.length, quantities: {}, costTotals: {}, unknownCost: 0, reasons };
  for (const r of rows) {
    reasons[r.reason]++;
    if (r.quantity != null) {
      const u = r.unit ?? '';
      s.quantities[u] = Math.round(((s.quantities[u] ?? 0) + r.quantity) * 1000) / 1000;
    }
    if (!r.cost || !addTo(s.costTotals, r.cost)) s.unknownCost++;
  }
  return s;
}

export async function buildWasteRows(workspaceId: string, filter: WasteFilter = {}, now: number = Date.now()): Promise<WasteReport> {
  const [events, batches, products, locations, ws] = await Promise.all([
    listEvents(workspaceId), listBatches(workspaceId, { status: 'any' }), listProducts(workspaceId, { includeHidden: true }),
    listLocations(workspaceId, { includeHidden: true }), readRecord<Workspace>(K.workspace(workspaceId)),
  ]);
  return wasteRowsFrom(workspaceId, events, batches, products, locations, filter, ws?.timeZone || 'UTC', now);
}
