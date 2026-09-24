// F02 (audit): every limit reason renders a real sentence with its number — no "undefined" interpolation.
import React from 'react';
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;

jest.mock('react-native', () => require('../../../__tests__/helpers/screenStubs').rn);
jest.mock('react-i18next', () => ({ initReactI18next: { type: '3rdParty', init: () => {} }, useTranslation: () => ({ t: (k: string, o?: any) => (o && 'n' in o ? `${k}|n=${String(o.n)}` : o?.price ? `${k}|price=${o.price}` : k) }) }));
jest.mock('../../../components/AppKeyboardBottomSheet', () => ({ AppKeyboardBottomSheet: require('../../../__tests__/helpers/screenStubs').components.AppKeyboardBottomSheet }));
jest.mock('../../../components/AppButton', () => ({ AppButton: 'AppButton' }));
jest.mock('../../../theme/responsive', () => ({ fs: (v: number) => v, rs: (v: number) => v, isRTL: false, rowDir: 'row' }));
const mockBilling: any = { status: 'unknown', entitlement: { isPremium: false, packages: [], source: 'unknown' }, purchaseRecoveryPending: false, purchase: jest.fn(async () => ({ success: false, cancelled: true })), restore: jest.fn(async () => ({ success: false })), retry: jest.fn(async () => {}), refresh: jest.fn(async () => {}) };
jest.mock('../BillingProvider', () => ({ useBilling: () => mockBilling }));

import { FreeLimitSheet, type FreeLimitReason } from '../FreeLimitSheet';
import { LIMIT_CAPS } from '../limits';
import en from '../../../locales/en.json';

const render = (el: React.ReactElement) => { let r: any; act(() => { r = TestRenderer.create(el); }); return r; };
const REASONS: FreeLimitReason[] = ['products', 'proFeature'];

describe('FreeLimitSheet reasons', () => {
  it.each(REASONS)('%s: eyebrow and title get the cap number (or an empty n for Pro-only), never undefined', reason => {
    const r = render(<FreeLimitSheet reason={reason} onClose={() => {}} />);
    const texts = r.root.findAllByType('Text').map((t: any) => String(t.props.children));
    const expectedN = LIMIT_CAPS[reason] ?? '';
    expect(texts).toContain(`billing.limit.${reason}.eyebrow|n=${expectedN}`);
    expect(texts).toContain(`billing.limit.${reason}.title|n=${expectedN}`);
    expect(texts.join(' ')).not.toContain('undefined');
    const strings = (en as any).billing.limit[reason];
    expect(strings.eyebrow).toBeTruthy(); expect(strings.title).toBeTruthy(); expect(strings.keepsWorking).toBeTruthy();
  });
  it('renders nothing when there is no reason', () => {
    const r = render(<FreeLimitSheet reason={null} onClose={() => {}} />);
    expect(r.root.findAllByType('Text')).toHaveLength(0);
  });
});

describe('FreeLimitSheet — F07 purchase states', () => {
  const lifetimePkg = { key: 'lifetime', identifier: '$rc_lifetime', productIdentifier: 'x', title: 'Lifetime', priceString: 'GBP 14.99', rawPackage: {} };
  const buttons = (r: any) => r.root.findAllByType('AppButton').map((b: any) => b.props.label);
  beforeEach(() => { mockBilling.purchaseRecoveryPending = false; mockBilling.entitlement = { isPremium: false, packages: [], source: 'unknown' }; mockBilling.retry.mockClear(); });

  it('lifetime package present: Buy shows the lifetime price', () => {
    mockBilling.entitlement.packages = [lifetimePkg];
    const r = render(<FreeLimitSheet reason="products" onClose={() => {}} />);
    expect(buttons(r)).toContain('billing.unlockPro|price=GBP 14.99');
    expect(r.root.findAllByProps({ testID: 'billing-store-unavailable' })).toHaveLength(0);
  });
  it('no lifetime package (store unavailable or only foreign packages): no Buy button, an explanation, Retry and Restore', () => {
    mockBilling.entitlement.packages = [{ ...lifetimePkg, identifier: '$rc_monthly', priceString: 'GBP 2.99' }];
    const r = render(<FreeLimitSheet reason="products" onClose={() => {}} />);
    expect(buttons(r).some((l: string) => l.startsWith('billing.unlockPro'))).toBe(false);
    expect(r.root.findByProps({ testID: 'billing-store-unavailable' }).props.children).toBe('billing.storeUnavailable');
    expect(buttons(r)).toEqual(['billing.retry', 'billing.notNow', 'billing.restorePurchase']);
    act(() => { r.root.findAllByType('AppButton')[0].props.onPress(); });
    expect(mockBilling.retry).toHaveBeenCalled();
  });
  it('purchase recovery pending: Buy is withheld, the situation is explained, Retry and Restore are offered', () => {
    mockBilling.purchaseRecoveryPending = true;
    mockBilling.entitlement.packages = [lifetimePkg];
    const r = render(<FreeLimitSheet reason="products" onClose={() => {}} />);
    expect(buttons(r).some((l: string) => l.startsWith('billing.unlockPro'))).toBe(false);
    expect(r.root.findByProps({ testID: 'billing-recovery-pending' }).props.children).toBe('billing.purchaseEntitlementMissing');
    expect(buttons(r)).toEqual(['billing.retry', 'billing.notNow', 'billing.restorePurchase']);
  });
});

describe('closure — the sheet accepts the same lifetime package the service accepts', () => {
  it('a package with a custom RevenueCat identifier but the configured product id is purchasable', () => {
    const cfg = require('../billingConfig');
    const spy = jest.spyOn(cfg, 'isLifetimeProductId').mockImplementation((id: unknown) => id === 'com.tillcalc.unlock');
    mockBilling.purchaseRecoveryPending = false;
    mockBilling.entitlement = { isPremium: false, source: 'unknown', packages: [{ key: 'lifetime', identifier: 'custom_pack', productIdentifier: 'com.tillcalc.unlock', title: 'Unlock', priceString: 'GBP 14.99', rawPackage: {} }] };
    const r = render(<FreeLimitSheet reason="products" onClose={() => {}} />);
    expect(r.root.findAllByType('AppButton').map((b: any) => b.props.label)).toContain('billing.unlockPro|price=GBP 14.99');
    expect(r.root.findAllByProps({ testID: 'billing-store-unavailable' })).toHaveLength(0);
    spy.mockRestore();
  });
});
