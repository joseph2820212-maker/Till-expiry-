import { useBilling } from './BillingProvider';
import { getRevenueCatApiKey, isBillingPremiumForApp } from './billingConfig';
import type { Tier } from './limits';

/**
 * Free or Pro for gating decisions. With no RevenueCat key configured the
 * test build unlocks everything when EXPO_PUBLIC_BILLING_BYPASS=1 (or in dev),
 * (the only bypass rule in the app; the old BillingGate was removed in F07). A failed entitlement check never turns a
 * paying user into a free one for data they already have — callers gate only
 * NEW Pro-scale actions.
 */
export function isBypassActive(): boolean {
  const allowNoKeyBypass = __DEV__ || process.env.EXPO_PUBLIC_BILLING_BYPASS === '1';
  return allowNoKeyBypass && !getRevenueCatApiKey();
}

export function useTier(): Tier {
  const billing = useBilling();
  if (isBypassActive()) return 'pro';
  return isBillingPremiumForApp(billing.entitlement.isPremium, billing.status) ? 'pro' : 'free';
}
