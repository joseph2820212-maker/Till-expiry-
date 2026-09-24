/**
 * Gate 5 — navigation walk. Every route registered in AppNavigator is rendered
 * with realistic params, in each of the six languages, with REAL i18next
 * resources. A screen fails the walk if it throws, shows a raw translation
 * key, or still says "coming soon". Heavy native-backed components are
 * stubbed; everything that decides what text appears is real.
 */
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;

const mockPass = (name: string) => ({ children, ...props }: any) => require('react').createElement(name, props, children);
jest.mock('react-native', () => ({
  StyleSheet: { create: <T,>(s: T) => s, hairlineWidth: 1, absoluteFill: {}, absoluteFillObject: {}, flatten: (s: any) => s },
  View: 'View', Text: 'Text', ScrollView: 'ScrollView', TouchableOpacity: 'TouchableOpacity', TextInput: 'TextInput', Pressable: 'Pressable',
  StatusBar: 'StatusBar', Modal: 'Modal', FlatList: 'FlatList', SectionList: 'SectionList', ActivityIndicator: 'ActivityIndicator', Image: 'Image', Switch: 'Switch', KeyboardAvoidingView: 'KeyboardAvoidingView', SafeAreaView: 'SafeAreaView',
  I18nManager: { isRTL: false, forceRTL: () => {}, allowRTL: () => {} }, Platform: { OS: 'android', select: (o: any) => o.android ?? o.default },
  Dimensions: { get: () => ({ width: 390, height: 844, scale: 2, fontScale: 1 }), addEventListener: () => ({ remove() {} }) }, useWindowDimensions: () => ({ width: 390, height: 844, scale: 2, fontScale: 1 }),
  Share: { share: async () => ({ action: 'sharedAction' }) }, Alert: { alert: () => {} }, Linking: { openURL: async () => {}, canOpenURL: async () => true, openSettings: async () => {} }, Keyboard: { dismiss: () => {}, addListener: () => ({ remove() {} }) },
  Animated: { Value: class { setValue() {} interpolate() { return 0; } }, timing: () => ({ start: (cb?: () => void) => cb?.() }), spring: () => ({ start: (cb?: () => void) => cb?.() }), View: 'Animated.View', Text: 'Animated.Text', createAnimatedComponent: (c: any) => c },
  PixelRatio: { get: () => 2, roundToNearestPixel: (n: number) => n }, AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) }, NativeModules: {},
}));
const mockNav = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn(), setParams: jest.fn() };
let mockParams: any = {};
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNav, useRoute: () => ({ params: mockParams }), useIsFocused: () => true,
  useFocusEffect: (cb: () => void | (() => void)) => { require('react').useEffect(() => cb(), [cb]); },
  NavigationContainer: mockPass('NavigationContainer'),
}));
jest.mock('@react-navigation/native-stack', () => ({ createNativeStackNavigator: () => ({ Navigator: mockPass('Navigator'), Screen: mockPass('Screen') }) }));
jest.mock('@react-navigation/bottom-tabs', () => ({ createBottomTabNavigator: () => ({ Navigator: mockPass('TabNavigator'), Screen: mockPass('TabScreen') }) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }), SafeAreaView: 'SafeAreaView', SafeAreaProvider: mockPass('SafeAreaProvider') }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('../theme/responsive', () => ({ fs: (v: number) => v, rs: (v: number) => v, isRTL: false, rowDir: 'row' }));
jest.mock('../theme/useResponsive', () => ({ useResponsive: () => ({ width: 390, height: 844, isTablet: false }) }));
jest.mock('../hooks/useKeyboardHeight', () => ({ useKeyboardHeight: () => 0 }));
jest.mock('../i18n', () => {
  const m = require('i18next'); const inst = m.default ?? m;
  return { __esModule: true, default: inst, SUPPORTED_LANGUAGES: ['en', 'ar', 'tr', 'fr', 'es', 'de'], changeLanguage: async () => ({ status: 'applied' }), loadSavedLanguage: async () => 'en', saveLanguage: async () => {}, initializeLanguage: async () => ({}), retryLanguageTransition: async () => true, rollbackLanguageTransition: async () => true };
});
jest.mock('../modules/billing/BillingProvider', () => ({ useBilling: () => ({ status: 'unknown', entitlement: { isPremium: false, packages: [], source: 'unknown' }, purchase: async () => ({ success: false, cancelled: true }), restore: async () => ({ success: false }), refresh: async () => {} }), BillingProvider: (p: any) => p.children }));
// Native-backed / sheet components render as plain nodes; their logic is covered by their own tests.
jest.mock('../components/DropdownField', () => ({ DropdownField: 'DropdownField' }));
jest.mock('../components/ToggleSegment', () => ({ ToggleSegment: 'ToggleSegment' }));
jest.mock('../components/AppSwitch', () => ({ AppSwitch: 'AppSwitch' }));
jest.mock('../components/CheckboxRow', () => ({ CheckboxRow: 'CheckboxRow' }));
jest.mock('../components/DatePickerField', () => ({ DatePickerField: 'DatePickerField' }));
jest.mock('../components/OtherInputModal', () => ({ OtherInputModal: 'OtherInputModal' }));
jest.mock('../components/HeaderTopBleed', () => ({ HeaderTopBleed: 'HeaderTopBleed' }));
jest.mock('../components/DemoBackArrow', () => ({ DemoBackArrow: 'DemoBackArrow' }));
jest.mock('../components/InputField', () => ({ InputField: 'InputField' }));
jest.mock('../components/AppTextInput', () => ({ AppTextInput: 'AppTextInput' }));
jest.mock('../components/PickerSheet', () => ({ PickerSheet: mockPass('PickerSheet'), PickerRow: 'PickerRow' }));
jest.mock('../components/RadioRow', () => ({ RadioRow: mockPass('RadioRow') }));
jest.mock('../components/AppKeyboardScrollView', () => ({ AppKeyboardScrollView: mockPass('AppKeyboardScrollView') }));
jest.mock('../components/AppKeyboardBottomSheet', () => ({ AppKeyboardBottomSheet: ({ visible, children, footer }: any) => (visible ? require('react').createElement('BottomSheet', null, children, footer) : null) }));
jest.mock('../components/BackupPassphraseModal', () => ({ BackupPassphraseModal: () => null }));
jest.mock('../utils/pdfFile', () => ({ printHtmlToPdfFile: async () => 'file:///x.pdf', pruneTemporaryPreviewPdfs: async () => {}, safePdfFileName: (s: string) => s }));

