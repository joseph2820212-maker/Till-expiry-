import Purchases, { LOG_LEVEL, PURCHASES_ERROR_CODE } from 'react-native-purchases';
import { Platform } from 'react-native';
import { BILLING_ENTITLEMENT_ID, BILLING_OFFERING_ID, BILLING_PACKAGE_IDS, getBillingSetupMessage, getRevenueCatApiKey, isLifetimeProductId } from './billingConfig';
import {
  BillingEntitlementState,
  BillingPackage,
  BillingSource,
  BillingUserErrorCode,
} from './billingTypes';
import {
  cacheBillingState,
  clearPendingPurchaseRecovery,
  loadCachedBillingState,
  markPurchaseRecoveryPending,
} from './billingStorage';

let configured = false;
const PURCHASE_RECOVERY_REFRESH_TIMEOUT_MS = 10_000;

async function settleWithin<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('billing_refresh_timeout')), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export class BillingUnavailableError extends Error {}
export class BillingPurchaseCancelledError extends Error {}
export class BillingEntitlementMissingAfterPurchaseError extends Error {}

export function classifyBillingError(
  error: unknown,
  fallback: BillingUserErrorCode,
): BillingUserErrorCode {
  const value = error as { code?: unknown; message?: unknown; underlyingErrorMessage?: unknown } | null;
  const code = value?.code == null ? '' : String(value.code);
  if (
    code === PURCHASES_ERROR_CODE.NETWORK_ERROR
    || code === PURCHASES_ERROR_CODE.OFFLINE_CONNECTION_ERROR
    || code === PURCHASES_ERROR_CODE.PRODUCT_REQUEST_TIMED_OUT_ERROR
  ) return 'network';
  if (
    code === PURCHASES_ERROR_CODE.STORE_PROBLEM_ERROR
    || code === PURCHASES_ERROR_CODE.PURCHASE_NOT_ALLOWED_ERROR
    || code === PURCHASES_ERROR_CODE.PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR
    || code === PURCHASES_ERROR_CODE.CONFIGURATION_ERROR
  ) return 'store_unavailable';
  const diagnostic = [value?.code, value?.message, value?.underlyingErrorMessage]
    .filter(part => part != null)
    .join(' ')
    .toLowerCase();
  if (/network|offline|internet|timed?\s*out|timeout|connection/.test(diagnostic)) return 'network';
  if (/store|offering|product|configuration|purchase[_ ]?not[_ ]?allowed|payments?[_ ]?unavailable/.test(diagnostic)) {
    return 'store_unavailable';
  }
  return fallback;
}

export function logBillingDiagnostic(context: string, error: unknown): void {
  if (!__DEV__) return;
  const value = error as { code?: unknown; message?: unknown } | null;
  console.warn('[billing]', context, {
    code: value?.code == null ? undefined : String(value.code),
    message: value?.message == null ? String(error) : String(value.message),
  });
}

function emptyEntitlement(message?: string | null): BillingEntitlementState {
  return {
    isPremium: false,
    source: 'unknown',
    activeEntitlementId: undefined,
    expirationDate: null,
    willRenew: undefined,
    lastVerifiedAt: new Date().toISOString(),
    lastError: message ?? null,
    lastErrorCode: null,
    packages: [],
    canPurchase: false,
    managementUrl: null,
  };
}

/**
 * F07 (audit): the ONLY package Release 1 sells is the lifetime unlock. A store
 * package counts as it when RevenueCat labels it `$rc_lifetime` OR its product id
 * is exactly the configured lifetime product id. Nothing is inferred from names
 * ("month", "life", …) and there is no first-package fallback anywhere.
 */
function isLifetimePackage(pkg: any): boolean {
  const identifier = String(pkg?.identifier ?? '');
  const productId = String(pkg?.product?.identifier ?? pkg?.product?.productIdentifier ?? '');
  return identifier === BILLING_PACKAGE_IDS.lifetime || isLifetimeProductId(productId);
}

function packageFromRevenueCat(pkg: any): BillingPackage | null {
  if (!isLifetimePackage(pkg)) return null;
  const product = pkg?.product ?? {};
  return {
    key: 'lifetime',
    identifier: String(pkg?.identifier ?? ''),
    productIdentifier: String(product?.identifier ?? product?.productIdentifier ?? ''),
    title: String(product?.title ?? 'lifetime'),
    priceString: String(product?.priceString ?? product?.localizedPriceString ?? ''),
    rawPackage: pkg,
  };
}

/** At most one package: the lifetime unlock (the `$rc_lifetime` slot wins when both forms exist). */
function packagesFromOfferings(offerings: any): BillingPackage[] {
  const offering = offerings?.all?.[BILLING_OFFERING_ID] ?? offerings?.current;
  const available: any[] = offering?.availablePackages ?? [];
  const packages = available.map(packageFromRevenueCat).filter(Boolean) as BillingPackage[];
  const exact = packages.find(p => p.identifier === BILLING_PACKAGE_IDS.lifetime);
  const chosen = exact ?? packages[0];
  return chosen ? [chosen] : [];
}

export async function configureBilling(): Promise<void> {
  if (configured) return;
  const apiKey = getRevenueCatApiKey();
  if (!apiKey) throw new BillingUnavailableError(getBillingSetupMessage());
  try {
    Purchases.setLogLevel?.(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.WARN);
  } catch {}
  Purchases.configure({ apiKey });
  configured = true;
}

