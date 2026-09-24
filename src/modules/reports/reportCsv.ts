/**
 * CSV export of a report — the same header and cells as the PDF table and the screen list (reportTable.ts).
 * The file is written with real bytes and shared through the OS sheet; the caller never reports a cancelled share as
 * a success (expo-sharing cannot tell, so no "exported" message is shown at all).
 */
import { toCsv } from '../../utils/csv';
import { shareCsvFile, writeCsvFile } from '../../utils/csvFile';
import type { ExpiryReport, WasteReport } from './reportRows';
import { expiryTable, wasteTable, type ReportTable, type T } from './reportTable';

export type ReportKind = 'expiry' | 'waste';

export function tableFor(t: T, kind: ReportKind, report: ExpiryReport | WasteReport): ReportTable {
  return kind === 'expiry' ? expiryTable(t, (report as ExpiryReport).rows) : wasteTable(t, (report as WasteReport).rows);
}

/** Header + body as CSV cells. */
export function reportCsvRows(t: T, kind: ReportKind, report: ExpiryReport | WasteReport): string[][] {
  const table = tableFor(t, kind, report);
  return [table.header, ...table.body];
}

export function reportCsvText(t: T, kind: ReportKind, report: ExpiryReport | WasteReport): string {
  return toCsv(reportCsvRows(t, kind, report));
}

/** ASCII-only file name: never contains the business name, a path separator or a non-Latin character. */
export function reportFileName(kind: ReportKind, day: string, ext: 'csv' | 'pdf'): string {
  const safeDay = day.replace(/[^0-9-]/g, '').slice(0, 10) || 'report';
  return `TillExpiry_${kind === 'expiry' ? 'ExpiryReport' : 'WasteReport'}_${safeDay}.${ext}`;
}

export async function writeReportCsv(t: T, kind: ReportKind, report: ExpiryReport | WasteReport, day: string): Promise<string> {
  return writeCsvFile(reportFileName(kind, day, 'csv'), reportCsvRows(t, kind, report));
}

/** Returns false when the device has no share sheet. */
export async function shareReportCsv(uri: string, dialogTitle: string): Promise<boolean> {
  return shareCsvFile(uri, dialogTitle);
}
