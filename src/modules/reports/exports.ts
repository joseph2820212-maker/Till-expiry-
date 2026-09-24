/**
 * Files the shop can take away: the date list and history as CSV, and a printable date-check sheet (PDF) to walk
 * the shelves with a pen. Row builders are pure (tested); writing and sharing go through the family file helpers.
 */
import * as Sharing from 'expo-sharing';
import i18n from '../../i18n';
import type { DateBatch, Product } from '../../domain/types';
import { bandFor, currentReduction, remainingQuantity, alertDaysFor, byDateThenSafety } from '../../domain/expiry';
import { daysBetween, todayLocal } from '../../domain/dates';
import { toDecimalString } from '../../domain/money';
import { escapeHtml } from '../../utils/htmlEscape';
import { writeCsvFile, shareCsvFile } from '../../utils/csvFile';
import { printHtmlToPdfFile } from '../../utils/pdfFile';
import { APP_NAME } from '../../appMeta';

type Cell = string | number | null | undefined;
type T = (k: string, o?: Record<string, unknown>) => string;

export function openDatesRows(batches: DateBatch[], products: Product[], today: string, shopAlertDays: number, t: T): Cell[][] {
  const byId = new Map(products.map(p => [p.id, p]));
  const header = ['product', 'barcode', 'sku', 'date', 'dateType', 'daysLeft', 'status', 'quantityLeft', 'location', 'reducedPrice', 'currency', 'note'].map(k => t(`export.col.${k}`));
  const rows = batches.filter(b => b.status === 'open').sort(byDateThenSafety).map(b => {
    const p = byId.get(b.productId);
    const red = currentReduction(b)?.price;
    return [
      p?.name ?? b.productName, p?.barcodes?.[0]?.raw ?? '', p?.sku ?? '', b.date, t(`dateType.${b.dateType}`), daysBetween(today, b.date),
      t(`band.${bandFor(b.date, today, alertDaysFor(p, shopAlertDays))}`), remainingQuantity(b) ?? '', b.location ?? p?.shelfLocation ?? '',
      red ? toDecimalString(red) : '', red?.currency ?? '', b.note ?? '',
    ];
  });
  return [header, ...rows];
}

export function historyRows(batches: DateBatch[], products: Product[], t: T): Cell[][] {
  const byId = new Map(products.map(p => [p.id, p]));
  const header = ['eventDate', 'product', 'barcode', 'date', 'dateType', 'action', 'quantity', 'reason', 'price', 'currency', 'note'].map(k => t(`export.col.${k}`));
  const rows: Cell[][] = [];
  for (const b of batches) for (const e of b.events) {
    const p = byId.get(b.productId);
    rows.push([e.on, p?.name ?? b.productName, p?.barcodes?.[0]?.raw ?? '', b.date, t(`dateType.${b.dateType}`), t(`event.${e.kind}`), e.quantity ?? '', e.reason ? t(`wasteReason.${e.reason}`) : '', e.price ? toDecimalString(e.price) : '', e.price?.currency ?? '', e.note ?? '']);
  }
  rows.sort((a, b) => String(b[0]).localeCompare(String(a[0])));
  return [header, ...rows];
}

function stamp(): string {
  return todayLocal().replace(/-/g, '');
}

export async function shareOpenDatesCsv(batches: DateBatch[], products: Product[], shopAlertDays: number): Promise<boolean> {
  const uri = await writeCsvFile(`TillExpiry_Dates_${stamp()}.csv`, openDatesRows(batches, products, todayLocal(), shopAlertDays, i18n.t.bind(i18n) as T));
  return shareCsvFile(uri, i18n.t('export.datesCsv'));
}

export async function shareHistoryCsv(batches: DateBatch[], products: Product[]): Promise<boolean> {
  const uri = await writeCsvFile(`TillExpiry_History_${stamp()}.csv`, historyRows(batches, products, i18n.t.bind(i18n) as T));
  return shareCsvFile(uri, i18n.t('export.historyCsv'));
}

/**
 * The date-check sheet: every open date up to `throughDays` ahead (plus everything expired), grouped by shelf
 * location, with empty boxes to tick by hand. A4 portrait; Arabic sheets are right-to-left.
 */
