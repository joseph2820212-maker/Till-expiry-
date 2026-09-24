const listeners = new Set<(info: unknown) => void>();

const mockCustomerInfo = {
  entitlements: { active: {} },
  managementURL: null,
};

const Purchases = {
  configure: jest.fn(),
  setLogLevel: jest.fn(),
  getOfferings: jest.fn(async () => ({
    current: {
      availablePackages: [],
    },
    all: {},
  })),
  getCustomerInfo: jest.fn(async () => mockCustomerInfo),
  checkTrialOrIntroductoryPriceEligibility: jest.fn(async () => ({})),
  purchasePackage: jest.fn(async () => ({ customerInfo: mockCustomerInfo, productIdentifier: 'test' })),
  restorePurchases: jest.fn(async () => mockCustomerInfo),
  syncPurchases: jest.fn(async () => undefined),
  addCustomerInfoUpdateListener: jest.fn((listener: (info: unknown) => void) => {
    listeners.add(listener);
  }),
  removeCustomerInfoUpdateListener: jest.fn((listener: (info: unknown) => void) => {
    listeners.delete(listener);
  }),
  __emitCustomerInfo(info: unknown) {
    listeners.forEach(listener => listener(info));
  },
};

export const LOG_LEVEL = {
  DEBUG: 'DEBUG',
  WARN: 'WARN',
  ERROR: 'ERROR',
};

export const INTRO_ELIGIBILITY_STATUS = {
  INTRO_ELIGIBILITY_STATUS_UNKNOWN: 0,
  INTRO_ELIGIBILITY_STATUS_INELIGIBLE: 1,
  INTRO_ELIGIBILITY_STATUS_ELIGIBLE: 2,
  INTRO_ELIGIBILITY_STATUS_NO_INTRO_OFFER_EXISTS: 3,
};

export const PURCHASES_ERROR_CODE = {
  PURCHASE_CANCELLED_ERROR: '1',
  STORE_PROBLEM_ERROR: '2',
  PURCHASE_NOT_ALLOWED_ERROR: '3',
  PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR: '5',
  NETWORK_ERROR: '10',
  CONFIGURATION_ERROR: '23',
  PRODUCT_REQUEST_TIMED_OUT_ERROR: '32',
  OFFLINE_CONNECTION_ERROR: '35',
};

export default Purchases;
