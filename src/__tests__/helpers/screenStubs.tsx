/**
 * Shared stubs for screen tests (carried over from TillCalc). Each test file still declares its
 * own jest.mock() calls (they are hoisted per file) but points them here so
 * every screen renders against the same light-weight components.
 */
import React from 'react';

export const rn = {
  StyleSheet: { create: <T,>(s: T) => s, hairlineWidth: 1, absoluteFill: {}, absoluteFillObject: {} },
  View: 'View', Text: 'Text', ScrollView: 'ScrollView', TouchableOpacity: 'TouchableOpacity', TextInput: 'TextInput',
  StatusBar: 'StatusBar', I18nManager: { isRTL: false }, Platform: { OS: 'android', select: (o: any) => o.android ?? o.default },
  Linking: { openSettings: jest.fn(async () => {}), openURL: jest.fn(async () => {}) },
  /** Renders header, section headers and rows; honours initialNumToRender like the real windowed list does on first mount. */
  SectionList: ({ sections, renderItem, renderSectionHeader, ListHeaderComponent, ListFooterComponent, initialNumToRender, testID }: any) => {
    let budget = initialNumToRender ?? Number.MAX_SAFE_INTEGER;
    const blocks: any[] = [];
    for (const section of sections) {
      blocks.push(React.createElement(React.Fragment, { key: `h-${section.key}` }, renderSectionHeader ? renderSectionHeader({ section }) : null));
      section.data.forEach((item: any, index: number) => {
        if (budget <= 0) return;
        budget -= 1;
        blocks.push(React.createElement(React.Fragment, { key: `i-${item.id ?? index}` }, renderItem({ item, index, section })));
      });
    }
    return React.createElement('SectionList', { testID }, ListHeaderComponent ?? null, ...blocks, ListFooterComponent ?? null);
  },
};

export const navState = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn(), params: {} as any, focused: true };
export const navigation = () => ({
  useNavigation: () => ({ navigate: navState.navigate, goBack: navState.goBack, replace: navState.replace }),
  useRoute: () => ({ params: navState.params }),
  useFocusEffect: (cb: () => void | (() => void)) => { React.useEffect(() => cb(), [cb]); },
  useIsFocused: () => navState.focused,
});

export const i18n = () => ({ initReactI18next: { type: '3rdParty', init: () => {} }, useTranslation: () => ({ t: (k: string, o?: any) => (o && Object.keys(o).length ? `${k}|${Object.entries(o).map(([a, b]) => `${a}=${b}`).join(',')}` : k) }) });

const passthrough = (name: string) => ({ children, ...props }: any) => React.createElement(name, props, children);
export const components = {
  ScreenHeader: 'ScreenHeader',
  AppButton: 'AppButton',
  InputField: 'InputField',
  DropdownField: 'DropdownField',
  ToggleSegment: 'ToggleSegment',
  AppSwitch: 'AppSwitch',
  HeaderTopBleed: 'HeaderTopBleed',
  RadioRow: passthrough('RadioRow'),
  PickerSheet: passthrough('PickerSheet'),
  PickerRow: 'PickerRow',
  AppKeyboardScrollView: passthrough('AppKeyboardScrollView'),
  AppKeyboardBottomSheet: ({ children, footer, visible, ...props }: any) => (visible ? React.createElement('BottomSheet', props, children, footer) : null),
  AppPdfPreviewScreen: 'AppPdfPreviewScreen',
  FreeLimitSheet: 'FreeLimitSheet',
};

/** Currency stub: UNSET like a fresh install (no inherited GBP); tests that need one pass it explicitly. */
export const currency = () => ({
  formatAmountForCurrency: (v: number, c: string) => `${c} ${Number(v).toFixed(2)}`,
  formatAmount: (v: number) => Number(v).toFixed(2),
  getCurrencyCode: () => '',
  isCurrencySet: () => false,
  symbolForCode: (c: string) => c,
  currencyAfter: () => false,
});

export const flush = () => new Promise(r => setTimeout(r, 0));
export const texts = (r: any): string[] => r.root.findAllByType('Text').map((t: any) => (Array.isArray(t.props.children) ? t.props.children.map((c: any) => (c == null ? '' : String(c))).join('') : t.props.children == null ? '' : String(t.props.children)));
export const button = (r: any, label: string) => r.root.findAllByType('AppButton').find((b: any) => b.props.label === label);
export const buttonStarting = (r: any, prefix: string) => r.root.findAllByType('AppButton').find((b: any) => String(b.props.label).startsWith(prefix));
export const input = (r: any, label: string) => r.root.findAllByType('InputField').find((i: any) => i.props.label === label);
export const inputs = (r: any, label: string) => r.root.findAllByType('InputField').filter((i: any) => i.props.label === label);
export const touchableWithText = (r: any, text: string) => r.root.findAllByType('TouchableOpacity').find((b: any) => b.findAllByType('Text').some((t: any) => t.props.children === text));
