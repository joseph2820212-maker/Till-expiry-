/** E32 CsvImport → E33 CsvImportPreview → E34 DataExport against the real storage layer (T37, T38). */
import React from 'react';
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;

jest.mock('react-native', () => {
  const R = require('react');
  const stubs = require('../../../__tests__/helpers/screenStubs').rn;
  /** Header, the first `initialNumToRender` rows (like the real windowed list on first mount), footer. */
  const FlatList = ({ data, renderItem, keyExtractor, ListHeaderComponent, ListFooterComponent, initialNumToRender, testID }: any) =>
    R.createElement('FlatList', { testID, count: data.length },
      ListHeaderComponent ?? null,
      ...(renderItem ? data.slice(0, initialNumToRender ?? data.length).map((item: any, index: number) => R.createElement(R.Fragment, { key: keyExtractor ? keyExtractor(item, index) : index }, renderItem({ item, index }))) : []),
      ListFooterComponent ?? null);
  return { ...stubs, FlatList };
});
jest.mock('@react-navigation/native', () => require('../../../__tests__/helpers/screenStubs').navigation());
jest.mock('react-i18next', () => require('../../../__tests__/helpers/screenStubs').i18n());
jest.mock('../../../components/ScreenHeader', () => ({ ScreenHeader: 'ScreenHeader' }));
jest.mock('../../../components/AppButton', () => ({ AppButton: 'AppButton' }));
jest.mock('../../../components/CheckboxRow', () => ({ CheckboxRow: 'CheckboxRow' }));
jest.mock('../../../components/EmptyState', () => ({ EmptyState: 'EmptyState' }));
jest.mock('../../../components/LabelRow', () => ({ LabelRow: 'LabelRow' }));
jest.mock('../../../components/DropdownField', () => ({ DropdownField: 'DropdownField' }));
jest.mock('../../../components/pdf/CsvPreviewModal', () => ({ CsvPreviewModal: 'CsvPreviewModal' }));
jest.mock('../../../components/AppKeyboardScrollView', () => ({ AppKeyboardScrollView: require('../../../__tests__/helpers/screenStubs').components.AppKeyboardScrollView }));
jest.mock('../../../components/forms/FormBits', () => {
  const R = require('react');
  return {
    Section: ({ children, title, testID }: any) => R.createElement('Section', { title, testID }, children),
    ChoiceChips: (p: any) => R.createElement('ChoiceChips', p),
    ErrorText: ({ text }: any) => (text ? R.createElement('Text', null, text) : null),
    Hint: ({ text }: any) => (text ? R.createElement('Text', null, text) : null),
  };
});
jest.mock('../../../theme/responsive', () => ({ fs: (v: number) => v, rs: (v: number) => v }));
const mockAlert = { alert: jest.fn(), success: jest.fn(), error: jest.fn() };
jest.mock('../../../components/AppAlert', () => ({ get AppAlert() { return mockAlert; } }));
const mockPick: any = { next: { canceled: true, assets: null } };
jest.mock('expo-document-picker', () => ({ getDocumentAsync: async () => mockPick.next }));
const mockFiles: Record<string, string> = {};
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///docs/',
  cacheDirectory: 'file:///cache/',
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
  readAsStringAsync: async (uri: string) => mockFiles[uri],
  writeAsStringAsync: jest.fn(async () => undefined),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sharing from 'expo-sharing';
import { CsvImportScreen } from '../screens/CsvImportScreen';
import { CsvImportPreviewScreen } from '../screens/CsvImportPreviewScreen';
import { DataExportScreen } from '../../export/screens/DataExportScreen';
import { clearImportSession, getImportSession } from '../importSession';
import { createWorkspace, __resetWorkspaceCache } from '../../workspaces/workspaceStore';
import { listBatches } from '../../batches/batchStore';
import { listImportHistory } from '../csvImport';
import { navState, texts, button, flush } from '../../../__tests__/helpers/screenStubs';

const mounted: any[] = [];
const render = async (el: React.ReactElement) => {
  let r: any;
  await act(async () => { r = TestRenderer.create(el); await flush(); await flush(); });
  mounted.push(r);
  return r;
};
afterEach(async () => { await act(async () => { mounted.splice(0).forEach(r => r.unmount()); }); });
const press = async (fn: () => unknown) => { await act(async () => { await fn(); await new Promise(res => setTimeout(res, 30)); }); };

const FILE = 'Product,Barcode,Lot,Qty,Date kind,Date,Location\nMilk,5000157024671,A1,6,use by,26/09/2026,Fridge\nMilk,5000157024671,A2,6,use by,2026-10,Fridge\nHam,,H1,2,best before,2027-01,Fridge\n';

async function pickFile(text: string, name = 'stock.csv') {
  mockFiles['file:///cache/stock.csv'] = Buffer.from(text, 'utf8').toString('base64');
  mockPick.next = { canceled: false, assets: [{ uri: 'file:///cache/stock.csv', name, size: text.length }] };
}

beforeEach(async () => {
  jest.clearAllMocks();
  (AsyncStorage as any).clear();
  __resetWorkspaceCache();
  clearImportSession();
  navState.params = { kind: 'batches' };
  await createWorkspace({ name: 'Corner Shop', mode: 'mixed', currency: 'GBP', timeZone: 'Europe/London' });
});

