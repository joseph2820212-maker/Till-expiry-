// F09 (audit): RTL and shared-component pass.
import React from 'react';
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;

jest.mock('react-native', () => require('../../__tests__/helpers/screenStubs').rn);
jest.mock('react-i18next', () => require('../../__tests__/helpers/screenStubs').i18n());
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 47, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('../../theme/responsive', () => ({ fs: (v: number) => v, rs: (v: number) => v, isRTL: false, rowDir: 'row' }));
jest.mock('../HeaderTopBleed', () => ({ HeaderTopBleed: 'HeaderTopBleed' }));
jest.mock('../DemoBackArrow', () => ({ DemoBackArrow: 'DemoBackArrow' }));
let mockAfter = false;
jest.mock('../../utils/currency', () => ({ currencyAfter: () => mockAfter, useCurrencySymbol: () => '£', getCurrencyCode: () => 'GBP', symbolForCode: (c: string) => c, formatAmountForCurrency: (v: number, c: string) => `${c} ${v}` }));
jest.mock('../../i18n', () => ({ __esModule: true, default: { language: 'ar', t: (k: string) => k } }));

import { getSwitchThumbTranslate } from '../AppSwitch';
import { InputField } from '../InputField';
import { ScreenHeader, SLOT } from '../ScreenHeader';
import { LabelRow, LABEL_ROW_STACK_AT } from '../LabelRow';
import { PickerRow } from '../PickerSheet';
import { localizeDigits, groupNumber, normalizeArabicNumerals, FINANCIAL_DIGITS } from '../../utils/locale';

const render = (el: React.ReactElement) => { let r: any; act(() => { r = TestRenderer.create(el); }); return r; };
const flat = (style: any) => (Array.isArray(style) ? Object.assign({}, ...style.flat(Infinity).filter(Boolean)) : style ?? {});

describe('F09.1 AppSwitch is RTL-aware', () => {
  it('the thumb travels the other way in RTL, and stays put when off', () => {
    expect(getSwitchThumbTranslate(true, false)).toBe(20);
    expect(getSwitchThumbTranslate(true, true)).toBe(-20);
    expect(getSwitchThumbTranslate(false, false)).toBe(0);
    expect(getSwitchThumbTranslate(false, true)).toBe(0);
  });
});

describe('F09.2 InputField currency placement follows the language, not a demo flag', () => {
  it('prefix before the number when currencyAfter() is false, after it when true', () => {
    mockAfter = false;
    const a = render(<InputField label="x" value="1" onChangeText={() => {}} prefix="£" />);
    const texts = (r: any) => r.root.findAllByType('Text').map((t: any) => t.props.children);
    const rowChildren = (r: any) => r.root.findAllByType('View')[1].props.children.filter(Boolean).map((c: any) => c.type);
    expect(texts(a)).toContain('£');
    expect(rowChildren(a)[0]).toBe('Text');
    mockAfter = true;
    const b = render(<InputField label="x" value="1" onChangeText={() => {}} prefix="£" />);
    expect(texts(b)).toContain('£');
    expect(rowChildren(b)[0]).not.toBe('Text');
  });
});

describe('F09.4 financial digits are Western in Arabic', () => {
  it('localizeDigits is a no-op under the western policy; Arabic-Indic input is still normalised', () => {
    expect(FINANCIAL_DIGITS).toBe('western');
    expect(localizeDigits('1,234.567')).toBe('1,234.567'); // i18n language mocked as 'ar'
    expect(groupNumber(1234.5, 2, 2)).toBe('1,234.50');
    expect(normalizeArabicNumerals('٢٠٫٥'.replace('٫', '.'))).toBe('20.5');
  });
});

describe('F09.5 / F09.6 rows wrap instead of truncating', () => {
  it('PickerRow labels get two lines', () => {
    const r = render(<PickerRow label="A very long supplier name that used to be cut off" onPress={() => {}} />);
    expect(r.root.findAllByType('Text')[0].props.numberOfLines).toBe(2);
  });
  it('LabelRow: short values sit beside the label (two lines allowed); long values stack under it at full width, never shrunk', () => {
    const short = render(<LabelRow label="Margin" value="26.8%" />);
    const inline = short.root.findByProps({ testID: 'label-row-inline' });
    expect(flat(inline.props.style).flexDirection).toBe('row');
    const valueText = short.root.findAllByType('Text')[1];
    expect(valueText.props.numberOfLines).toBe(2);
    expect(valueText.props.adjustsFontSizeToFit).toBeUndefined();
    expect(flat(valueText.props.style).maxWidth).toBeUndefined();
    const long = render(<LabelRow label="Price" value="KWD 24.960 → KWD 26.400" />);
    expect('KWD 24.960 → KWD 26.400'.length).toBeGreaterThanOrEqual(LABEL_ROW_STACK_AT);
    const stacked = long.root.findByProps({ testID: 'label-row-stacked' });
    expect(flat(stacked.props.style).flexDirection).toBe('column');
  });
});

describe('F09.7 ScreenHeader is centred with symmetric sides', () => {
  const widths = (r: any) => [r.root.findByProps({ testID: 'screen-header-start' }), r.root.findByProps({ testID: 'screen-header-end' })].map(v => flat(v.props.style).width);
  it('back only: both sides one slot wide, title centred', () => {
    const r = render(<ScreenHeader title="Lists" onBack={() => {}} />);
    expect(widths(r)).toEqual([SLOT, SLOT]);
    const title = r.root.findAllByType('Text').find((t: any) => t.props.children === 'Lists');
    expect(flat(title.props.style).textAlign).toBe('center');
  });
  it('back + two actions: both sides two slots wide, every slot ≥ 44 dp with hitSlop', () => {
    const r = render(<ScreenHeader title="Shop floor" subtitle="20 items" onBack={() => {}} rightActions={[{ icon: '▮▮', label: 'scan', onPress: () => {} }, { icon: '⋯', label: 'more', onPress: () => {} }]} />);
    expect(widths(r)).toEqual([2 * SLOT, 2 * SLOT]);
    const slots = r.root.findAllByType('TouchableOpacity');
    expect(slots).toHaveLength(3);
    for (const s of slots) {
      expect(flat(s.props.style).width).toBe(44);
      expect(flat(s.props.style).height).toBe(44);
      expect(s.props.hitSlop).toBeTruthy();
    }
    expect(SLOT).toBe(44);
  });
});
