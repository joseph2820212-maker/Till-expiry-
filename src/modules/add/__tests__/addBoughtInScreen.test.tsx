/** E16 AddBoughtIn rendered against the real storage layer: double tap saves once (T15), month-only use-by blocked (T04),
 *  a scanned standard barcode still asks for the date (T32), a GS1 date is prefilled but must be confirmed (§11.2). */
import React from 'react';
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;

jest.mock('react-native', () => require('../../../__tests__/helpers/screenStubs').rn);
jest.mock('@react-navigation/native', () => require('../../../__tests__/helpers/screenStubs').navigation());
jest.mock('react-i18next', () => require('../../../__tests__/helpers/screenStubs').i18n());
jest.mock('../../../i18n', () => ({ __esModule: true, default: { language: 'en' } }));
jest.mock('../../../components/ScreenHeader', () => ({ ScreenHeader: 'ScreenHeader' }));
jest.mock('../../../components/AppButton', () => ({ AppButton: 'AppButton' }));
jest.mock('../../../components/CheckboxRow', () => ({ CheckboxRow: 'CheckboxRow' }));
jest.mock('../../../components/DropdownField', () => ({ DropdownField: 'DropdownField' }));
jest.mock('../../../components/DatePickerField', () => ({ DatePickerField: 'DatePickerField' }));
jest.mock('../../../components/AppKeyboardBottomSheet', () => ({ AppKeyboardBottomSheet: require('../../../__tests__/helpers/screenStubs').components.AppKeyboardBottomSheet }));
jest.mock('../../../components/AppKeyboardScrollView', () => ({ AppKeyboardScrollView: require('../../../__tests__/helpers/screenStubs').components.AppKeyboardScrollView }));
jest.mock('../../../components/forms/DeadlineInput', () => ({ DeadlineInput: 'DeadlineInput', FAR_FUTURE: '2199-12-31' }));
jest.mock('../../../components/forms/FormBits', () => {
  const R = require('react');
  return {
    Section: ({ children, title, hint, testID }: any) => R.createElement('Section', { title, hint, testID }, children),
    Field: 'Field', ChoiceChips: 'ChoiceChips',
    ErrorText: ({ text }: any) => (text ? R.createElement('Text', null, text) : null),
    Hint: ({ text }: any) => (text ? R.createElement('Text', null, text) : null),
  };
});
jest.mock('../../../theme/responsive', () => ({ fs: (v: number) => v, rs: (v: number) => v }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createWorkspace, __resetWorkspaceCache } from '../../workspaces/workspaceStore';
import { saveProduct } from '../../products/productStore';
import { listBatches } from '../../batches/batchStore';
import { AddBoughtInScreen } from '../screens/AddBoughtInScreen';
import { navState, flush, texts } from '../../../__tests__/helpers/screenStubs';

const mounted: any[] = [];
const render = async () => {
  let r: any;
  await act(async () => { r = TestRenderer.create(<AddBoughtInScreen />); await flush(); await flush(); });
  mounted.push(r);
  return r;
};
afterEach(() => { act(() => { while (mounted.length) mounted.pop().unmount(); }); });
const byTestId = (r: any, id: string) => r.root.find((n: any) => n.props && n.props.testID === id);
const saveBtn = (r: any) => byTestId(r, 'add-save');
const kindChips = (r: any) => r.root.findAllByType('ChoiceChips')[0];
const deadline = (r: any) => r.root.findByType('DeadlineInput');

let wsId = '';
beforeEach(async () => {
  (AsyncStorage as any).clear();
  __resetWorkspaceCache();
  navState.params = undefined;
  wsId = (await createWorkspace({ name: 'Corner Shop', mode: 'retail', currency: 'GBP', timeZone: 'Europe/London' })).id;
});

describe('AddBoughtInScreen (E16)', () => {
  it('T15 two quick taps on Save create one batch and show the saved card', async () => {
    const r = await render();
    await act(async () => { byTestId(r, 'new-product-name').props.onChangeText('Milk 2L'); });
    await act(async () => { kindChips(r).props.onChange('use_by'); });
    await act(async () => { deadline(r).props.onChange({ precision: 'date', date: '2026-09-28' }); });
    await act(async () => { byTestId(r, 'quantity').props.onChangeText('6'); });
    const btn = saveBtn(r);
    await act(async () => { btn.props.onPress(); btn.props.onPress(); await flush(); await flush(); });
    const list = await listBatches(wsId);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ productName: 'Milk 2L', printedDate: '2026-09-28', quantityRemaining: 6, dateKind: 'use_by' });
    expect(texts(r)).toContain('add.saved.title|name=Milk 2L');
  });

  it('T04 a month-only use-by is refused with a visible error and nothing is saved', async () => {
    const r = await render();
    await act(async () => { byTestId(r, 'new-product-name').props.onChangeText('Ham'); });
    await act(async () => { kindChips(r).props.onChange('use_by'); });
    await act(async () => { deadline(r).props.onChange({ precision: 'month', month: '2026-10' }); });
    await act(async () => { saveBtn(r).props.onPress(); await flush(); });
    expect(deadline(r).props.error).toBe('add.errors.monthNotAllowed');
    expect(await listBatches(wsId)).toHaveLength(0);
  });

  it('T32 opened from a scan of a known product: kind defaults from the product but the date is still asked', async () => {
    const p = await saveProduct(wsId, { name: 'Yoghurt', barcodes: [{ code: '5000157024671' }], defaultDateKind: 'use_by' });
    navState.params = { productId: p.id };
    const r = await render();
    expect(texts(r)).toContain('Yoghurt');
    expect(kindChips(r).props.value).toBe('use_by');
    expect(deadline(r).props.value).toBeUndefined();
    await act(async () => { saveBtn(r).props.onPress(); await flush(); });
    expect(deadline(r).props.error).toBe('add.errors.dateRequired');
    expect(await listBatches(wsId)).toHaveLength(0);
  });

  it('an unknown scanned code prefills the new product barcode', async () => {
    navState.params = { barcode: '036000291452', symbology: 'upc_a' };
    const r = await render();
    expect(byTestId(r, 'new-product-barcode').props.value).toBe('036000291452');
  });

  it('GS1 data: date and lot prefilled and shown, saving waits for "I checked the pack"', async () => {
    navState.params = { gs1: ']C10109501101530003172612311' + '0L77' };
    const r = await render();
    expect(byTestId(r, 'section-gs1')).toBeTruthy();
    expect(kindChips(r).props.value).toBe('use_by');
    expect(deadline(r).props.value).toEqual({ precision: 'date', date: '2026-12-31' });
    expect(byTestId(r, 'lot').props.value).toBe('L77');
    await act(async () => { byTestId(r, 'new-product-name').props.onChangeText('Soft cheese'); });
    await act(async () => { saveBtn(r).props.onPress(); await flush(); });
    expect(texts(r)).toContain('add.errors.gs1Confirm');
    expect(await listBatches(wsId)).toHaveLength(0);
    await act(async () => { r.root.findByType('CheckboxRow').props.onToggle(); });
    await act(async () => { saveBtn(r).props.onPress(); await flush(); await flush(); });
    const list = await listBatches(wsId);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ lotNumber: 'L77', printedDate: '2026-12-31' });
  });
});
