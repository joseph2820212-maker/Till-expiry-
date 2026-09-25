/** Reports / labels / markdown screens (E27–E31) rendered against the real stores with stubbed native chrome. */
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;

jest.mock('react-native', () => ({ ...require('../../../__tests__/helpers/screenStubs').rn, Modal: 'Modal', ActivityIndicator: 'ActivityIndicator' }));
jest.mock('@react-navigation/native', () => require('../../../__tests__/helpers/screenStubs').navigation());
jest.mock('@react-navigation/native-stack', () => ({}));
jest.mock('react-i18next', () => require('../../../__tests__/helpers/screenStubs').i18n());
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../../../theme/responsive', () => ({ fs: (v: number) => v, rs: (v: number) => v }));
jest.mock('../../../components/WorkspaceHeader', () => ({ WorkspaceHeader: 'WorkspaceHeader' }));
jest.mock('../../../components/ScreenHeader', () => ({ ScreenHeader: 'ScreenHeader' }));
jest.mock('../../../components/AppButton', () => ({ AppButton: 'AppButton' }));
jest.mock('../../../components/FilterChip', () => ({ FilterChip: 'FilterChip', ChipGrid: 'ChipGrid' }));
jest.mock('../../../components/DropdownField', () => ({ DropdownField: 'DropdownField' }));
jest.mock('../../../components/EmptyState', () => ({ EmptyState: 'EmptyState' }));
jest.mock('../../../components/AppKeyboardScrollView', () => ({ AppKeyboardScrollView: ({ children, ...p }: any) => require('react').createElement('AppKeyboardScrollView', p, children) }));
jest.mock('../../../components/AppKeyboardBottomSheet', () => ({ AppKeyboardBottomSheet: ({ children, footer, visible, ...p }: any) => (visible ? require('react').createElement('BottomSheet', p, children, footer) : null) }));
jest.mock('../../../components/forms/FormBits', () => ({ Field: 'Field' }));
jest.mock('../../../components/pdf/AppPdfPreviewScreen', () => ({ AppPdfPreviewScreen: 'AppPdfPreviewScreen' }));
jest.mock('../../../components/pdf/CsvPreviewModal', () => ({ CsvPreviewModal: 'CsvPreviewModal' }));

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { navState, flush, texts } from '../../../__tests__/helpers/screenStubs';
import { createWorkspace, __resetWorkspaceCache } from '../../workspaces/workspaceStore';
import { saveRule } from '../../rules/ruleStore';
import { saveProduct } from '../../products/productStore';
import { createDatedBatch, listBatchEvents, prepareBatch } from '../../batches/batchStore';
import { ReportsHomeScreen } from '../screens/ReportsHomeScreen';
import { ExpiryReportScreen } from '../screens/ExpiryReportScreen';
import { WasteReportScreen } from '../screens/WasteReportScreen';
import { ReportPreviewScreen } from '../screens/ReportPreviewScreen';
import { InternalLabelPreviewScreen } from '../../labels/screens/InternalLabelPreviewScreen';
import { MarkdownHelperSheet } from '../../markdown/MarkdownHelperSheet';
import { clearPendingReports, getPendingReport } from '../reportHolder';

const render = (el: React.ReactElement) => { let r: any; act(() => { r = TestRenderer.create(el); }); return r; };
const settle = async () => { await act(async () => { for (let i = 0; i < 6; i++) await flush(); }); };
const byTestId = (r: any, id: string) => r.root.findAll((n: any) => n.props && n.props.testID === id && typeof n.type === 'string');

beforeEach(() => {
  (AsyncStorage as any).clear(); __resetWorkspaceCache(); clearPendingReports();
  jest.clearAllMocks(); navState.params = {};
});

async function ws() {
  return createWorkspace({ name: 'Corner Shop', mode: 'mixed', currency: 'GBP', timeZone: 'Europe/London' });
}