export function checkSheetHtml(batches: DateBatch[], products: Product[], today: string, throughDays: number, shopAlertDays: number, t: T, rtl: boolean): string {
  const byId = new Map(products.map(p => [p.id, p]));
  const due = batches.filter(b => b.status === 'open' && daysBetween(today, b.date) <= throughDays).sort(byDateThenSafety);
  const groups = new Map<string, DateBatch[]>();
  for (const b of due) {
    const loc = b.location || byId.get(b.productId)?.shelfLocation || t('checkSheet.noLocation');
    groups.set(loc, [...(groups.get(loc) ?? []), b]);
  }
  const sections = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([loc, list]) => `
    <h2>${escapeHtml(loc)}</h2>
    <table><thead><tr><th class="box"></th><th>${escapeHtml(t('export.col.product'))}</th><th>${escapeHtml(t('export.col.date'))}</th><th>${escapeHtml(t('export.col.dateType'))}</th><th>${escapeHtml(t('export.col.status'))}</th><th>${escapeHtml(t('export.col.quantityLeft'))}</th><th>${escapeHtml(t('checkSheet.action'))}</th></tr></thead>
    <tbody>${list.map(b => {
      const p = byId.get(b.productId);
      const band = bandFor(b.date, today, alertDaysFor(p, shopAlertDays));
      return `<tr class="${band}"><td class="box">☐</td><td>${escapeHtml(p?.name ?? b.productName)}${p?.barcodes?.[0] ? `<div class="sub">${escapeHtml(p.barcodes[0].raw)}</div>` : ''}</td><td class="num">${escapeHtml(b.date)}</td><td>${escapeHtml(t(`dateType.${b.dateType}`))}</td><td>${escapeHtml(t(`band.${band}`))}</td><td class="num">${remainingQuantity(b) ?? ''}</td><td></td></tr>`;
    }).join('')}</tbody></table>`).join('');
  return `<!DOCTYPE html><html dir="${rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><style>
    @page { margin: 12mm; }
    body { font-family: -apple-system, Roboto, 'Noto Sans', 'Noto Sans Arabic', sans-serif; color: #1A2540; font-size: 10.5pt; }
    h1 { font-size: 16pt; margin: 0 0 2mm; } .meta { color: #555; margin-bottom: 5mm; }
    h2 { font-size: 12pt; margin: 6mm 0 2mm; border-bottom: 1px solid #1A2540; padding-bottom: 1mm; }
    table { width: 100%; border-collapse: collapse; } th, td { border-bottom: 0.5px solid #bbb; padding: 1.8mm 1.5mm; text-align: start; vertical-align: top; }
    th { font-size: 9pt; color: #555; } .num { font-variant-numeric: tabular-nums; white-space: nowrap; direction: ltr; }
    .box { width: 7mm; font-size: 13pt; } .sub { color: #666; font-size: 8.5pt; }
    tr.expired td { background: #FBE3E1; } tr.today td { background: #FDEBD6; }
    .empty { margin-top: 10mm; color: #555; }
  </style></head><body>
    <h1>${escapeHtml(t('checkSheet.title'))}</h1>
    <div class="meta">${escapeHtml(APP_NAME)} · ${escapeHtml(t('checkSheet.meta', { date: today, days: throughDays, count: due.length }))}</div>
    ${due.length ? sections : `<p class="empty">${escapeHtml(t('checkSheet.empty'))}</p>`}
  </body></html>`;
}

const A4 = { width: 595, height: 842 };

export async function shareCheckSheetPdf(batches: DateBatch[], products: Product[], throughDays: number, shopAlertDays: number): Promise<boolean> {
  const today = todayLocal();
  const html = checkSheetHtml(batches, products, today, throughDays, shopAlertDays, i18n.t.bind(i18n) as T, String(i18n.language).startsWith('ar'));
  const uri = await printHtmlToPdfFile(html, `TillExpiry_Check_${stamp()}.pdf`, A4, { temporary: true });
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: i18n.t('checkSheet.title'), UTI: 'com.adobe.pdf' });
  return true;
}