describe('E32 CsvImport', () => {
  it('picks a file, shows the guessed mapping and hands it to the preview through the session (not nav params)', async () => {
    await pickFile(FILE);
    const r = await render(<CsvImportScreen />);
    await press(() => button(r, 'import.pick').props.onPress());
    const dropdowns = r.root.findAllByType('DropdownField');
    expect(dropdowns.map((d: any) => d.props.value)).toEqual(['name', 'barcode', 'lot', 'quantity', 'date_kind', 'date', 'location']);
    await press(() => button(r, 'import.toPreview').props.onPress());
    expect(navState.navigate).toHaveBeenCalledWith('CsvImportPreview', { kind: 'batches' });
    const ws = (await AsyncStorage.getItem('workspaces:active')) as string;
    expect(getImportSession('batches', JSON.parse(ws))?.csv.rows).toHaveLength(3);
    expect(await listBatches(JSON.parse(ws))).toEqual([]);
  });
  it('a file that cannot be read shows why and offers nothing to import', async () => {
    mockFiles['file:///cache/stock.csv'] = Buffer.from([0x50, 0x4b, 3, 4]).toString('base64');
    mockPick.next = { canceled: false, assets: [{ uri: 'file:///cache/stock.csv', name: 'stock.xlsx', size: 4 }] };
    const r = await render(<CsvImportScreen />);
    await press(() => button(r, 'import.pick').props.onPress());
    expect(texts(r).some(x => x.startsWith('import.decode.spreadsheet'))).toBe(true);
    expect(button(r, 'import.toPreview')).toBeUndefined();
  });
});

describe('E33 CsvImportPreview', () => {
  it('T37 / T38 shows counts and row errors, writes nothing until confirmed, then imports atomically and records history', async () => {
    await pickFile(FILE);
    const pick = await render(<CsvImportScreen />);
    await press(() => button(pick, 'import.pick').props.onPress());
    await press(() => button(pick, 'import.toPreview').props.onPress());
    const wsId = JSON.parse((await AsyncStorage.getItem('workspaces:active')) as string);

    const r = await render(<CsvImportPreviewScreen />);
    const labels = r.root.findAllByType('LabelRow').map((l: any) => `${l.props.label}=${l.props.value}`);
    expect(labels).toEqual(expect.arrayContaining(['import.count.rows=3', 'import.count.newBatches=2', 'import.count.errors=1', 'import.count.newProducts=2']));
    // The month-only use-by row is surfaced with its line number.
    expect(texts(r).some(x => x.includes('import.issueLine|line=3'))).toBe(true);
    expect(texts(r).some(x => x.startsWith('import.issue.deadline_monthNotAllowed'))).toBe(true);
    expect(await listBatches(wsId)).toEqual([]);

    const onConfirm = button(r, 'import.confirm|count=2').props.onPress;
    await press(() => Promise.all([onConfirm(), onConfirm()])); // a double tap imports once
    expect(await listBatches(wsId)).toHaveLength(2);
    expect(await listImportHistory(wsId)).toHaveLength(1);
    expect(r.root.findAllByProps({ testID: 'import-result' }).length).toBeGreaterThan(0);
    expect(mockAlert.error).not.toHaveBeenCalled();
  });
  it('the same file again is blocked as already imported', async () => {
    for (let round = 0; round < 2; round++) {
      await pickFile(FILE);
      const pick = await render(<CsvImportScreen />);
      await press(() => button(pick, 'import.pick').props.onPress());
      await press(() => button(pick, 'import.toPreview').props.onPress());
      const r = await render(<CsvImportPreviewScreen />);
      if (round === 0) { await press(() => button(r, 'import.confirm|count=2').props.onPress()); continue; }
      // Blocked by the fingerprint; the rows also show as duplicates of the batches already stored.
      expect(texts(r)).toContain('import.blocker.alreadyImported');
      expect(button(r, 'import.confirmNothing').props.disabled).toBe(true);
      expect(texts(r).filter(x => x.startsWith('import.issue.duplicateExisting'))).toHaveLength(2);
    }
  });
  it('without a picked file it says so instead of showing an empty preview', async () => {
    const r = await render(<CsvImportPreviewScreen />);
    expect(r.root.findAllByType('EmptyState')).toHaveLength(1);
    expect(button(r, 'common.back')).toBeDefined();
  });
});

describe('E34 DataExport', () => {
  it('previews the rows, then writes and shares exactly those rows; no success message is claimed', async () => {
    await pickFile(FILE);
    const pick = await render(<CsvImportScreen />);
    await press(() => button(pick, 'import.pick').props.onPress());
    await press(() => button(pick, 'import.toPreview').props.onPress());
    const pr = await render(<CsvImportPreviewScreen />);
    await press(() => button(pr, 'import.confirm|count=2').props.onPress());

    const r = await render(<DataExportScreen />);
    await press(() => r.root.findByProps({ testID: 'export-batches' }).props.onPress());
    const modal = r.root.findByType('CsvPreviewModal');
    expect(modal.props.visible).toBe(true);
    expect(modal.props.html).toContain('Milk');
    expect(modal.props.html).toContain('Ham');
    await press(() => r.root.findByType('CsvPreviewModal').props.onExport());
    expect(Sharing.shareAsync).toHaveBeenCalledTimes(1);
    expect(mockAlert.success).not.toHaveBeenCalled();
  });
});
