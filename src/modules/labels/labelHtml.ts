/**
 * Internal preparation label (§16). A kitchen's own identification label — NOT a compliant retail / PPDS label and
 * no replacement for ingredient, allergen or other legal consumer labelling; every label says so.
 *
 * Every line comes from the stored batch (the same deadline wording as the batch screen, T21) and its snapshotted
 * rule (name, source, storage instruction). Nothing is invented: a missing value is left out, never guessed.
 */
import type { Batch } from '../../domain/expiry/expiryTypes';
import { deadlineLine, formatDeadlineValue } from '../batches/format';
import { escapeHtml } from '../../utils/htmlEscape';
import { wrapPdfHtml } from '../../utils/pdfTemplates';

type T = (k: string, o?: Record<string, unknown>) => string;

export const LABEL_NOTE_MAX = 80;

export interface LabelData {
  batchId: string;
  mark: string;
  productName: string;
  /** "Prepared 24 Sept 2026, 10:00" / "Opened …". */
  timeLine?: string;
  /** Same wording as the batch detail: "Internal cutoff 27 Sept 2026, 10:00". */
  deadlineLine: string;
  /** A second date kept visible, e.g. the original best-before of an opened pack. */
  secondaryLine?: string;
  ruleLine?: string;
  sourceLine?: string;
  storageLine?: string;
  lotLine?: string;
  locationLine?: string;
  noteLine?: string;
  footer: string;
}

/** Only prepared and opened batches get an internal preparation label. */
export function isLabelBatch(b: Pick<Batch, 'kind'>): boolean {
  return b.kind === 'prepared' || b.kind === 'opened';
}

function shortNote(s?: string): string | undefined {
  const v = (s ?? '').replace(/\s+/g, ' ').trim();
  if (!v) return undefined;
  const chars = [...v];
  return chars.length > LABEL_NOTE_MAX ? `${chars.slice(0, LABEL_NOTE_MAX - 1).join('')}…` : v;
}

export function labelData(t: T, b: Batch, locationName?: string): LabelData {
  const at = b.kind === 'prepared' ? b.preparedAt : b.kind === 'opened' ? b.openedAt : undefined;
  const when = at ? formatDeadlineValue({ precision: 'datetime', at }, b.timeZone) : undefined;
  const rule = b.appliedRule;
  return {
    batchId: b.id,
    mark: t('appName'),
    productName: b.productName,
    timeLine: when ? t(b.kind === 'prepared' ? 'label.preparedAt' : 'label.openedAt', { time: when }) : undefined,
    deadlineLine: deadlineLine(t, b.effective, b.timeZone),
    secondaryLine: b.secondary && b.secondary.deadline ? t('label.alsoDate', { line: deadlineLine(t, b.secondary, b.timeZone) }) : undefined,
    ruleLine: rule ? t('label.rule', { name: rule.ruleName }) : t('label.directDeadline'),
    sourceLine: rule?.sourceText ? t('label.source', { source: rule.sourceText }) : undefined,
    storageLine: rule?.storageInstruction ? t('label.storage', { text: rule.storageInstruction }) : undefined,
    lotLine: b.lotNumber ? t('label.lot', { lot: b.lotNumber }) : undefined,
    locationLine: locationName ? t('label.location', { name: locationName }) : undefined,
    noteLine: shortNote(b.notes),
    footer: t('label.notPpds'),
  };
}

const LABEL_CSS = `
  body, .pdf-doc { background: #FFFFFF !important; }
  @media screen { .pdf-doc { background: #FFFFFF; } }
  .labels { display: flex; flex-wrap: wrap; gap: 8mm; }
  .lbl { width: 86mm; border: 1.2px solid #1A2540; border-radius: 6px; padding: 3.5mm 4mm; page-break-inside: avoid; break-inside: avoid; background: #FFFFFF; }
  .lbl-mark { font-family: 'JetBrains Mono','Courier New',monospace; font-size: 8px; letter-spacing: 0.12em; text-transform: uppercase; color: #6B7280; }
  .lbl-name { font-size: 15px; font-weight: 700; color: #111827; margin: 1mm 0 1.5mm; overflow-wrap: anywhere; }
  .lbl-deadline { font-size: 13px; font-weight: 800; color: #111827; border-top: 1px solid #1A2540; border-bottom: 1px solid #1A2540; padding: 1.5mm 0; margin: 1mm 0; }
  .lbl-line { font-size: 10px; color: #1F2937; margin-top: 0.8mm; overflow-wrap: anywhere; }
  .lbl-foot { font-size: 7.5px; color: #4B5563; margin-top: 2mm; border-top: 1px dashed #9CA3AF; padding-top: 1.2mm; }
`;

export function labelCardHtml(d: LabelData): string {
  const line = (s?: string, cls = 'lbl-line') => (s ? `<div class="${cls}">${escapeHtml(s)}</div>` : '');
  return `<div class="lbl" data-batch="${escapeHtml(d.batchId)}">
${line(d.mark, 'lbl-mark')}
${line(d.productName, 'lbl-name')}
${line(d.timeLine)}
${line(d.deadlineLine, 'lbl-deadline')}
${line(d.secondaryLine)}
${line(d.ruleLine)}
${line(d.sourceLine)}
${line(d.storageLine)}
${line(d.lotLine)}
${line(d.locationLine)}
${line(d.noteLine)}
${line(d.footer, 'lbl-foot')}
</div>`;
}

/** An A4 sheet of labels (one label for a single batch). */
export function buildLabelsHtml(labels: LabelData[]): string {
  return wrapPdfHtml(`<div class="labels">${labels.map(labelCardHtml).join('\n')}</div>`, LABEL_CSS);
}
