import React from 'react';
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;

const mockGoBack = jest.fn();

jest.mock('react-native', () => ({
  StyleSheet: { create: <T,>(s: T) => s, hairlineWidth: 1 },
  View: 'View', Text: 'Text', ScrollView: 'ScrollView',
  TouchableOpacity: 'TouchableOpacity', TextInput: 'TextInput',
  Switch: 'Switch', StatusBar: 'StatusBar', ActivityIndicator: 'ActivityIndicator',
  I18nManager: { isRTL: false },
}));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack }),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string, opts?: any) => opts ? `${k}|${JSON.stringify(opts)}` : k }),
}));
jest.mock('../../../components/ScreenHeader', () => ({ ScreenHeader: 'ScreenHeader' }));
jest.mock('../../../theme/responsive', () => ({ fs: (v: number) => v, rs: (v: number) => v }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));

const mockSetCurrencyOption = jest.fn<Promise<void>, [string]>(async () => {});
jest.mock('../../../utils/currency', () => ({
  useCurrencySymbol: () => '£',
  useCurrencyCode: () => 'GBP',
  setCurrencyOption: (o: string) => mockSetCurrencyOption(o),
  SYMBOL_MAP: { '£ GBP': '£', '€ EUR': '€', '$ USD': '$' },
  currencyAfter: () => false,
}));
jest.mock('../../../components/AppSwitch', () => ({ AppSwitch: 'AppSwitch' }));

const MOCK_DEFAULTS = {
  purchaseTaxRate: 20,
  purchaseTaxBasis: 'exTax' as const,
  purchaseTaxRecoverable: true,
  salesTaxRate: 20,
  targetType: 'margin' as const,
  targetPercent: 35,
  paymentFeePercent: 1.69,
  paymentFeeFixed: 0.20,
  confirmed: false,
  tradingDaysPerWeek: 6,
  roundingRule: 'none' as const,
  unitsPerCardTransaction: 1,
  currency: 'GBP',
  schemaVersion: 2,
};

const mockLoadDefaults = jest.fn<Promise<typeof MOCK_DEFAULTS>, []>(async () => ({ ...MOCK_DEFAULTS }));
const mockUpdateDefaults = jest.fn<Promise<void>, [any]>(async () => {});


const mockChangeLanguage = jest.fn<Promise<{ reloaded: boolean; rolledBack: boolean }>, [string]>(async () => ({ reloaded: false, rolledBack: false }));
jest.mock('../../../i18n', () => ({
  __esModule: true,
  default: { language: 'en' },
  SUPPORTED_LANGUAGES: ['en', 'ar', 'tr', 'fr', 'es', 'de'],
  changeLanguage: (lang: string) => mockChangeLanguage(lang),
}));

const render = (el: React.ReactElement) => {
  let r: any;
  act(() => { r = TestRenderer.create(el); });
  return r;
};

const flushPromises = () => act(() => new Promise<void>((r) => setTimeout(r, 0)));

beforeEach(() => {
  mockGoBack.mockClear();
  mockSetCurrencyOption.mockClear();
  mockLoadDefaults.mockClear();
  mockUpdateDefaults.mockClear();
  mockChangeLanguage.mockClear();
  mockLoadDefaults.mockImplementation(async () => ({ ...MOCK_DEFAULTS }));
});

// ── CurrencyScreen ────────────────────────────────────────────────

describe('CurrencyScreen', () => {
  let CurrencyScreen: React.FC;
  beforeAll(() => {
    ({ CurrencyScreen } = require('../screens/CurrencyScreen'));
  });

  it('renders currency rows from SYMBOL_MAP', () => {
    const renderer = render(<CurrencyScreen />);
    const rows = renderer.root.findAllByType('TouchableOpacity');
    expect(rows.length).toBe(3); // £ GBP, € EUR, $ USD
  });

  it('shows active checkmark for current currency', () => {
    const renderer = render(<CurrencyScreen />);
    const icons = renderer.root.findAllByType('Ionicons');
    const checkmarks = icons.filter((i: any) => i.props.name === 'checkmark-circle');
    expect(checkmarks.length).toBe(1);
  });

  it('calls setCurrencyOption on row press', () => {
    const renderer = render(<CurrencyScreen />);
    const rows = renderer.root.findAllByType('TouchableOpacity');
    const eurRow = rows.find((r: any) => {
      const texts = r.findAllByType('Text');
      return texts.some((t: any) => t.props.children === 'EUR');
    });
    act(() => { eurRow.props.onPress(); });
    expect(mockSetCurrencyOption).toHaveBeenCalledWith('€ EUR');
  });

  it('renders header with correct title', () => {
    const renderer = render(<CurrencyScreen />);
    const header = renderer.root.findByType('ScreenHeader');
    expect(header.props.title).toBe('settings.currencyScreenTitle');
  });

  it('shows error banner when setCurrencyOption throws', async () => {
    mockSetCurrencyOption.mockImplementationOnce(async () => { throw new Error('storage fail'); });
    const renderer = render(<CurrencyScreen />);
    const eurRow = renderer.root.findAllByType('TouchableOpacity')
      .find((r: any) => {
        const texts = r.findAllByType('Text');
        return texts.some((t: any) => t.props.children === 'EUR');
      });
    await act(async () => { eurRow.props.onPress(); });
    await flushPromises();
    const errorTexts = renderer.root.findAllByType('Text')
      .filter((t: any) => t.props.children === 'settings.currencySaveFailed');
    expect(errorTexts.length).toBeGreaterThanOrEqual(1);
  });
});

