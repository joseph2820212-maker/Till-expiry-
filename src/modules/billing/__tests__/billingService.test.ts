// Mock billingConfig to provide a test API key so configureBilling() doesn't throw.
jest.mock('../billingConfig', () => {
  const actual = jest.requireActual('../billingConfig');
  return {
    ...actual,
    getRevenueCatApiKey: jest.fn(() => 'test_api_key_for_jest'),
  };
});

import {
  BILLING_ENTITLEMENT_ID,
  BILLING_OFFERING_ID,
  BILLING_PACKAGE_IDS,
} from '../billingConfig';
import Purchases from 'react-native-purchases';
import {
  BillingEntitlementMissingAfterPurchaseError,
  BillingPurchaseCancelledError,
  classifyBillingError,
  getBillingSnapshot,
  hasPremiumEntitlement,
  purchasePackage,
} from '../billingService';
import { isCachedEntitlementValid } from '../billingStorage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

describe('billing service entitlement handling', () => {
  const now = Date.parse('2026-06-26T12:00:00.000Z');

  beforeEach(() => {
    jest.clearAllMocks();
    Platform.OS = 'ios';
  });

  const storePackage = (identifier: string, productId: string, priceString = 'GBP 14.99') => ({
    identifier,
    product: { identifier: productId, title: identifier, priceString },
  });

  it('F07: only the lifetime package is offered — monthly / yearly / trial packages are ignored, no first-package fallback', async () => {
    const purchases = Purchases as jest.Mocked<typeof Purchases>;
    purchases.getCustomerInfo.mockResolvedValue({ entitlements: { active: {} } } as never);
    purchases.getOfferings.mockResolvedValue({
      current: { availablePackages: [storePackage('$rc_monthly', 'com.tillcalc.pro.monthly'), storePackage('$rc_annual', 'com.tillcalc.pro.yearly'), storePackage('$rc_lifetime', 'com.tillcalc.pro.lifetime')] },
      all: {},
    } as never);
    const state = await getBillingSnapshot();
    expect(state.packages).toHaveLength(1);
    expect(state.packages[0]).toMatchObject({ key: 'lifetime', identifier: '$rc_lifetime', productIdentifier: 'com.tillcalc.pro.lifetime', priceString: 'GBP 14.99' });
    expect(state.canPurchase).toBe(true);
    expect(purchases.checkTrialOrIntroductoryPriceEligibility).not.toHaveBeenCalled();

    purchases.getOfferings.mockResolvedValueOnce({ current: { availablePackages: [storePackage('$rc_monthly', 'com.tillcalc.pro.monthly')] }, all: {} } as never);
    const none = await getBillingSnapshot();
    expect(none.packages).toEqual([]); // a store with no lifetime package sells nothing — never "the first one"
    expect(none.canPurchase).toBe(false);
  });

  it('F07: a package is recognised by the configured product id, never by a name containing "life"', async () => {
    const purchases = Purchases as jest.Mocked<typeof Purchases>;
    const cfg = require('../billingConfig');
    const spy = jest.spyOn(cfg, 'isLifetimeProductId').mockImplementation((id: unknown) => id === 'com.tillcalc.unlock');
    purchases.getCustomerInfo.mockResolvedValue({ entitlements: { active: {} } } as never);
    purchases.getOfferings.mockResolvedValueOnce({
      current: { availablePackages: [storePackage('custom_pack', 'com.tillcalc.unlock'), storePackage('life_of_brian', 'com.example.lifetime.fake')] },
      all: {},
    } as never);
    const state = await getBillingSnapshot();
    expect(state.packages.map(p => p.productIdentifier)).toEqual(['com.tillcalc.unlock']);
    spy.mockRestore();
  });

  it('uses the expected RevenueCat entitlement, offering and package IDs', () => {
    expect(BILLING_ENTITLEMENT_ID).toBe('pro');
    expect(BILLING_OFFERING_ID).toBe('default');
    expect(BILLING_PACKAGE_IDS).toEqual({ lifetime: '$rc_lifetime' });
  });

  it('maps provider failures to controlled user-safe codes', () => {
    expect(classifyBillingError({ code: '10', message: 'Opaque localized provider message' }, 'purchase_failed'))
      .toBe('network');
    expect(classifyBillingError({ code: '35', message: 'Opaque localized provider message' }, 'restore_failed'))
      .toBe('network');
    expect(classifyBillingError({ code: '2', message: 'Opaque localized provider message' }, 'purchase_failed'))
      .toBe('store_unavailable');
    expect(classifyBillingError(new Error('opaque provider detail'), 'purchase_failed'))
      .toBe('purchase_failed');
  });

  it('recognises the RevenueCat cancellation code without the deprecated flag', async () => {
    const purchases = Purchases as jest.Mocked<typeof Purchases>;
    purchases.purchasePackage.mockRejectedValueOnce({
      code: '1',
      userCancelled: null,
      message: 'Opaque cancellation message',
    });

    await expect(purchasePackage({
      key: 'lifetime', identifier: '$rc_lifetime', productIdentifier: 'com.tillcalc.pro.lifetime',
      title: 'Lifetime', priceString: 'test', rawPackage: {},
    })).rejects.toBeInstanceOf(BillingPurchaseCancelledError);
  });

  it('returns premium subscription state for an active pro entitlement', () => {
    const state = hasPremiumEntitlement({
      managementURL: 'https://apps.apple.com/account/subscriptions',
      entitlements: {
        active: {
          pro: {
            expirationDate: '2026-07-26T12:00:00.000Z',
            productIdentifier: 'com.tillcalc.pro.monthly',
            willRenew: true,
          },
        },
      },
    });

    expect(state.isPremium).toBe(true);
    expect(state.source).toBe('subscription');
    expect(state.activeEntitlementId).toBe('pro');
    expect(state.expirationDate).toBe('2026-07-26T12:00:00.000Z');
    expect(state.willRenew).toBe(true);
    expect(state.managementUrl).toBe('https://apps.apple.com/account/subscriptions');
  });

  it('returns non-premium state when no pro entitlement is active', () => {
    const state = hasPremiumEntitlement({ entitlements: { active: {} } });

    expect(state.isPremium).toBe(false);
    expect(state.source).toBe('unknown');
    expect(state.activeEntitlementId).toBeUndefined();
  });

  it('recognises the lifetime unlock ONLY by the configured product id (no expiry + unknown id stays "unknown" and is not trusted offline)', () => {
    const cfg = require('../billingConfig');
    const spy = jest.spyOn(cfg, 'isLifetimeProductId').mockImplementation((id: unknown) => id === 'com.tillcalc.pro.lifetime');
    const unknown = hasPremiumEntitlement({ entitlements: { active: { pro: { expirationDate: null, productIdentifier: 'com.example.lifetime.fake', willRenew: false } } } });
    expect(unknown.isPremium).toBe(true);
    expect(unknown.source).toBe('unknown');
    expect(isCachedEntitlementValid({ isPremium: true, source: unknown.source, activeEntitlementId: 'pro', expirationDate: null, willRenew: false, lastVerifiedAt: '2026-06-24T11:00:00.000Z', managementUrl: null }, now)).toBe(false);
    const promo = hasPremiumEntitlement({ entitlements: { active: { pro: { expirationDate: null, productIdentifier: 'rc_promo', store: 'PROMOTIONAL' } } } });
    expect(promo.source).toBe('lifetime');
    const state = hasPremiumEntitlement({
      entitlements: {
        active: {
          pro: {
            expirationDate: null,
            productIdentifier: 'com.tillcalc.pro.lifetime',
            willRenew: false,
          },
        },
      },
    });

    expect(state.isPremium).toBe(true);
    expect(state.source).toBe('lifetime');
    expect(state.expirationDate).toBeNull();
    spy.mockRestore();
  });

  it('allows valid cached pro access but blocks expired subscription cache', () => {
    expect(isCachedEntitlementValid({
      isPremium: true,
      source: 'subscription',
      activeEntitlementId: 'pro',
      expirationDate: '2026-06-27T12:00:00.000Z',
      willRenew: true,
      lastVerifiedAt: '2026-06-26T11:00:00.000Z',
      managementUrl: null,
    }, now)).toBe(true);

    expect(isCachedEntitlementValid({
      isPremium: true,
      source: 'subscription',
      activeEntitlementId: 'pro',
      expirationDate: '2026-06-25T12:00:00.000Z',
      willRenew: false,
      lastVerifiedAt: '2026-06-24T11:00:00.000Z',
      managementUrl: null,
    }, now)).toBe(false);

    expect(isCachedEntitlementValid({
      isPremium: true,
      source: 'lifetime',
      activeEntitlementId: 'pro',
      expirationDate: null,
      willRenew: false,
      lastVerifiedAt: '2026-06-24T11:00:00.000Z',
      managementUrl: null,
    }, now)).toBe(true);
  });

  it('verifies a paid entitlement even when offerings are unavailable', async () => {
    const purchases = Purchases as jest.Mocked<typeof Purchases>;
    purchases.getCustomerInfo.mockResolvedValueOnce({
      entitlements: { active: { pro: { expirationDate: '2026-07-26T12:00:00.000Z', productIdentifier: 'com.tillcalc.pro.monthly' } } },
    } as never);
    purchases.getOfferings.mockImplementationOnce(() => new Promise(() => {}));

    const state = await getBillingSnapshot();

    expect(state.isPremium).toBe(true);
    expect(state.packages).toEqual([]);
    expect(state.canPurchase).toBe(false);
    expect(state.lastError).toBeNull();
  });

  it('refreshes CustomerInfo once after a completed purchase before reporting success', async () => {
    const purchases = Purchases as jest.Mocked<typeof Purchases>;
    purchases.purchasePackage.mockResolvedValueOnce({ customerInfo: { entitlements: { active: {} } } } as never);
    purchases.getCustomerInfo.mockImplementationOnce(async () => {
      expect(await AsyncStorage.getItem('billing:purchase_recovery_pending')).toContain('com.tillcalc.pro.lifetime');
      return {
        entitlements: { active: { pro: { expirationDate: null, productIdentifier: 'com.tillcalc.pro.lifetime' } } },
      } as never;
    });

    const state = await purchasePackage({
      key: 'lifetime', identifier: '$rc_lifetime', productIdentifier: 'com.tillcalc.pro.lifetime',
      title: 'Lifetime', priceString: 'test', rawPackage: {},
    });

    expect(state.isPremium).toBe(true);
    expect(purchases.getCustomerInfo).toHaveBeenCalledTimes(1);
  });

  it('uses the specialized recovery error when a completed purchase still has no entitlement', async () => {
    const purchases = Purchases as jest.Mocked<typeof Purchases>;
    purchases.purchasePackage.mockResolvedValueOnce({ customerInfo: { entitlements: { active: {} } } } as never);
    purchases.getCustomerInfo.mockResolvedValueOnce({ entitlements: { active: {} } } as never);

    await expect(purchasePackage({
      key: 'lifetime', identifier: '$rc_lifetime', productIdentifier: 'com.tillcalc.pro.lifetime',
      title: 'Lifetime', priceString: 'test', rawPackage: {},
    })).rejects.toBeInstanceOf(BillingEntitlementMissingAfterPurchaseError);
    expect(await AsyncStorage.getItem('billing:purchase_recovery_pending')).toContain('com.tillcalc.pro.lifetime');
  });

  it('keeps the specialized recovery path when marker persistence fails', async () => {
    const purchases = Purchases as jest.Mocked<typeof Purchases>;
    purchases.purchasePackage.mockResolvedValueOnce({ customerInfo: { entitlements: { active: {} } } } as never);
    purchases.getCustomerInfo.mockResolvedValueOnce({ entitlements: { active: {} } } as never);
    const originalSetItem = AsyncStorage.setItem.bind(AsyncStorage);
    jest.spyOn(AsyncStorage, 'setItem').mockImplementation((key, value) => (
      key === 'billing:purchase_recovery_pending'
        ? Promise.reject(new Error('storage_unavailable'))
        : originalSetItem(key, value)
    ));

    await expect(purchasePackage({
      key: 'lifetime', identifier: '$rc_lifetime', productIdentifier: 'com.tillcalc.pro.lifetime',
      title: 'Lifetime', priceString: 'test', rawPackage: {},
    })).rejects.toBeInstanceOf(BillingEntitlementMissingAfterPurchaseError);
  });
});
