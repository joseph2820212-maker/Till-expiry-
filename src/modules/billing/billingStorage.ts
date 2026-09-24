import AsyncStorage from '@react-native-async-storage/async-storage';
import { BillingCache, BillingEntitlementState } from './billingTypes';

const BILLING_CACHE_KEY = 'billing:last_verified_entitlement';
const PURCHASE_RECOVERY_KEY = 'billing:purchase_recovery_pending';

export type PendingPurchaseRecovery = {
  productIdentifier: string;
  recordedAt: string;
};

export function isCachedEntitlementValid(cache: BillingCache | null, now = Date.now()): boolean {
  if (!cache?.isPremium) return false;
  // Only a genuine lifetime entitlement is trusted forever offline. A subscription
  // (or an unknown source) MUST carry a future expiry; otherwise we re-verify online.
  if (cache.source === 'lifetime') return true;
  if (!cache.expirationDate) return false;
  const expiresAt = Date.parse(cache.expirationDate);
  return Number.isFinite(expiresAt) && expiresAt > now;
}

export async function loadCachedBillingState(): Promise<BillingCache | null> {
  try {
    const raw = await AsyncStorage.getItem(BILLING_CACHE_KEY);
    return raw ? JSON.parse(raw) as BillingCache : null;
  } catch {
    return null;
  }
}

export async function cacheBillingState(state: BillingEntitlementState): Promise<void> {
  const cache: BillingCache = {
    isPremium: state.isPremium,
    source: state.source,
    activeEntitlementId: state.activeEntitlementId,
    expirationDate: state.expirationDate,
    willRenew: state.willRenew,
    lastVerifiedAt: state.lastVerifiedAt,
    managementUrl: state.managementUrl,
  };
  try {
    await AsyncStorage.setItem(BILLING_CACHE_KEY, JSON.stringify(cache));
  } catch {}
}

export async function loadPendingPurchaseRecovery(): Promise<PendingPurchaseRecovery | null> {
  const raw = await AsyncStorage.getItem(PURCHASE_RECOVERY_KEY);
  return raw ? JSON.parse(raw) as PendingPurchaseRecovery : null;
}

export async function markPurchaseRecoveryPending(productIdentifier: string): Promise<void> {
  await AsyncStorage.setItem(PURCHASE_RECOVERY_KEY, JSON.stringify({
    productIdentifier,
    recordedAt: new Date().toISOString(),
  } satisfies PendingPurchaseRecovery));
}

export async function clearPendingPurchaseRecovery(): Promise<void> {
  await AsyncStorage.removeItem(PURCHASE_RECOVERY_KEY);
}
