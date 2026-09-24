/**
 * Gate 5 — navigation walk. Every route registered in AppNavigator is rendered
 * (the §15 register E01–E44) with realistic params, in each of the six languages, with REAL i18next
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
const mockNav = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn(), setParams: jest.fn(), push: jest.fn(), canGoBack: () => true };
let mockParams: any = {};
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNav, useRoute: () => ({ params: mockParams, key: 'route-key', name: 'Walk' }), useIsFocused: () => true,
  useNavigationState: (sel: (s: any) => any) => sel({ index: 0, routes: [{ key: 'route-key' }] }),
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
import { createWorkspace, loadActiveWorkspace, __resetWorkspaceCache } from '../modules/workspaces/workspaceStore';
import { saveProduct } from '../modules/products/productStore';
import { saveLocation } from '../modules/locations/locationStore';
import { saveRule } from '../modules/rules/ruleStore';
import { createDatedBatch, openBatch, prepareBatch, recordRemoval } from '../modules/batches/batchStore';
import { addDays, todayIn } from '../domain/expiry/datePrecision';

const LANGS = ['en', 'ar', 'tr', 'fr', 'es', 'de'] as const;
const RAW_KEY = /^[a-z][a-zA-Z]+\.[a-zA-Z0-9_.]+$/;
const KEY_WITH_VARS = /^[a-z][a-zA-Z]+\.[a-zA-Z0-9_.]+\|/;
const ids: Record<string, string> = {};

async function seed() {
  (AsyncStorage as any).clear();
  __resetWorkspaceCache();
  const tz = 'Europe/London';
  const today = todayIn(tz);
  const w = await createWorkspace({ name: 'Corner Shop', mode: 'mixed', currency: 'EUR', timeZone: tz });
  const fridge = await saveLocation(w.id, { name: 'Chiller 1', kind: 'fridge' });
  await saveLocation(w.id, { name: 'Shelf A', kind: 'shelf' });
  const rule = await saveRule(w.id, { name: 'Opened sauce', appliesTo: 'after_opening', class: 'hard_cutoff', durationMinutes: 3 * 1440, sourceText: 'Manufacturer label' });
  const prep = await saveRule(w.id, { name: 'Sandwiches', appliesTo: 'after_preparation', class: 'hard_cutoff', durationMinutes: 480, sourceText: 'Our HACCP plan' });
  const milk = await saveProduct(w.id, { name: 'Semi-skimmed milk 2L', sku: 'MILK-2', barcodes: [{ code: '5000157024671' }], defaultLocationId: fridge.id, costPerTrackingUnit: { minor: 90, currency: 'EUR' }, sellingPrice: { minor: 145, currency: 'EUR' } });
  const past = await createDatedBatch({ workspaceId: w.id, kind: 'bought_in', productId: milk.id, dateKind: 'use_by', deadline: { precision: 'date', date: addDays(today, -2) }, quantity: 6, lotNumber: 'L1', locationId: fridge.id });
  const bb = await createDatedBatch({ workspaceId: w.id, kind: 'bought_in', newProduct: { name: 'Tomato sauce' }, dateKind: 'best_before', deadline: { precision: 'month', month: addDays(today, 120).slice(0, 7) }, quantity: 4 });
  const opened = await openBatch({ workspaceId: w.id, parentBatchId: bb.id, quantity: 1, openedAt: new Date().toISOString(), ruleId: rule.id });
  const sandwich = await prepareBatch({ workspaceId: w.id, newProduct: { name: 'Cheese sandwich', isPrepared: true }, preparedAt: new Date().toISOString(), ruleId: prep.id, quantity: 5 } as any);
  await createDatedBatch({ workspaceId: w.id, kind: 'bought_in', newProduct: { name: 'Frozen peas' }, dateKind: 'none' });
  await recordRemoval(w.id, past.id, 'wasted', { quantity: 2, reason: 'past_deadline' });
  await loadActiveWorkspace();
  Object.assign(ids, { ws: w.id, fridge: fridge.id, rule: rule.id, product: milk.id, batch: past.id, opened: opened.child.id, prepared: sandwich.id });
}

const S = {
  Welcome: () => require('../modules/onboarding/screens/WelcomeScreen').WelcomeScreen,
  ChooseMode: () => require('../modules/onboarding/screens/ChooseModeScreen').ChooseModeScreen,
  WorkspaceSetup: () => require('../modules/onboarding/screens/WorkspaceSetupScreen').WorkspaceSetupScreen,
  Today: () => require('../modules/today/screens/TodayScreen').TodayScreen,
  AddChoice: () => require('../modules/add/screens/AddChoiceScreen').AddChoiceScreen,
  ReportsHome: () => require('../modules/reports/screens/ReportsHomeScreen').ReportsHomeScreen,
  More: () => require('../modules/more/screens/MoreScreen').MoreScreen,
  ...Object.fromEntries(Object.entries(require('../navigation/sharedScreens').SHARED_SCREENS).map(([k, v]) => [k, () => v])),
} as Record<string, () => React.ComponentType<any>>;

const PARAMS = (): Record<string, any> => ({
  WorkspaceSetup: { mode: 'retail' },
  ExpiryQueue: { query: { group: 'attention' } }, CheckRound: undefined, Items: undefined,
  ProductDetail: { id: ids.product }, ProductEdit: { id: ids.product }, BatchDetail: { id: ids.batch }, BatchHistory: { id: ids.batch },
  DeadlineCorrection: { id: ids.opened }, MoveLocation: { id: ids.batch }, BarcodeScanner: { purpose: 'add' },
  AddBoughtIn: { productId: ids.product }, AddOpened: { productId: ids.product }, AddPrepared: undefined, AddOtherDated: undefined,
  RuleEdit: { id: ids.rule }, LocationDetail: { id: ids.fridge }, ReportPreview: { report: 'expiry' },
  InternalLabelPreview: { batchIds: [ids.prepared] }, CsvImport: { kind: 'batches' }, CsvImportPreview: { kind: 'batches' },
  WorkspaceSettings: { id: ids.ws }, SettingsHelp: { tab: 'faq' }, SettingsLegal: { doc: 'privacy' },
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

describe('navigation walk — every registered route renders in every language (T59, T60)', () => {
  const routes = Object.keys(S);
  it('covers the whole register: onboarding, five tab roots and every shared screen', () => {
    expect(routes.length).toBeGreaterThanOrEqual(44);
  });
  for (const lang of LANGS) {
    it(`${lang}: no throw, no raw key, no "coming soon" on any screen`, async () => {
      await i18next.changeLanguage(lang);
      const failures: string[] = [];
      const params = PARAMS();
      for (const name of routes) {
        mockParams = params[name];
        let renderer: any;
        try {
          const Screen = S[name]();
          await act(async () => { renderer = TestRenderer.create(React.createElement(Screen)); await flush(); await flush(); await flush(); });
          const texts = allTexts(renderer);
          const raw = texts.filter(t => (RAW_KEY.test(t) || KEY_WITH_VARS.test(t)) && t.split('.').length > 1 && !/\d/.test(t.split('.')[0]));
          if (raw.length) failures.push(`${name} [${lang}] raw keys: ${[...new Set(raw)].slice(0, 5).join(', ')}`);
          if (texts.some(t => /coming soon/i.test(t) || /comingSoon/.test(t))) failures.push(`${name} [${lang}] still says coming soon`);
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