// ── TaxDefaultsScreen ─────────────────────────────────────────────

// ── TargetDefaultsScreen ──────────────────────────────────────────

// ── PaymentFeesScreen ─────────────────────────────────────────────

// ── LanguageScreen ────────────────────────────────────────────────

describe('LanguageScreen', () => {
  let LanguageScreen: React.FC;
  beforeAll(() => {
    ({ LanguageScreen } = require('../screens/LanguageScreen'));
  });

  it('renders all 6 supported languages', () => {
    const renderer = render(<LanguageScreen />);
    const rows = renderer.root.findAllByType('TouchableOpacity');
    expect(rows.length).toBe(6);
  });

  it('shows checkmark for current language (en)', () => {
    const renderer = render(<LanguageScreen />);
    const icons = renderer.root.findAllByType('Ionicons');
    const checkmarks = icons.filter((i: any) => i.props.name === 'checkmark-circle');
    expect(checkmarks.length).toBe(1);
  });

  it('renders language labels (English, العربية, etc.)', () => {
    const renderer = render(<LanguageScreen />);
    const texts = renderer.root.findAllByType('Text').map((t: any) => t.props.children);
    expect(texts).toContain('English');
    expect(texts).toContain('العربية');
    expect(texts).toContain('Français');
    expect(texts).toContain('Deutsch');
  });

  it('calls changeLanguage on row press', async () => {
    const renderer = render(<LanguageScreen />);
    const frRow = renderer.root.findAllByType('TouchableOpacity')
      .find((r: any) => {
        const texts = r.findAllByType('Text');
        return texts.some((t: any) => t.props.children === 'Français');
      });
    await act(async () => { frRow.props.onPress(); });
    expect(mockChangeLanguage).toHaveBeenCalledWith('fr');
  });

  it('does not call changeLanguage for current language', async () => {
    const renderer = render(<LanguageScreen />);
    const enRow = renderer.root.findAllByType('TouchableOpacity')
      .find((r: any) => {
        const texts = r.findAllByType('Text');
        return texts.some((t: any) => t.props.children === 'English');
      });
    await act(async () => { enRow.props.onPress(); });
    expect(mockChangeLanguage).not.toHaveBeenCalled();
  });

  it('shows banner on rollback', async () => {
    mockChangeLanguage.mockImplementationOnce(async () => ({ reloaded: false, rolledBack: true }));
    const renderer = render(<LanguageScreen />);
    const trRow = renderer.root.findAllByType('TouchableOpacity')
      .find((r: any) => {
        const texts = r.findAllByType('Text');
        return texts.some((t: any) => t.props.children === 'Türkçe');
      });
    await act(async () => { trRow.props.onPress(); });
    const texts = renderer.root.findAllByType('Text').map((t: any) => t.props.children);
    const bannerText = texts.find((t: string) => typeof t === 'string' && t.includes('settings.languageRolledBack'));
    expect(bannerText).toBeDefined();
  });

  it('renders header with language title', () => {
    const renderer = render(<LanguageScreen />);
    const header = renderer.root.findByType('ScreenHeader');
    expect(header.props.title).toBe('settings.language');
  });

  it('blocks duplicate switch while switching', async () => {
    let resolveFn!: (v: { reloaded: boolean; rolledBack: boolean }) => void;
    mockChangeLanguage.mockImplementationOnce(() => new Promise((r) => { resolveFn = r; }));
    const renderer = render(<LanguageScreen />);
    const frRow = renderer.root.findAllByType('TouchableOpacity')
      .find((r: any) => {
        const texts = r.findAllByType('Text');
        return texts.some((t: any) => t.props.children === 'Français');
      });
    // First press — starts switching
    act(() => { frRow.props.onPress(); });
    await flushPromises();

    // Second press while first is in-flight
    const deRow = renderer.root.findAllByType('TouchableOpacity')
      .find((r: any) => {
        const texts = r.findAllByType('Text');
        return texts.some((t: any) => t.props.children === 'Deutsch');
      });
    act(() => { deRow.props.onPress(); });
    await flushPromises();

    // Resolve the first switch
    await act(async () => { resolveFn({ reloaded: false, rolledBack: false }); });

    expect(mockChangeLanguage).toHaveBeenCalledTimes(1);
    expect(mockChangeLanguage).toHaveBeenCalledWith('fr');
  });

  it('shows error banner when changeLanguage throws', async () => {
    mockChangeLanguage.mockImplementationOnce(async () => { throw new Error('network error'); });
    const renderer = render(<LanguageScreen />);
    const frRow = renderer.root.findAllByType('TouchableOpacity')
      .find((r: any) => {
        const texts = r.findAllByType('Text');
        return texts.some((t: any) => t.props.children === 'Français');
      });
    await act(async () => { frRow.props.onPress(); });
    await flushPromises();
    const bannerTexts = renderer.root.findAllByType('Text')
      .filter((t: any) => t.props.children === 'settings.languageChangeFailed');
    expect(bannerTexts.length).toBeGreaterThanOrEqual(1);
  });
});