describe('report screens', () => {
  it('E27 ReportsHome renders its workspace header and routes to the reports and data screens', async () => {
    await ws();
    const r = render(<ReportsHomeScreen />);
    const header = r.root.findByType('WorkspaceHeader');
    expect(header.props.title).toBe('reports.title');
    header.props.onSearch();
    expect(navState.navigate).toHaveBeenCalledWith('GlobalSearch');
    byTestId(r, 'reports-expiry')[0].props.onPress();
    byTestId(r, 'reports-waste')[0].props.onPress();
    byTestId(r, 'reports-import-batches')[0].props.onPress();
    byTestId(r, 'reports-data-export')[0].props.onPress();
    expect(navState.navigate).toHaveBeenCalledWith('ExpiryReport');
    expect(navState.navigate).toHaveBeenCalledWith('WasteReport');
    expect(navState.navigate).toHaveBeenCalledWith('CsvImport', { kind: 'batches' });
    expect(navState.navigate).toHaveBeenCalledWith('DataExport');
  });

  it('E28 ExpiryReport lists the rows (unknown cost shown as unknown) and its PDF opens the preview of that exact file', async () => {
    const w = await ws();
    const p = await saveProduct(w.id, { name: 'Ham', costPerTrackingUnit: { minor: 199, currency: 'GBP' } });
    const b1 = await createDatedBatch({ workspaceId: w.id, kind: 'bought_in', productId: p.id, dateKind: 'use_by', deadline: { precision: 'date', date: '2020-01-01' }, quantity: 2 });
    const b2 = await createDatedBatch({ workspaceId: w.id, kind: 'bought_in', newProduct: { name: 'Jar' }, dateKind: 'none' });
    const r = render(<ExpiryReportScreen />);
    await settle();
    expect(byTestId(r, `expiry-row-${b1.id}`)).toHaveLength(1);
    expect(byTestId(r, `expiry-row-${b2.id}`)).toHaveLength(1);
    expect(texts(r)).toContain('reports.costUnknownLine');
    const pdfBtn = r.root.findAllByType('AppButton').find((x: any) => x.props.testID === 'expiry-pdf');
    await act(async () => { await pdfBtn.props.onPress(); });
    expect(Print.printToFileAsync).toHaveBeenCalledTimes(1);
    expect(navState.navigate).toHaveBeenCalledWith('ReportPreview', { report: 'expiry' });
    const pending = getPendingReport('expiry')!;
    expect(pending.fileName).toMatch(/^TillExpiry_ExpiryReport_\d{4}-\d{2}-\d{2}\.pdf$/);

    navState.params = { report: 'expiry' };
    const pr = render(<ReportPreviewScreen />);
    const preview = pr.root.findByType('AppPdfPreviewScreen');
    expect(preview.props.sourceUri).toBe(pending.uri);
    await act(async () => { await preview.props.actions[0].onPress(); });
    expect(Sharing.shareAsync).toHaveBeenCalledWith(pending.uri, expect.objectContaining({ mimeType: 'application/pdf' }));
  });

  it('E29 WasteReport renders an empty state without recorded waste; E30 without a generated file shows an error, not a blank page', async () => {
    await ws();
    const r = render(<WasteReportScreen />);
    await settle();
    expect(byTestId(r, 'waste-empty')).toHaveLength(1);
    navState.params = { report: 'waste' };
    const pr = render(<ReportPreviewScreen />);
    expect(pr.root.findByType('AppPdfPreviewScreen').props.error).toBe('reports.previewMissing');
  });
});

