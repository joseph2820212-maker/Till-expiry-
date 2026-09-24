/**
 * CSV export of the active workspace's products and batches (§18.3, §19).
 *
 * - Built from normalised rows (header + cells) that the on-screen preview and the shared file both use, so the
 *   preview always shows exactly what is shared.
 * - Cells go through utils/csv.csvCell: a text cell starting with = + - @ is prefixed with ' so a spreadsheet never runs
 *   it as a formula (CSV injection). The importer undoes that prefix, so an export re-imports unchanged.
 * - Money is written exactly from integer minor units with its own currency code ("1.50", "GBP"); unknown cost is an
 *   empty cell, never 0.
 * - Column names are the ones the importer recognises, so an export can be imported into another workspace.
 */
import type { Batch, BusinessListItem, DeadlineValue, MoneyValue, Product, StorageLocation, Workspace } from '../../domain/expiry/expiryTypes';
import { ownDeadline } from '../../domain/expiry/deadlineEngine';
import { todayIn } from '../../domain/expiry/datePrecision';
import { moneyFromMinor, toDecimalString } from '../../domain/money';
import { listRecords } from '../../storage/entityStore';
import { listBatches } from '../batches/batchStore';
import { writeCsvFile } from '../../utils/csvFile';

export type ExportKind = 'products' | 'batches';
export type Cell = string | number | null | undefined;

export interface ExportOptions {
  /** Include hidden products / completed and archived batches. */
  includeArchived: boolean;
}

export const PRODUCT_EXPORT_COLUMNS = [
  'name', 'barcode', 'barcode_role', 'sku', 'category', 'supplier', 'tracking_unit', 'cost', 'selling_price', 'currency',
  'default_location', 'default_date_kind', 'notes', 'status',
] as const;

export const BATCH_EXPORT_COLUMNS = [
  'product', 'barcode', 'sku', 'lot', 'quantity', 'quantity_initial', 'quantity_unit', 'date_kind', 'date',
  'effective_date_kind', 'effective_deadline', 'deadline_reason', 'location', 'batch_kind', 'received_at', 'opened_at',
  'prepared_at', 'status', 'notes',
] as const;

export interface ExportData {
  workspace: Workspace;
  products: Product[];
  batches: Batch[];
  locations: StorageLocation[];
  lists: BusinessListItem[];
}

export async function loadExportData(workspace: Workspace): Promise<ExportData> {
  const [products, batches, locations, lists] = await Promise.all([
    listRecords<Product>('products', workspace.id).then(r => r.items.filter(p => p.workspaceId === workspace.id)),
    listBatches(workspace.id, { status: 'any' }),
    listRecords<StorageLocation>('locations', workspace.id).then(r => r.items.filter(l => l.workspaceId === workspace.id)),
    listRecords<BusinessListItem>('lists', workspace.id).then(r => r.items.filter(l => l.workspaceId === workspace.id)),
  ]);
  return { workspace, products, batches: batches.filter(b => b.workspaceId === workspace.id), locations, lists };
}

/** Exact decimal text of a money value ("1.50", "1250", "0.250"). */
export function moneyCell(m: MoneyValue | undefined): string {
  return m ? toDecimalString(moneyFromMinor(m.minor, m.currency)) : '';
}

/** A deadline as the importer reads it back: YYYY-MM-DD, YYYY-MM (month-only) or an ISO time with its offset. */
export function deadlineCell(d: DeadlineValue | undefined): string {
  if (!d) return '';
  return d.precision === 'date' ? d.date : d.precision === 'month' ? d.month : d.at;
}

const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name);

export function productExportRows(data: ExportData, opts: ExportOptions): Cell[][] {
  const list = new Map(data.lists.map(l => [l.id, l.name]));
  const loc = new Map(data.locations.map(l => [l.id, l.name]));
  const rows: Cell[][] = [[...PRODUCT_EXPORT_COLUMNS]];
  const products = data.products.filter(p => opts.includeArchived || p.status === 'active').sort(byName);
  for (const p of products) {
    const currencies = [...new Set([p.costPerTrackingUnit?.currency, p.sellingPrice?.currency].filter(Boolean))];
    rows.push([
      p.name,
      p.barcodes.map(b => b.code).join('|'),
      p.barcodes[0]?.role ?? '',
      p.sku ?? '',
      p.categoryId ? list.get(p.categoryId) ?? '' : '',
      p.supplierId ? list.get(p.supplierId) ?? '' : '',
      p.trackingUnit === 'custom' ? p.customUnitLabel ?? 'custom' : p.trackingUnit,
      moneyCell(p.costPerTrackingUnit),
      moneyCell(p.sellingPrice),
      currencies.join('|'),
      p.defaultLocationId ? loc.get(p.defaultLocationId) ?? '' : '',
      p.defaultDateKind ?? '',
      p.notes ?? '',
      p.status,
    ]);
  }
  return rows;
}

export function batchExportRows(data: ExportData, opts: ExportOptions): Cell[][] {
  const products = new Map(data.products.map(p => [p.id, p]));
  const loc = new Map(data.locations.map(l => [l.id, l.name]));
  const rows: Cell[][] = [[...BATCH_EXPORT_COLUMNS]];
  const batches = data.batches
    .filter(b => opts.includeArchived || b.status === 'active')
    .sort((a, b) => a.productName.localeCompare(b.productName) || deadlineCell(ownDeadline(a)).localeCompare(deadlineCell(ownDeadline(b))) || a.createdAt.localeCompare(b.createdAt));
  for (const b of batches) {
    const p = products.get(b.productId);
    rows.push([
      p?.name ?? b.productName,
      p?.barcodes[0]?.code ?? '',
      p?.sku ?? '',
      b.lotNumber ?? '',
      b.quantityRemaining,
      b.quantityInitial,
      b.quantityUnit ?? '',
      b.dateKind,
      deadlineCell(ownDeadline(b)),
      b.effective.dateKind,
      deadlineCell(b.effective.deadline),
      b.effective.reason,
      b.locationId ? loc.get(b.locationId) ?? '' : '',
      b.kind,
      b.receivedAt ?? '',
      b.openedAt ?? '',
      b.preparedAt ?? '',
      b.status,
      b.notes ?? '',
    ]);
  }
  return rows;
}

export function exportRows(kind: ExportKind, data: ExportData, opts: ExportOptions): Cell[][] {
  return kind === 'products' ? productExportRows(data, opts) : batchExportRows(data, opts);
}

/** "tillexpiry-batches-corner-shop-2026-09-24.csv" (letters, digits and dashes only). */
export function exportFileName(kind: ExportKind, workspace: Workspace, now: number = Date.now()): string {
  const ws = workspace.name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'workspace';
  return `tillexpiry-${kind}-${ws}-${todayIn(workspace.timeZone, now)}.csv`;
}

/** Write the same rows the preview showed to a real .csv file (UTF-8 with BOM). Returns the file URI. */
export async function writeExportFile(kind: ExportKind, workspace: Workspace, rows: Cell[][]): Promise<string> {
  return writeCsvFile(exportFileName(kind, workspace), rows);
}