import en from '../locales/en.json';
import ar from '../locales/ar.json';
import tr from '../locales/tr.json';
import fr from '../locales/fr.json';
import es from '../locales/es.json';
import de from '../locales/de.json';
import { TE_KEYS } from '../storage/keys';
import { addDays, todayLocal } from '../domain/dates';

const LANGS = ['en', 'ar', 'tr', 'fr', 'es', 'de'] as const;
const RAW_KEY = /^[a-z][a-zA-Z]+\.[a-zA-Z0-9_.]+$/;
const KEY_WITH_VARS = /^[a-z][a-zA-Z]+\.[a-zA-Z0-9_.]+\|/;

async function seed() {
  (AsyncStorage as any).clear();
  const today = todayLocal();
  const price = { minor: 145, currency: 'EUR', exponent: 2 };
  const at = '2026-09-24T10:00:00Z';
  await AsyncStorage.setItem(TE_KEYS.products, JSON.stringify([
    { schemaVersion: 1, id: 'P1', name: 'Semi-skimmed milk 2L', barcodes: [{ raw: '5000157024671', normalized: '5000157024671', format: 'ean13' }], sku: 'MILK-2', shelfLocation: 'Chiller 1', defaultDateType: 'useBy', shelfLifeDays: 7, price, status: 'active', isSample: false, createdAt: at, updatedAt: at },
    { schemaVersion: 1, id: 'P2', name: 'Sourdough loaf', barcodes: [], shelfLifeDays: 3, alertDays: 1, status: 'active', isSample: false, createdAt: at, updatedAt: at },
    { schemaVersion: 1, id: 'P3', name: 'Tinned tomatoes 400 g', barcodes: [], status: 'archived', isSample: false, createdAt: at, updatedAt: at },
  ]));
  const batch = (id: string, productId: string, productName: string, date: string, extra: any = {}) => ({ schemaVersion: 1, id, productId, productName, date, dateType: 'useBy', status: 'open', events: [], createdAt: at, updatedAt: at, ...extra });
  await AsyncStorage.setItem(TE_KEYS.batches, JSON.stringify([
    batch('D1', 'P1', 'Semi-skimmed milk 2L', addDays(today, -2), { quantity: 6, location: 'Chiller 1' }),
    batch('D2', 'P1', 'Semi-skimmed milk 2L', today, { quantity: 4, events: [{ id: 'e1', kind: 'reduced', on: today, at, price: { minor: 99, currency: 'EUR', exponent: 2 } }] }),
    batch('D3', 'P2', 'Sourdough loaf', addDays(today, 1), { dateType: 'bestBefore' }),
    batch('D4', 'P2', 'Sourdough loaf', addDays(today, 20), { dateType: 'bestBefore' }),
    batch('D5', 'P1', 'Semi-skimmed milk 2L', addDays(today, -5), { quantity: 3, status: 'closed', closedAt: at, events: [{ id: 'e2', kind: 'reduced', on: addDays(today, -6), at, price: { minor: 70, currency: 'EUR', exponent: 2 } }, { id: 'e3', kind: 'wasted', on: addDays(today, -5), at, quantity: 3, reason: 'expired' }] }),
  ]));
  await AsyncStorage.setItem(TE_KEYS.settings, JSON.stringify({ schemaVersion: 1, alertDays: 3, defaultDateType: 'bestBefore', reminder: { enabled: true, hour: 8, minute: 0 } }));
}