describe('internal label screen', () => {
  it('E31 prints the generated file and only then records label_printed; sharing records nothing', async () => {
    const w = await ws();
    const rule = await saveRule(w.id, { name: 'Soup', appliesTo: 'after_preparation', class: 'hard_cutoff', durationMinutes: 2880, sourceText: 'Our HACCP plan' });
    const b = await prepareBatch({ workspaceId: w.id, newProduct: { name: 'Soup' }, preparedAt: '2026-09-24T10:00:00+01:00', ruleId: rule.id });
    navState.params = { batchIds: [b.id] };
    const r = render(<InternalLabelPreviewScreen />);
    await settle();
    const preview = () => r.root.findByType('AppPdfPreviewScreen');
    expect(preview().props.sourceUri).toBeTruthy();
    expect(preview().props.error).toBeNull();
    const html = (Print.printToFileAsync as jest.Mock).mock.calls[0][0].html as string;
    expect(html).toContain('label.notPpds');
    expect(html).toContain('Our HACCP plan');
    const share = preview().props.actions.find((a: any) => a.key === 'share');
    await act(async () => { await share.onPress(); });
    expect((await listBatchEvents(w.id, b.id)).map(e => e.type)).not.toContain('label_printed');
    (Print.printAsync as jest.Mock).mockRejectedValueOnce(new Error('cancelled'));
    await act(async () => { await preview().props.actions.find((a: any) => a.key === 'print').onPress(); });
    expect((await listBatchEvents(w.id, b.id)).map(e => e.type)).not.toContain('label_printed');
    // EXP-REV-08: printAsync resolving (Android: the print window was only shown) records nothing by itself.
    const alerts: any[] = [];
    const { AppAlert } = require('../../../components/AppAlert');
    AppAlert.register((c: any) => { if (c) alerts.push(c); });
    await act(async () => { await preview().props.actions.find((a: any) => a.key === 'print').onPress(); });
    expect(Print.printAsync).toHaveBeenCalledWith({ uri: preview().props.sourceUri });
    expect((await listBatchEvents(w.id, b.id)).map(e => e.type)).not.toContain('label_printed');
    expect(alerts.at(-1).title).toBe('label.confirmTitle');
    await act(async () => { alerts.at(-1).buttons.find((x: any) => x.text === 'label.confirmNo').onPress?.(); });
    expect((await listBatchEvents(w.id, b.id)).map(e => e.type)).not.toContain('label_printed');
    await act(async () => { await preview().props.actions.find((a: any) => a.key === 'print').onPress(); });
    await act(async () => { alerts.at(-1).buttons.find((x: any) => x.text === 'label.confirmYes').onPress(); await new Promise(r => setTimeout(r, 0)); });
    expect((await listBatchEvents(w.id, b.id)).filter(e => e.type === 'label_printed')).toHaveLength(1);
    AppAlert.unregister();
  });

  it('a bought-in batch is not labelled: the screen says so instead of printing', async () => {
    const w = await ws();
    const b = await createDatedBatch({ workspaceId: w.id, kind: 'bought_in', newProduct: { name: 'Milk' }, dateKind: 'use_by', deadline: { precision: 'date', date: '2026-10-01' } });
    navState.params = { batchIds: [b.id] };
    const r = render(<InternalLabelPreviewScreen />);
    await settle();
    const p = r.root.findByType('AppPdfPreviewScreen');
    expect(p.props.error).toBe('label.nothingToPrint');
    expect(p.props.actions).toEqual([]);
  });
});

describe('markdown sheet', () => {
  it('T57 after a use-by the sheet offers no prices; before it, it shows exact steps and never changes the product', async () => {
    const w = await ws();
    const p = await saveProduct(w.id, { name: 'Ham', costPerTrackingUnit: { minor: 120, currency: 'GBP' }, sellingPrice: { minor: 199, currency: 'GBP' } });
    const past = await createDatedBatch({ workspaceId: w.id, kind: 'bought_in', productId: p.id, dateKind: 'use_by', deadline: { precision: 'date', date: '2020-01-01' } });
    const r1 = render(<MarkdownHelperSheet batch={past} visible onClose={() => {}} />);
    await settle();
    expect(byTestId(r1, 'markdown-blocked')).toHaveLength(1);
    expect(r1.root.findAll((n: any) => typeof n.props?.testID === 'string' && n.props.testID.startsWith('markdown-step-'))).toHaveLength(0);

    const later = await createDatedBatch({ workspaceId: w.id, kind: 'bought_in', productId: p.id, dateKind: 'best_before', deadline: { precision: 'date', date: '2099-01-01' } });
    const r2 = render(<MarkdownHelperSheet batch={later} visible onClose={() => {}} />);
    await settle();
    expect(byTestId(r2, 'markdown-step-20')).toHaveLength(1);
    expect(byTestId(r2, 'markdown-step-50')).toHaveLength(0); // below cost: hidden until confirmed
    expect(texts(r2).join(' ')).not.toMatch(/\bsafe\b/i);
    expect(texts(r2)).toContain('markdown.qualityFirst');
  });
});
