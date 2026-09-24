/**
 * csvFile.ts — write + share a CSV file.
 *
 * Row-building lives in each domain (single source of truth for columns).
 */
import { toCsv } from './csv';
import { writeTextFile } from '../storage/fileUtils';
import i18n from '../i18n';
import * as Sharing from 'expo-sharing';

type Cell = string | number | null | undefined;

// Excel/Sheets open £ and accented characters correctly only with a UTF-8 BOM.
const BOM = String.fromCharCode(0xFEFF);

/** Write CSV rows to a `.csv` file (BOM-prefixed). Returns the file URI. */
export async function writeCsvFile(fileName: string, rows: Cell[][]): Promise<string> {
  const name = /\.csv$/i.test(fileName) ? fileName : `${fileName}.csv`;
  return writeTextFile(name, BOM + toCsv(rows));
}

/**
 * Share a CSV file through the OS share sheet. Returns false when sharing isn't
 * available on the device (the caller surfaces its own message in that case).
 */
export async function shareCsvFile(uri: string, dialogTitle: string): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(uri, {
    mimeType: 'text/csv',
    dialogTitle,
    UTI: 'public.comma-separated-values-text',
  });
  return true;
}

/**
 * On-screen CSV preview — renders the header + rows as a plain table in a
 * self-contained HTML document for the WebView.
 */
export function buildCsvPreviewHtml(rows: Cell[][], emptyText?: string): string {
  const empty = emptyText ?? i18n.t('common.noData', { defaultValue: 'No data for this period' });
  const language = (i18n.resolvedLanguage || i18n.language || 'en').split('-')[0];
  const direction = language === 'ar' ? 'rtl' : 'ltr';
  const textAlign = direction === 'rtl' ? 'right' : 'left';
  const e = (v: Cell): string => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  if (!rows || rows.length <= 1) {
    return `<!DOCTYPE html><html lang="${language}" dir="${direction}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;font-family:-apple-system,Roboto,sans-serif;padding:28px;color:#6B7280;font-size:14px;text-align:${textAlign};">${e(empty)}</body></html>`;
  }
  const [header, ...data] = rows;
  const thead = `<tr>${header.map(c => `<th style="text-align:${textAlign};padding:7px 11px;background:#1A2540;color:#fff;font-size:12px;font-weight:700;white-space:nowrap;position:sticky;top:0;">${e(c)}</th>`).join('')}</tr>`;
  const tbody = data.map((r, i) => `<tr style="background:${i % 2 ? '#F5F6F8' : '#fff'};">${r.map(c => `<td style="text-align:${textAlign};padding:7px 11px;font-size:12px;color:#1A2540;border-bottom:1px solid #E5E7EB;white-space:nowrap;">${e(c)}</td>`).join('')}</tr>`).join('');
  return `<!DOCTYPE html><html lang="${language}" dir="${direction}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;font-family:-apple-system,Roboto,sans-serif;background:#fff;direction:${direction};">
<div style="padding:11px 14px;background:#FAF3DE;border-bottom:1px solid #D9CDB4;font-size:13px;font-weight:700;color:#1A2540;">${e(i18n.t('common.csvPreviewBanner', { count: data.length, defaultValue: '{{count}} rows' }))}</div>
<div style="overflow-x:auto;"><table style="border-collapse:collapse;width:100%;">${thead}${tbody}</table></div>
</body></html>`;
}
