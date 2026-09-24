/** Master handoff §18 / §31 — report rows, isolation, unknown cost, CSV = PDF = screen rows. Real storage layer. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Print from 'expo-print';
import { createWorkspace, __resetWorkspaceCache } from '../../workspaces/workspaceStore';
import { saveProduct } from '../../products/productStore';
import { saveLocation } from '../../locations/locationStore';
import { createDatedBatch, recordRemoval } from '../../batches/batchStore';
import { DEFAULT_STATUS_SETTINGS as S } from '../../../domain/expiry/expiryTypes';
import { buildExpiryRows, buildWasteRows, costOfQuantity } from '../reportRows';
import { expiryCells, expiryTable, minorToDecimal, wasteTable } from '../reportTable';
import { reportCsvRows, reportCsvText, reportFileName } from '../reportCsv';
import { buildReportHtml, writeReportPdf } from '../reportPdf';
import { toCsv } from '../../../utils/csv';

const t = (k: string, o?: Record<string, unknown>) => (o && Object.keys(o).length ? `${k}(${Object.entries(o).map(([a, b]) => `${a}=${b}`).join(',')})` : k);
const NOW = Date.parse('2026-09-24T12:00:00Z');
const meta = { workspaceName: 'Corner Shop', periodText: 'period', generatedText: 'generated' };

beforeEach(() => { (AsyncStorage as any).clear(); __resetWorkspaceCache(); });

async function ws(name: string) {
  return createWorkspace({ name, mode: 'mixed', currency: 'GBP', timeZone: 'Europe/London' });
}

function htmlCells(html: string): string[][] {
  const body = html.split('<tbody>')[1]?.split('</tbody>')[0] ?? '';
  const unesc = (s: string) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  return body.split('</tr>').filter(r => r.includes('<td')).map(r => [...r.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => unesc(m[1])));
}

describe('exact cost', () => {
  it('cost × quantity is exact in minor units, rounded half-up once', () => {
    expect(costOfQuantity({ minor: 149, currency: 'GBP' }, 3)).toEqual({ minor: 447, currency: 'GBP' });
    expect(costOfQuantity({ minor: 149, currency: 'GBP' }, 0.5)).toEqual({ minor: 75, currency: 'GBP' }); // 74.5 → 75
    expect(costOfQuantity({ minor: 10, currency: 'GBP' }, 0.1 + 0.2)).toEqual({ minor: 3, currency: 'GBP' });
    expect(costOfQuantity({ minor: 1250, currency: 'KWD' }, 0.333)).toEqual({ minor: 416, currency: 'KWD' });
    expect(minorToDecimal(1250, 'KWD')).toBe('1.250');
    expect(minorToDecimal(1250, 'JPY')).toBe('1250');
    expect(minorToDecimal(5, 'GBP')).toBe('0.05');
  });
});

describe('expiry report', () => {
  it('T29 report rows are isolated by workspace', async () => {
    const a = await ws('Shop A');
    const b = await ws('Shop B');
    await createDatedBatch({ workspaceId: a.id, kind: 'bought_in', newProduct: { name: 'Milk A' }, dateKind: 'use_by', deadline: { precision: 'date', date: '2026-09-25' }, quantity: 2 });
    const bb = await createDatedBatch({ workspaceId: b.id, kind: 'bought_in', newProduct: { name: 'Milk B' }, dateKind: 'use_by', deadline: { precision: 'date', date: '2026-09-25' }, quantity: 2 });
    await recordRemoval(b.id, bb.id, 'wasted', { quantity: 1, reason: 'damaged' });
    const ra = await buildExpiryRows(a.id, {}, NOW, S);
    expect(ra.rows.map(r => r.productName)).toEqual(['Milk A']);
    const wa = await buildWasteRows(a.id, {}, NOW);
    expect(wa.rows).toEqual([]);
    const wb = await buildWasteRows(b.id, {}, NOW);
    expect(wb.rows.map(r => r.productName)).toEqual(['Milk B']);
    expect((await buildExpiryRows(b.id, {}, NOW, S)).rows.every(r => r.productName === 'Milk B')).toBe(true);
  });

  it('rows are ranked by urgency, keep month precision, include undated items as needs checking, and filter by range / location / kind', async () => {
    const w = await ws('Shop');
    const fridge = await saveLocation(w.id, { name: 'Fridge 1', kind: 'fridge' });
    const cheese = await saveProduct(w.id, { name: 'Cheese', costPerTrackingUnit: { minor: 250, currency: 'GBP' } });
    await createDatedBatch({ workspaceId: w.id, kind: 'bought_in', productId: cheese.id, dateKind: 'use_by', deadline: { precision: 'date', date: '2026-09-23' }, quantity: 2, locationId: fridge.id });
    await createDatedBatch({ workspaceId: w.id, kind: 'bought_in', newProduct: { name: 'Rice' }, dateKind: 'best_before', deadline: { precision: 'month', month: '2026-12' } });
    await createDatedBatch({ workspaceId: w.id, kind: 'other', newProduct: { name: 'Mystery jar' }, dateKind: 'none' });
    await createDatedBatch({ workspaceId: w.id, kind: 'bought_in', newProduct: { name: 'Yoghurt' }, dateKind: 'use_by', deadline: { precision: 'date', date: '2026-09-26' }, quantity: 4 });
    const all = await buildExpiryRows(w.id, {}, NOW, S);
    expect(all.rows.map(r => r.productName)).toEqual(['Cheese', 'Mystery jar', 'Yoghurt', 'Rice']);
    expect(all.rows[0]).toMatchObject({ status: 'past_deadline', group: 'past_hard', locationName: 'Fridge 1', cost: { minor: 500, currency: 'GBP' } });
    expect(all.rows[1]).toMatchObject({ status: 'unknown', group: 'needs_checking', cost: null });
    expect(all.rows[3]).toMatchObject({ deadline: { precision: 'month', month: '2026-12' }, deadlineRaw: '2026-12', group: 'later' });
    expect(all.summary).toMatchObject({ rows: 4, pastHard: 1, needsChecking: 1, dueSoon: 1, costTotals: { GBP: 500 }, unknownCost: 3 });

    const week = await buildExpiryRows(w.id, { to: '2026-10-01' }, NOW, S);
    expect(week.rows.map(r => r.productName)).toEqual(['Cheese', 'Mystery jar', 'Yoghurt']); // undated always kept; month end is later
    expect((await buildExpiryRows(w.id, { locationId: fridge.id }, NOW, S)).rows.map(r => r.productName)).toEqual(['Cheese']);
    expect((await buildExpiryRows(w.id, { kinds: ['other'] }, NOW, S)).rows.map(r => r.productName)).toEqual(['Mystery jar']);
    expect((await buildExpiryRows(w.id, { groups: ['past_hard'] }, NOW, S)).rows.map(r => r.productName)).toEqual(['Cheese']);
  });

  it('T54 the screen cells, the CSV and the PDF table hold the same row values', async () => {
    const w = await ws('Shop');
    const p = await saveProduct(w.id, { name: 'Ham, "sliced"', costPerTrackingUnit: { minor: 199, currency: 'GBP' } });
    await createDatedBatch({ workspaceId: w.id, kind: 'bought_in', productId: p.id, dateKind: 'use_by', deadline: { precision: 'date', date: '2026-09-27' }, quantity: 3, lotNumber: 'L<1>' });
    await createDatedBatch({ workspaceId: w.id, kind: 'bought_in', newProduct: { name: 'Flour' }, dateKind: 'best_before', deadline: { precision: 'month', month: '2027-01' } });
    const report = await buildExpiryRows(w.id, {}, NOW, S);
    const table = expiryTable(t, report.rows);
    const screen = report.rows.map(r => expiryCells(t, r));
    const csv = reportCsvRows(t, 'expiry', report);
    const pdf = htmlCells(buildReportHtml(t, 'expiry', report, meta));
    expect(csv).toEqual([table.header, ...screen]);
    expect(pdf).toEqual(screen);
    expect(reportCsvText(t, 'expiry', report)).toBe(toCsv([table.header, ...screen]));
    expect(screen[0]).toContain('5.97');           // 3 × 1.99 exact
    expect(screen[1]).toContain('reports.unknownCost'); // unknown, never 0
    expect(screen[1]).not.toContain('0.00');
  });

  it('the PDF is a real file from the native pipeline, with a sanitized ASCII file name', async () => {
    const w = await ws('Café Ümit / عربي');
    await createDatedBatch({ workspaceId: w.id, kind: 'bought_in', newProduct: { name: 'Milk' }, dateKind: 'use_by', deadline: { precision: 'date', date: '2026-09-27' } });
    const report = await buildExpiryRows(w.id, {}, NOW, S);
    const html = buildReportHtml(t, 'expiry', report, { ...meta, workspaceName: w.name });
    expect(html).toContain('TillExpiry');
    expect(html).not.toContain('TillCalc');
    const out = await writeReportPdf(html, 'expiry', '2026-09-24');
    expect(Print.printToFileAsync).toHaveBeenCalledWith(expect.objectContaining({ html }));
    expect(out.fileName).toBe('TillExpiry_ExpiryReport_2026-09-24.pdf');
    expect(reportFileName('waste', '../../x', 'csv')).toBe('TillExpiry_WasteReport_report.csv');
  });
});

describe('waste report', () => {
  it('T56 only recorded waste counts; T55 unknown cost stays unknown (not 0) and totals are per currency', async () => {
    const w = await ws('Shop');
    const gbp = await saveProduct(w.id, { name: 'Salmon', costPerTrackingUnit: { minor: 450, currency: 'GBP' } });
    const eur = await saveProduct(w.id, { name: 'Brie', costPerTrackingUnit: { minor: 300, currency: 'EUR' } });
    const noCost = await saveProduct(w.id, { name: 'Bread' });
    const s1 = await createDatedBatch({ workspaceId: w.id, kind: 'bought_in', productId: gbp.id, dateKind: 'use_by', deadline: { precision: 'date', date: '2026-09-20' }, quantity: 5 });
    const e1 = await createDatedBatch({ workspaceId: w.id, kind: 'bought_in', productId: eur.id, dateKind: 'use_by', deadline: { precision: 'date', date: '2026-09-20' }, quantity: 5 });
    const b1 = await createDatedBatch({ workspaceId: w.id, kind: 'bought_in', productId: noCost.id, dateKind: 'best_before', deadline: { precision: 'date', date: '2026-09-20' }, quantity: 5 });
    const uncounted = await createDatedBatch({ workspaceId: w.id, kind: 'bought_in', productId: gbp.id, dateKind: 'use_by', deadline: { precision: 'date', date: '2026-09-20' } });
    // Past its date but never recorded as wasted: not counted (T24/T56).
    await createDatedBatch({ workspaceId: w.id, kind: 'bought_in', productId: gbp.id, dateKind: 'use_by', deadline: { precision: 'date', date: '2026-09-01' }, quantity: 9 });
    await recordRemoval(w.id, s1.id, 'wasted', { quantity: 2, reason: 'past_deadline' });
    await recordRemoval(w.id, s1.id, 'sold', { quantity: 1 });
    await recordRemoval(w.id, e1.id, 'wasted', { quantity: 1, reason: 'damaged' });
    await recordRemoval(w.id, b1.id, 'wasted', { quantity: 3, reason: 'quality' });
    await recordRemoval(w.id, uncounted.id, 'wasted', { reason: 'storage_failure' });

    const r = await buildWasteRows(w.id, {}, Date.now());
    expect(r.rows).toHaveLength(4);
    expect(r.summary.costTotals).toEqual({ GBP: 900, EUR: 300 });
    expect(r.summary.unknownCost).toBe(2);
    expect(r.summary.reasons).toEqual({ past_deadline: 1, quality: 1, damaged: 1, storage_failure: 1, other: 0 });
    const bread = r.rows.find(x => x.productName === 'Bread')!;
    expect(bread.cost).toBeNull();
    const table = wasteTable(t, r.rows);
    const breadCells = table.body[r.rows.indexOf(bread)];
    expect(breadCells).toContain('reports.unknownCost');
    expect(breadCells).not.toContain('0.00');
    const noQty = r.rows.find(x => x.reason === 'storage_failure')!;
    expect(noQty).toMatchObject({ quantity: undefined, cost: null });
    expect(htmlCells(buildReportHtml(t, 'waste', r, meta))).toEqual(table.body);
    expect(reportCsvRows(t, 'waste', r)).toEqual([table.header, ...table.body]);
  });

  it('filters waste by the local day of the event', async () => {
    const w = await ws('Shop');
    const b = await createDatedBatch({ workspaceId: w.id, kind: 'bought_in', newProduct: { name: 'Buns' }, dateKind: 'use_by', deadline: { precision: 'date', date: '2026-09-20' }, quantity: 5 });
    await recordRemoval(w.id, b.id, 'wasted', { quantity: 1, reason: 'other', note: 'dropped' });
    expect((await buildWasteRows(w.id, { from: '2000-01-01', to: '2000-01-02' })).rows).toEqual([]);
    const r = await buildWasteRows(w.id, { from: '2000-01-01', to: '2999-01-01' });
    expect(r.rows[0]).toMatchObject({ reason: 'other', note: 'dropped', cost: null });
    expect(r.rows[0].day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('EXP-REV-10 waste cost is a snapshot taken when waste is recorded', () => {
  it('waste at £1/unit keeps £1/unit after the product cost changes to £2', async () => {
    const { createWorkspace } = require('../../workspaces/workspaceStore');
    const { saveProduct, getProduct } = require('../../products/productStore');
    const { createDatedBatch, recordRemoval, listEvents } = require('../../batches/batchStore');
    const { buildWasteRows } = require('../reportRows');
    const w = await createWorkspace({ name: 'Snap', mode: 'retail', currency: 'GBP', timeZone: 'Europe/London' });
    const p = await saveProduct(w.id, { name: 'Ham', costPerTrackingUnit: { minor: 100, currency: 'GBP' } });
    const b = await createDatedBatch({ workspaceId: w.id, kind: 'bought_in', productId: p.id, dateKind: 'use_by', deadline: { precision: 'date', date: '2026-09-20' }, quantity: 5 });
    await recordRemoval(w.id, b.id, 'wasted', { quantity: 3, reason: 'past_deadline' });
    const ev = (await listEvents(w.id)).find((e: any) => e.type === 'wasted');
    expect(ev.unitCost).toEqual({ minor: 100, currency: 'GBP' });
    const cur = await getProduct(w.id, p.id);
    await saveProduct(w.id, { name: cur.name, costPerTrackingUnit: { minor: 200, currency: 'GBP' } }, p.id);
    const report = await buildWasteRows(w.id, {});
    expect(report.rows[0].cost).toEqual({ minor: 300, currency: 'GBP' });
    expect(report.summary.costTotals).toEqual({ GBP: 300 });
  });

  it('a legacy waste event without a snapshot shows unknown cost, not today’s product cost', () => {
    const { wasteRowsFrom } = require('../reportRows');
    const at = '2026-09-20T10:00:00Z';
    const batch = { id: 'b1', workspaceId: 'w', productId: 'p1', productName: 'Ham', kind: 'bought_in', timeZone: 'UTC', effective: { dateKind: 'none', reason: 'none' }, status: 'active', dateKind: 'none', datePrecision: 'date', createdAt: at, updatedAt: at, schemaVersion: 1 };
    const product = { id: 'p1', workspaceId: 'w', name: 'Ham', barcodes: [], trackingUnit: 'each', costPerTrackingUnit: { minor: 200, currency: 'GBP' }, status: 'active', createdAt: at, updatedAt: at, schemaVersion: 1 };
    const events = [{ id: 'e1', workspaceId: 'w', batchId: 'b1', type: 'wasted', at, quantity: 2, reason: 'quality' }];
    const r = wasteRowsFrom('w', events, [batch], [product], [], {}, 'UTC');
    expect(r.rows[0].cost).toBeNull();
    expect(r.summary.unknownCost).toBe(1);
  });
});