export async function fetchOfferings(): Promise<BillingPackage[]> {
  await configureBilling();
  const offerings = await Purchases.getOfferings();
  return packagesFromOfferings(offerings);
}

export function hasPremiumEntitlement(customerInfo: any): BillingEntitlementState {
  const entitlement = customerInfo?.entitlements?.active?.[BILLING_ENTITLEMENT_ID];
  if (!entitlement) return emptyEntitlement(null);
  const expirationDate = entitlement.expirationDate ?? null;
  const productIdentifier = String(entitlement.productIdentifier ?? '');
  const store = String(entitlement.store ?? '');
  // F07: 'lifetime' only when the product id is EXACTLY the configured one (or a
  // RevenueCat promotional grant); an unrecognised no-expiry entitlement is 'unknown'
  // and therefore re-verified online before being trusted offline.
  const source: BillingSource = expirationDate
    ? 'subscription'
    : (isLifetimeProductId(productIdentifier) || /promotional/i.test(store) ? 'lifetime' : 'unknown');
  return {
    isPremium: true,
    source,
    activeEntitlementId: BILLING_ENTITLEMENT_ID,
    expirationDate,
    willRenew: entitlement.willRenew,
    lastVerifiedAt: new Date().toISOString(),
    lastError: null,
    lastErrorCode: null,
    packages: [],
    canPurchase: true,
    managementUrl: customerInfo?.managementURL ?? customerInfo?.managementUrl ?? null,
  };
}

export async function getCustomerInfo(): Promise<BillingEntitlementState> {
  await configureBilling();
  const info = await Purchases.getCustomerInfo();
  const state = hasPremiumEntitlement(info);
  await cacheBillingState(state);
  return state;
}

export async function getInitialBillingState(): Promise<BillingEntitlementState> {
  const cache = await loadCachedBillingState();
  if (cache) return { ...emptyEntitlement(null), ...cache, packages: [], canPurchase: Boolean(getRevenueCatApiKey()) };
  return emptyEntitlement(null);
}

export async function getBillingSnapshot(): Promise<BillingEntitlementState> {
  await configureBilling();
  const offeringsPromise = Purchases.getOfferings().then(
    offerings => ({ ok: true as const, offerings }),
    error => ({ ok: false as const, error }),
  );
  const state = hasPremiumEntitlement(await Purchases.getCustomerInfo());
  await cacheBillingState(state);
  if (state.isPremium) {
    await clearPendingPurchaseRecovery().catch(() => {});
    void offeringsPromise.catch(() => {});
    return { ...state, packages: [], canPurchase: false };
  }

  try {
    const offeringsResult = await offeringsPromise;
    if (!offeringsResult.ok) throw offeringsResult.error;
    const packages = packagesFromOfferings(offeringsResult.offerings);
    return { ...state, packages, canPurchase: packages.length > 0 };
  } catch (error: any) {
    logBillingDiagnostic('offerings', error);
    return {
      ...state,
      packages: [],
      canPurchase: false,
      lastError: null,
      lastErrorCode: classifyBillingError(error, 'store_unavailable'),
    };
  }
}

export async function purchasePackage(pkg: BillingPackage): Promise<BillingEntitlementState> {
  await configureBilling();
  try {
    const result = await Purchases.purchasePackage(pkg.rawPackage as never);
    let state = hasPremiumEntitlement((result as any)?.customerInfo);
    if (!state.isPremium) {
      await settleWithin(
        markPurchaseRecoveryPending(pkg.productIdentifier),
        1_500,
      ).catch(() => {});
      try {
        state = hasPremiumEntitlement(await settleWithin(
          Purchases.getCustomerInfo(),
          PURCHASE_RECOVERY_REFRESH_TIMEOUT_MS,
        ));
      } catch {
        // A completed store purchase still needs the specialized recovery path
        // when CustomerInfo cannot yet confirm the entitlement.
      }
    }
    await cacheBillingState(state);
    if (!state.isPremium) {
      throw new BillingEntitlementMissingAfterPurchaseError('purchase_completed_entitlement_missing');
    }
    await clearPendingPurchaseRecovery().catch(() => {});
    return state;
  } catch (error: any) {
    if (
      error?.userCancelled
      || String(error?.code ?? '') === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR
      || error?.code === 'PURCHASE_CANCELLED'
    ) throw new BillingPurchaseCancelledError('purchase_cancelled');
    throw error;
  }
}

export async function restorePurchases(): Promise<BillingEntitlementState> {
  await configureBilling();
  const info = await Purchases.restorePurchases();
  const state = hasPremiumEntitlement(info);
  await cacheBillingState(state);
  if (state.isPremium) await clearPendingPurchaseRecovery().catch(() => {});
  return state;
}

export async function syncPurchases(): Promise<void> {
  if (Platform.OS === 'android') {
    await configureBilling();
    await Purchases.syncPurchases?.();
  }
}

export function addBillingListener(listener: (state: BillingEntitlementState) => void): (() => void) | null {
  if (!configured) return null;
  const cb = (info: unknown) => {
    const state = hasPremiumEntitlement(info);
    void cacheBillingState(state);
    listener(state);
  };
  Purchases.addCustomerInfoUpdateListener?.(cb);
  return () => Purchases.removeCustomerInfoUpdateListener?.(cb);
}
