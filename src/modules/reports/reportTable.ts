/**
 * The one text rendering of report rows. The screen list, the CSV file and the PDF table all call these functions on
 * the same normalized rows, so what is previewed is exactly what is shared (§18.3, T54).
 *
 * Money cells are exact decimal strings from integer minor units ("4.49", "1250", "1.250") with the ISO code in its own
 * column; an unknown cost is written as the translated word "Unknown" — never 0.
 */
import type { MoneyValue } from '../../domain/expiry/expiryTypes';
import { TRACKING_UNITS } from '../../domain/expiry/expiryTypes';
import { localDateOf, localTimeOf } from '../../domain/expiry/datePrecision';
import { deadlineLine, statusLabel } from '../batches/format';
import { minorUnitsFor } from '../../utils/currencyUnits';
import { localDateShort } from '../../utils/locale';
import type { CurrencyTotals, ExpiryRow, WasteRow } from './reportRows';

export type T = (k: string, o?: Record<string, unknown>) => string;

export interface ReportTable { header: string[]; body: string[][] }

/** Exact decimal text of a minor-unit amount (no floats). */
export function minorToDecimal(minor: number, currency: string): string {
  const exp = minorUnitsFor(currency);
  const neg = minor < 0;
  const s = String(Math.abs(minor));
  if (exp === 0) return `${neg ? '-' : ''}${s}`;
  const padded = s.padStart(exp + 1, '0');
  return `${neg ? '-' : ''}${padded.slice(0, -exp)}.${padded.slice(-exp)}`;
}

/** "GBP 12.40 · EUR 3.00" — one amount per currency, never summed across. */
export function totalsText(totals: CurrencyTotals): string {
  return Object.keys(totals).sort().map(c => `${minorToDecimal(totals[c], c)} ${c}`).join(' · ');
}

export function unitText(t: T, unit?: string): string {
  if (!unit) return '';
  return (TRACKING_UNITS as readonly string[]).includes(unit) ? t(`unit.${unit}`) : unit;
}

export function quantityText(t: T, quantity?: number, unit?: string): string {
  if (quantity == null) return '';
  const u = unitText(t, unit);
  return u ? `${quantity} ${u}` : String(quantity);
}

function costCells(t: T, cost: MoneyValue | null): [string, string] {
  return cost ? [minorToDecimal(cost.minor, cost.currency), cost.currency] : [t('reports.unknownCost'), ''];
}

export function expiryCells(t: T, r: ExpiryRow): string[] {
  const deadline = deadlineLine(t, { dateKind: r.dateKind, deadline: r.deadline, reason: r.reason }, r.timeZone);
  const status = statusLabel(t, { status: r.status, isHard: r.isHard, daysLeft: r.daysLeft, msLeft: r.msLeft }, r.dateKind);
  return [
    r.productName,
    r.lot ?? '',
    t(`batchKind.${r.kind}`),
    deadline,
    r.deadlineRaw ?? '',
    status,
    quantityText(t, r.quantity, r.unit),
    r.locationName ?? '',
    ...costCells(t, r.cost),
  ];
}

export function expiryTable(t: T, rows: ExpiryRow[]): ReportTable {
  return {
    header: [
      t('reports.col.product'), t('reports.col.lot'), t('reports.col.kind'), t('reports.col.deadline'), t('reports.col.deadlineValue'),
      t('reports.col.status'), t('reports.col.quantity'), t('reports.col.location'), t('reports.col.cost'), t('reports.col.currency'),
    ],
    body: rows.map(r => expiryCells(t, r)),
  };
}

export function wasteDateText(r: Pick<WasteRow, 'at' | 'timeZone'>): string {
  const ms = Date.parse(r.at);
  return `${localDateShort(localDateOf(ms, r.timeZone))}, ${localTimeOf(ms, r.timeZone)}`;
}

export function wasteReasonText(t: T, r: Pick<WasteRow, 'reason' | 'reasonText'>): string {
  return r.reasonText ? r.reasonText : t(`wasteReason.${r.reason}`);
}

export function wasteCells(t: T, r: WasteRow): string[] {
  return [
    wasteDateText(r),
    r.productName,
    r.lot ?? '',
    quantityText(t, r.quantity, r.unit) || t('reports.quantityNotRecorded'),
    wasteReasonText(t, r),
    r.note ?? '',
    ...costCells(t, r.cost),
  ];
}

export function wasteTable(t: T, rows: WasteRow[]): ReportTable {
  return {
    header: [
      t('reports.col.date'), t('reports.col.product'), t('reports.col.lot'), t('reports.col.quantity'), t('reports.col.reason'),
      t('reports.col.note'), t('reports.col.cost'), t('reports.col.currency'),
    ],
    body: rows.map(r => wasteCells(t, r)),
  };
}
