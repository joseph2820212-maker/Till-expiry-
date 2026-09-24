/**
 * PDF export of a report: HTML from pdfTemplates (the same table cells as the CSV, reportTable.ts) printed to a real
 * PDF file by the native pipeline. The preview screen shows that exact file and shares that exact file.
 */
import * as Sharing from 'expo-sharing';
import { buildCallout, buildPageFooter, buildPageHeader, buildSectionH, buildSummaryCard, buildTable, wrapPdfHtml } from '../../utils/pdfTemplates';
import { printHtmlToPdfFile } from '../../utils/pdfFile';
import { PAGE_SIZES } from '../../utils/pdfPageSizes';
import { escapeHtml } from '../../utils/htmlEscape';
import type { ExpiryReport, WasteReport } from './reportRows';
import { quantityText, totalsText, type T } from './reportTable';
import { reportFileName, tableFor, type ReportKind } from './reportCsv';

export interface ReportMeta {
  workspaceName: string;
  /** "Deadlines up to 1 Oct 2026" / "24 Aug 2026 – 24 Sept 2026". */
  periodText: string;
  /** "Generated 24 Sept 2026, 14:05". */
  generatedText: string;
}

function card(label: string, value: string, variant?: 'green' | 'orange' | 'red'): string {
  return buildSummaryCard(label, escapeHtml(value), false, variant);
}

function quantitiesText(t: T, q: Record<string, number>): string {
  const parts = Object.keys(q).sort().map(u => quantityText(t, q[u], u || undefined));
  return parts.length ? parts.join(' · ') : '—';
}

function costSummary(t: T, totals: Record<string, number>, unknown: number): string {
  const known = totalsText(totals);
  const parts = [known || t('reports.noKnownCost')];
  if (unknown > 0) parts.push(t('reports.unknownCostCount', { count: unknown }));
  return parts.join(' · ');
}

export function buildReportHtml(t: T, kind: ReportKind, report: ExpiryReport | WasteReport, meta: ReportMeta): string {
  const title = kind === 'expiry' ? t('reports.expiryTitle') : t('reports.wasteTitle');
  const table = tableFor(t, kind, report);
  let cards: string;
  let note: string;
  if (kind === 'expiry') {
    const s = (report as ExpiryReport).summary;
    cards = `<div class="c3">${[
      card(t('reports.metric.rows'), String(s.rows)),
      card(t('reports.metric.pastHard'), String(s.pastHard), s.pastHard ? 'red' : undefined),
      card(t('reports.metric.dueSoon'), String(s.dueToday + s.dueSoon), s.dueToday + s.dueSoon ? 'orange' : undefined),
      card(t('reports.metric.qualityReview'), String(s.qualityReview)),
      card(t('reports.metric.needsChecking'), String(s.needsChecking)),
      card(t('reports.metric.quantities'), quantitiesText(t, s.quantities)),
    ].join('')}</div>`;
    note = `${buildCallout(`${t('reports.metric.costAtRisk')}: ${costSummary(t, s.costTotals, s.unknownCost)}`)}${buildCallout(t('reports.expiryNote'))}`;
  } else {
    const s = (report as WasteReport).summary;
    const reasons = (Object.keys(s.reasons) as (keyof typeof s.reasons)[]).filter(r => s.reasons[r] > 0).map(r => `${t(`wasteReason.${r}`)}: ${s.reasons[r]}`).join(' · ');
    cards = `<div class="c3">${[
      card(t('reports.metric.wasteEvents'), String(s.events)),
      card(t('reports.metric.quantities'), quantitiesText(t, s.quantities)),
      card(t('reports.metric.knownCost'), totalsText(s.costTotals) || t('reports.noKnownCost')),
    ].join('')}</div>`;
    note = `${buildCallout(`${t('reports.metric.unknownCost')}: ${s.unknownCost}`)}${reasons ? buildCallout(`${t('reports.byReason')}: ${reasons}`) : ''}${buildCallout(t('reports.wasteNote'))}`;
  }
  const body = table.body.length
    ? buildTable(table.header, table.body, [])
    : buildCallout(t('reports.emptyRows'));
  const html = `
${buildPageHeader(title, meta.periodText, meta.workspaceName)}
${cards}
${note}
${buildSectionH(t('reports.rowsTitle'), t('reports.rowCount', { count: table.body.length }))}
${body}
${buildPageFooter(meta.generatedText, '', '')}`;
  return wrapPdfHtml(html, '.t td, .t th { font-size: 9px; padding: 6px 7px; }');
}

/** Print the HTML to a real PDF file in app storage. */
export async function writeReportPdf(html: string, kind: ReportKind, day: string): Promise<{ uri: string; fileName: string }> {
  const fileName = reportFileName(kind, day, 'pdf');
  const uri = await printHtmlToPdfFile(html, fileName, PAGE_SIZES.a4);
  return { uri, fileName };
}

/** Share a PDF file. Returns false when the device has no share sheet. A cancelled share is not reported as success. */
export async function sharePdfFile(uri: string, dialogTitle: string): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle });
  return true;
}
