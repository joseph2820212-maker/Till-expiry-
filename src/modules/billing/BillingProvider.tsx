import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { BillingContextValue, BillingEntitlementState, BillingPackage, BillingStatus } from './billingTypes';
import { addBillingListener, BillingEntitlementMissingAfterPurchaseError, BillingPurchaseCancelledError, BillingUnavailableError, classifyBillingError, getBillingSnapshot, getInitialBillingState, logBillingDiagnostic, purchasePackage, restorePurchases } from './billingService';
import { isCachedEntitlementValid, loadPendingPurchaseRecovery } from './billingStorage';
import { getRevenueCatApiKey, isQaDemoModeForced } from './billingConfig';

const defaultEntitlement: BillingEntitlementState = {
  isPremium: false,
  source: 'unknown',
  expirationDate: null,
  lastError: null,
  lastErrorCode: null,
  packages: [],
  canPurchase: false,
  managementUrl: null,
};

const BillingContext = createContext<BillingContextValue | null>(null);

// The billing check must NEVER hang the app on the loading spinner. If the
// RevenueCat SDK / network stalls, this bounds the wait and lets `refresh` fall
// through to the cache-or-recoverable-paywall branch so a user is never locked
// out of their own data by a billing hiccup.
const BILLING_TIMEOUT_MS = 8000;
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('billing_timeout')), ms);
    promise.then(
      value => { clearTimeout(timer); resolve(value); },
      err => { clearTimeout(timer); reject(err); },
    );
  });
}

export const BillingProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const forceQaDemo = isQaDemoModeForced();
  const [status, setStatus] = useState<BillingStatus>('loading');
  const [entitlement, setEntitlement] = useState<BillingEntitlementState>(defaultEntitlement);
  const [purchaseRecoveryPending, setPurchaseRecoveryPending] = useState(false);
  // Flips true after the first refresh (so RevenueCat is configured); the
  // customer-info listener subscribes once at that point, not on every status
  // change — avoids missed entitlement updates and re-subscribe churn.
  const [billingReady, setBillingReady] = useState(false);

  const refresh = useCallback(async () => {
    if (forceQaDemo) {
      setEntitlement(defaultEntitlement);
      setPurchaseRecoveryPending(false);
      setStatus('not_premium');
      return;
    }
    setStatus(current => current === 'premium' ? current : 'loading');
    try {
      const snapshot = await withTimeout(getBillingSnapshot(), BILLING_TIMEOUT_MS);
      setEntitlement(snapshot);
      setStatus(snapshot.isPremium ? 'premium' : 'not_premium');
      if (snapshot.isPremium) setPurchaseRecoveryPending(false);
    } catch (error: any) {
      logBillingDiagnostic('refresh', error);
      const cached = await getInitialBillingState();
      const canUseCache = isCachedEntitlementValid(cached);
      setEntitlement({
        ...cached,
        packages: [],
        canPurchase: Boolean(getRevenueCatApiKey()),
        lastError: null,
        lastErrorCode: error instanceof BillingUnavailableError
          ? 'store_unavailable'
          : classifyBillingError(error, 'store_unavailable'),
      });
      setStatus(canUseCache ? 'premium' : error instanceof BillingUnavailableError ? 'unavailable' : 'error');
    }
  }, [forceQaDemo]);

  useEffect(() => {
    let mounted = true;
    if (forceQaDemo) {
      void refresh();
      return () => { mounted = false; };
    }
    (async () => {
      const [cached, pendingRecovery] = await Promise.all([
        getInitialBillingState(),
        loadPendingPurchaseRecovery().then(value => !!value, () => true),
      ]);
      if (!mounted) return;
      // An unreadable marker is uncertain purchase state. Fail closed so the
      // user cannot accidentally buy again until Retry/Restore verifies it.
      setPurchaseRecoveryPending(pendingRecovery);
      if (isCachedEntitlementValid(cached)) {
        setEntitlement(cached);
        setStatus('premium');
      }
      await refresh();
      if (mounted) setBillingReady(true);
    })();
    return () => { mounted = false; };
  }, [forceQaDemo, refresh]);

  useEffect(() => {
    if (!billingReady) return;
    const remove = addBillingListener(next => {
      setEntitlement(current => ({ ...current, ...next, packages: current.packages }));
      setStatus(next.isPremium ? 'premium' : 'not_premium');
    });
    return () => { remove?.(); };
  }, [billingReady]);

  const purchase = useCallback(async (pkg: BillingPackage) => {
    if (forceQaDemo) return { success: false, errorCode: 'qa_disabled' as const };
    setStatus('purchase_in_progress');
    try {
      const next = await purchasePackage(pkg);
      setEntitlement(current => ({ ...current, ...next, packages: current.packages }));
      setStatus(next.isPremium ? 'premium' : 'not_premium');
      return { success: next.isPremium };
    } catch (error: any) {
      if (error instanceof BillingPurchaseCancelledError) {
        setStatus(entitlement.isPremium ? 'premium' : 'not_premium');
        return { success: false, cancelled: true };
      }
      if (error instanceof BillingEntitlementMissingAfterPurchaseError) {
        setPurchaseRecoveryPending(true);
        setEntitlement(current => ({ ...current, lastError: null, lastErrorCode: 'missing_entitlement' }));
        setStatus('not_premium');
        return { success: false, requiresEntitlementRecovery: true };
      }
      logBillingDiagnostic('purchase', error);
      const errorCode = classifyBillingError(error, 'purchase_failed');
      setEntitlement(current => ({ ...current, lastError: null, lastErrorCode: errorCode }));
      setStatus('error');
      return { success: false, errorCode };
    }
  }, [entitlement.isPremium, forceQaDemo]);

  const restore = useCallback(async () => {
    if (forceQaDemo) return { success: false, errorCode: 'qa_disabled' as const };
    setStatus('restore_in_progress');
    try {
      const next = await restorePurchases();
      setEntitlement(current => ({ ...current, ...next, packages: current.packages }));
      setStatus(next.isPremium ? 'premium' : 'not_premium');
      if (next.isPremium) setPurchaseRecoveryPending(false);
      return { success: next.isPremium };
    } catch (error: any) {
      logBillingDiagnostic('restore', error);
      const errorCode = classifyBillingError(error, 'restore_failed');
      setEntitlement(current => ({ ...current, lastError: null, lastErrorCode: errorCode }));
      setStatus('error');
      return { success: false, errorCode };
    }
  }, [forceQaDemo]);

  const value = useMemo<BillingContextValue>(() => ({
    status,
    entitlement,
    purchaseRecoveryPending,
    refresh,
    retry: refresh,
    purchase,
    restore,
  }), [entitlement, purchase, purchaseRecoveryPending, refresh, restore, status]);

  return <BillingContext.Provider value={value}>{children}</BillingContext.Provider>;
};

export function useBilling(): BillingContextValue {
  const ctx = useContext(BillingContext);
  if (!ctx) throw new Error('useBilling must be used inside BillingProvider');
  return ctx;
}