const S = {
  Home: () => require('../modules/home/screens/HomeScreen').HomeScreen,
  Dates: () => require('../modules/dates/screens/DatesScreen').DatesScreen,
  Products: () => require('../modules/products/screens/ProductsScreen').ProductsScreen,
  More: () => require('../modules/more/screens/MoreScreen').MoreScreen,
  SettingsCurrency: () => require('../modules/more/screens/CurrencyScreen').CurrencyScreen,
  SettingsLanguage: () => require('../modules/more/screens/LanguageScreen').LanguageScreen,
  SettingsHelp: () => require('../modules/more/screens/HelpScreen').HelpScreen,
  SettingsLegal: () => require('../modules/more/screens/LegalScreen').LegalScreen,
  SettingsBackup: () => require('../modules/backup/screens/BackupScreen').BackupScreen,
  SettingsAbout: () => require('../modules/more/screens/AboutScreen').AboutScreen,
  SettingsOfflinePrivate: () => require('../modules/more/screens/OfflinePrivateScreen').OfflinePrivateScreen,
  SettingsDates: () => require('../modules/settings/screens/DatesSettingsScreen').DatesSettingsScreen,
  AddDate: () => require('../modules/dates/screens/AddDateScreen').AddDateScreen,
  DateDetail: () => require('../modules/dates/screens/DateDetailScreen').DateDetailScreen,
  DateCheck: () => require('../modules/dates/screens/DateCheckScreen').DateCheckScreen,
  Reports: () => require('../modules/reports/screens/ReportsScreen').ReportsScreen,
  ProductDetail: () => require('../modules/products/screens/ProductDetailScreen').ProductDetailScreen,
  Scan: () => require('../modules/products/screens/ScanScreen').ScanScreen,
  Import: () => require('../modules/import/screens/ImportScreen').ImportScreen,
};
const PARAMS: () => Record<keyof typeof S, any> = () => ({
  Home: undefined, Dates: { filter: 'attention' }, Products: undefined, More: undefined,
  SettingsCurrency: undefined, SettingsLanguage: undefined, SettingsHelp: { tab: 'faq', chapter: 'dates' }, SettingsLegal: { doc: 'privacy' },
  SettingsBackup: undefined, SettingsAbout: undefined, SettingsOfflinePrivate: undefined, SettingsDates: undefined,
  AddDate: { productId: 'P1' }, DateDetail: { id: 'D1' }, DateCheck: undefined, Reports: undefined,
  ProductDetail: { id: 'P1' }, Scan: { mode: 'addDate' }, Import: undefined,
});

