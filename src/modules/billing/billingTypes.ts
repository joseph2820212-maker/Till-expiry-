export type BillingStatus =
  | 'loading'
  | 'premium'
  | 'not_premium'
  | 'unavailable'
  | 'purchase_in_progress'
  | 'restore_in_progress'
  | 'error';

// 'subscription' survives only so an old cache with an expiry is still validated
// conservatively; Release 1 sells nothing but the lifetime unlock (F07).
export type BillingSource = 'subscription' | 'lifetime' | 'unknown';
export type BillingPlanKey = 'lifetime';
export type BillingUserErrorCode =
  | 'network'
  | 'store_unavailable'
  | 'purchase_failed'
  | 'restore_failed'
  | 'missing_entitlement'
  | 'qa_disabled';

export type BillingPackage = {
  key: BillingPlanKey;
  identifier: string;
  productIdentifier: string;
  title: string;
  priceString: string;
  rawPackage: unknown;
};

export type BillingEntitlementState = {
  isPremium: boolean;
  source: BillingSource;
  activeEntitlementId?: string;
  expirationDate?: string | null;
  willRenew?: boolean;
  lastVerifiedAt?: string;
  lastError?: string | null;
  lastErrorCode?: BillingUserErrorCode | null;
  packages: BillingPackage[];
  canPurchase: boolean;
  managementUrl?: string | null;
};

export type BillingCache = Omit<BillingEntitlementState, 'packages' | 'canPurchase' | 'lastError' | 'lastErrorCode'>;

export type BillingContextValue = {
  status: BillingStatus;
  entitlement: BillingEntitlementState;
  purchaseRecoveryPending: boolean;
  refresh: () => Promise<void>;
  retry: () => Promise<void>;
  purchase: (pkg: BillingPackage) => Promise<{ success: boolean; cancelled?: boolean; requiresEntitlementRecovery?: boolean; errorCode?: BillingUserErrorCode }>;
  restore: () => Promise<{ success: boolean; errorCode?: BillingUserErrorCode }>;
};
