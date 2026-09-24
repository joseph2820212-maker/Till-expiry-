import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;

jest.mock('react-native', () => ({ ...require('../../../__tests__/helpers/screenStubs').rn, FlatList: ({ data, renderItem, ListHeaderComponent, ListEmptyComponent }: any) => require('react').createElement('FlatList', null, ListHeaderComponent ?? null, ...(data?.length ? data.map((item: any, index: number) => require('react').createElement(require('react').Fragment, { key: item.id }, renderItem({ item, index }))) : [ListEmptyComponent ?? null])) }));
jest.mock('@react-navigation/native', () => require('../../../__tests__/helpers/screenStubs').navigation());
jest.mock('@react-navigation/native-stack', () => ({}));
jest.mock('react-i18next', () => require('../../../__tests__/helpers/screenStubs').i18n());
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../../../theme/responsive', () => ({ fs: (v: number) => v, rs: (v: number) => v }));
jest.mock('../../../utils/currency', () => require('../../../__tests__/helpers/screenStubs').currency());
jest.mock('../../../components/ScreenHeader', () => ({ ScreenHeader: 'ScreenHeader' }));
jest.mock('../../../components/AppButton', () => ({ AppButton: 'AppButton' }));
jest.mock('../../../components/AppTextInput', () => ({ AppTextInput: 'AppTextInput' }));
jest.mock('../../../components/DatePickerField', () => ({ DatePickerField: 'DatePickerField' }));
jest.mock('../../../components/AppKeyboardScrollView', () => ({ AppKeyboardScrollView: ({ children }: any) => require('react').createElement('Scroll', null, children) }));
jest.mock('../../../components/AppKeyboardBottomSheet', () => ({ AppKeyboardBottomSheet: ({ visible, children, footer }: any) => (visible ? require('react').createElement('BottomSheet', null, children, footer) : null) }));
jest.mock('../../billing/FreeLimitSheet', () => ({ FreeLimitSheet: 'FreeLimitSheet' }));
jest.mock('../../billing/BillingProvider', () => ({ useBilling: () => ({ status: 'unknown', entitlement: { isPremium: false, packages: [] } }) }));
jest.mock('../../reports/exports', () => ({ shareCheckSheetPdf: jest.fn(async () => true) }));

import { navState, flush, button } from '../../../__tests__/helpers/screenStubs';
import { AppAlert } from '../../../components/AppAlert';
import { AddDateScreen } from '../screens/AddDateScreen';
import { DateCheckScreen } from '../screens/DateCheckScreen';
import { addDate, getBatch, listBatches } from '../storage/batchStore';
import { findByBarcode } from '../../products/storage/productStore';
import { addDays, todayLocal } from '../../../domain/dates';

const render = (el: React.ReactElement) => { let r: any; act(() => { r = TestRenderer.create(el); }); return r; };
const settle = async () => { await act(async () => { await flush(); await flush(); await flush(); }); };

beforeEach(() => { (AsyncStorage as any).clear(); jest.clearAllMocks(); navState.params = {}; });

describe('AddDateScreen', () => {
  it('scanned unknown barcode → type a name → date → saved as a new product with its first date', async () => {
    navState.params = { barcode: '5000157024671', symbology: 'ean13' };
    const ok = jest.spyOn(AppAlert, 'success').mockImplementation(() => {});
    const r = render(<AddDateScreen />);
    await settle();
    const inputs = () => r.root.findAllByType('AppTextInput');
    act(() => { inputs().find((i: any) => i.props.testID === 'ad-new-name').props.onChangeText('Milk 2L'); });
    act(() => { button(r, 'common.save').props.onPress(); });
    await settle();
    expect(r.root.findAllByType('Text').some((x: any) => x.props.children === 'addDate.errors.dateRequired')).toBe(true);
    const target = addDays(todayLocal(), 3);
    act(() => { r.root.findByType('DatePickerField').props.onChange(target); });
    act(() => { inputs().find((i: any) => i.props.testID === 'ad-qty').props.onChangeText('6'); });
    await act(async () => { await button(r, 'common.save').props.onPress(); });
    await settle();
    expect(ok).toHaveBeenCalledWith('addDate.saved');
    expect(navState.goBack).toHaveBeenCalled();
    const product = await findByBarcode('5000157024671', 'ean13');
    expect(product?.name).toBe('Milk 2L');
    expect((await listBatches()).map(b => [b.productId, b.date, b.quantity])).toEqual([[product!.id, target, 6]]);
    ok.mockRestore();
  });
});

describe('DateCheckScreen', () => {
  it('lists what needs action and ticks, sells out or bins in one tap', async () => {
    const today = todayLocal();
    const a = await addDate({ newProduct: { name: 'Expired ham' }, date: addDays(today, -1), dateType: 'useBy', quantity: 2 });
    const b = await addDate({ newProduct: { name: 'Bread today' }, date: today, dateType: 'bestBefore' });
    const c = await addDate({ newProduct: { name: 'Yoghurt soon' }, date: addDays(today, 2), dateType: 'useBy' });
    await addDate({ newProduct: { name: 'Tins later' }, date: addDays(today, 90), dateType: 'bestBefore' });
    const r = render(<DateCheckScreen />);
    await settle();
    const rows = () => r.root.findAll((n: any) => typeof n.props.testID === 'string' && n.props.testID.startsWith('check-') && n.type === 'TouchableOpacity');
    expect(rows().map((n: any) => n.props.testID)).toEqual([`check-${a.batch.id}`, `check-${b.batch.id}`, `check-${c.batch.id}`]);
    const quick = (label: string, i: number) => r.root.findAll((n: any) => n.type === 'TouchableOpacity' && n.props.accessibilityLabel === label)[i];
    await act(async () => { quick('check.binned', 0).props.onPress(); await flush(); });
    await settle();
    expect((await getBatch(a.batch.id))?.status).toBe('closed');
    await act(async () => { quick('check.fine', 0).props.onPress(); await flush(); });
    await settle();
    expect((await getBatch(b.batch.id))?.events.map(e => e.kind)).toEqual(['checked']);
    await act(async () => { quick('check.soldOut', 0).props.onPress(); await flush(); });
    await settle();
    expect((await getBatch(c.batch.id))?.status).toBe('closed');
  });
});