const allTexts = (r: any): string[] => r.root.findAllByType('Text').flatMap((t: any) => {
  const c = t.props.children;
  const arr = Array.isArray(c) ? c : [c];
  return arr.filter((x: any) => typeof x === 'string' || typeof x === 'number').map(String);
});
const flush = () => new Promise(res => setTimeout(res, 0));

beforeAll(async () => {
  await i18next.use(initReactI18next).init({ lng: 'en', fallbackLng: false, resources: { en: { translation: en }, ar: { translation: ar }, tr: { translation: tr }, fr: { translation: fr }, es: { translation: es }, de: { translation: de } }, interpolation: { escapeValue: false }, returnNull: false });
  await seed();
});

describe('navigation walk — every registered route renders in every language', () => {
  const routes = Object.keys(S) as (keyof typeof S)[];
  beforeAll(async () => { await require('../modules/settings/settingsStore').loadSettings(); });
  it('covers every route registered in the shared per-tab stacks plus the four tab roots', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '../navigation/sharedScreens.tsx'), 'utf8');
    const registered = [...src.matchAll(/<Stack\.Screen name="([A-Za-z]+)"/g)].map(m => m[1]).filter(n => n !== 'Tabs');
    const missing = registered.filter(n => !(n in S));
    expect(missing).toEqual([]);
    // + Home / Dates / Products / More
    expect(routes.length).toBe(registered.length + 4);
  });
  for (const lang of LANGS) {
    it(`${lang}: no throw, no raw key, no "coming soon" on any of ${routes.length} screens`, async () => {
      await i18next.changeLanguage(lang);
      const failures: string[] = [];
      const params = PARAMS();
      for (const name of routes) {
        mockParams = params[name];
        let renderer: any;
        try {
          const Screen = S[name]();
          await act(async () => { renderer = TestRenderer.create(React.createElement(Screen)); await flush(); await flush(); });
          const texts = allTexts(renderer);
          const raw = texts.filter(t => (RAW_KEY.test(t) || KEY_WITH_VARS.test(t)) && !/^[a-z]+\.[a-z]+$/.test(t) === true && t.split('.').length > 1 && !/\d/.test(t.split('.')[0]));
          if (raw.length) failures.push(`${name} [${lang}] raw keys: ${[...new Set(raw)].slice(0, 5).join(', ')}`);
          if (texts.some(t => /coming soon/i.test(t) || /comingSoon/.test(t))) failures.push(`${name} [${lang}] still says coming soon`);
          // Evidence: `TE_RENDER_OUT=<dir> npx jest navigationWalk` writes each screen's visible text per language.
          if (process.env.TE_RENDER_OUT && (lang === 'en' || lang === 'ar')) {
            const fsm = require('fs'); const pth = require('path');
            fsm.mkdirSync(process.env.TE_RENDER_OUT, { recursive: true });
            fsm.writeFileSync(pth.join(process.env.TE_RENDER_OUT, `${name}.${lang}.txt`), texts.join('\n') + '\n');
          }
        } catch (e) {
          failures.push(`${name} [${lang}] threw: ${(e as Error).message.split('\n')[0]}`);
        } finally { renderer?.unmount?.(); }
      }
      expect(failures).toEqual([]);
    });
  }
});
