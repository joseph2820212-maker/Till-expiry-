import fs from 'fs';
import path from 'path';
import { isCachedEntitlementValid } from '../billingStorage';

// Locks in the lockout-prevention + cache-trust fixes so they can't silently
// regress.

const dir = path.resolve(__dirname, '..');
const providerSrc = fs.readFileSync(path.join(dir, 'BillingProvider.tsx'), 'utf8');
const storageSrc = fs.readFileSync(path.join(dir, 'billingStorage.ts'), 'utf8');

const base = {
  isPremium: true,
  activeEntitlementId: 'pro',
  willRenew: false,
  lastVerifiedAt: '2026-06-26T11:00:00.000Z',
  managementUrl: null,
};
const NOW = Date.parse('2026-06-26T12:00:00.000Z');

describe('billing cache is trusted conservatively', () => {
  it('lifetime entitlement is valid forever offline', () => {
    expect(isCachedEntitlementValid({ ...base, source: 'lifetime', expirationDate: null }, NOW)).toBe(true);
  });
  it('subscription with a FUTURE expiry is valid', () => {
    expect(isCachedEntitlementValid({ ...base, source: 'subscription', expirationDate: '2026-06-27T12:00:00.000Z' }, NOW)).toBe(true);
  });
  it('subscription with an EXPIRED date is invalid', () => {
    expect(isCachedEntitlementValid({ ...base, source: 'subscription', expirationDate: '2026-06-25T12:00:00.000Z' }, NOW)).toBe(false);
  });
  it('a subscription with NO expiry is NOT trusted offline (re-verify online)', () => {
    expect(isCachedEntitlementValid({ ...base, source: 'subscription', expirationDate: null }, NOW)).toBe(false);
  });
  it("an 'unknown'-source entitlement with no expiry is NOT trusted forever", () => {
    expect(isCachedEntitlementValid({ ...base, source: 'unknown', expirationDate: null }, NOW)).toBe(false);
  });
  it('a non-premium cache is never valid', () => {
    expect(isCachedEntitlementValid({ ...base, isPremium: false, source: 'lifetime', expirationDate: null }, NOW)).toBe(false);
  });
});

describe('billing gate can never permanently hang or lock a user out', () => {
  it('an unreadable pending-purchase marker fails closed against repeat purchase', () => {
    expect(storageSrc).not.toMatch(/loadPendingPurchaseRecovery[\s\S]*catch\s*\{[\s\S]*return null/);
    expect(providerSrc).toContain('loadPendingPurchaseRecovery().then(value => !!value, () => true)');
  });
  it('the verification call is bounded by a timeout (no infinite loading spinner)', () => {
    expect(providerSrc).toContain('BILLING_TIMEOUT_MS');
    expect(providerSrc).toMatch(/withTimeout\(\s*getBillingSnapshot\(\)/);
  });
  it('the customer-info listener subscribes once after billing is ready, not on every status change', () => {
    expect(providerSrc).toContain('billingReady');
    expect(providerSrc).not.toMatch(/addBillingListener[\s\S]*?\},\s*\[status\]\)/);
  });
});
