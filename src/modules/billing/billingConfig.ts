import { Platform } from 'react-native';

// RevenueCat entitlement + product identifiers. Must match the values registered
// on RevenueCat, App Store Connect and Google Play Console.
export const BILLING_ENTITLEMENT_ID = 'pro';
export const BILLING_OFFERING_ID = 'default';

// F07 (audit): Release 1 has exactly one package. No monthly / yearly / trial.
export const BILLING_PACKAGE_IDS = {
  lifetime: '$rc_lifetime',
} as const;

// Release 1 sells ONE product: the lifetime unlock. Store ids and SDK keys are
// supplied by the release build environment (see docs/RELEASE_RECIPE.md):
//   EXPO_PUBLIC_RC_IOS_KEY, EXPO_PUBLIC_RC_ANDROID_KEY,
//   EXPO_PUBLIC_RC_LIFETIME_ID_IOS, EXPO_PUBLIC_RC_LIFETIME_ID_ANDROID
// With no key set the app runs in the offline/no-store mode (test APK: bypass).
const env = (name: string): string => (process.env[name] ?? '').trim();
export const BILLING_PRODUCT_IDS = {
  ios: { lifetime: env('EXPO_PUBLIC_RC_LIFETIME_ID_IOS') },
  android: { lifetime: env('EXPO_PUBLIC_RC_LIFETIME_ID_ANDROID') },
} as const;

/** The store product id of the lifetime unlock for this platform, or null when the build has none configured. */
export function getLifetimeProductId(): string | null {
  const id = Platform.OS === 'ios' ? BILLING_PRODUCT_IDS.ios.lifetime : BILLING_PRODUCT_IDS.android.lifetime;
  return id.length > 0 ? id : null;
}

/** Exact match against the configured product id — never a substring test on a name. */
export function isLifetimeProductId(productIdentifier: string | null | undefined): boolean {
  const id = getLifetimeProductId();
  return !!id && !!productIdentifier && productIdentifier === id;
}

const REVENUECAT_IOS_PUBLIC_KEY = env('EXPO_PUBLIC_RC_IOS_KEY');
const REVENUECAT_ANDROID_PUBLIC_KEY = env('EXPO_PUBLIC_RC_ANDROID_KEY');

export function getRevenueCatApiKey(): string | null {
  const key = Platform.OS === 'ios' ? REVENUECAT_IOS_PUBLIC_KEY : REVENUECAT_ANDROID_PUBLIC_KEY;
  const trimmed = key.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function getBillingSetupMessage(): string {
  return 'RevenueCat public SDK key is not configured for this platform.';
}

export function isQaDemoModeForced(): boolean {
  return process.env.EXPO_PUBLIC_BUILD_VARIANT === 'demo-validation'
    && process.env.EXPO_PUBLIC_QA_FORCE_DEMO === '1';
}

export function isBillingPremiumForApp(
  isPremium: boolean,
  status: string,
): boolean {
  return !isQaDemoModeForced() && (isPremium || status === 'premium');
}
