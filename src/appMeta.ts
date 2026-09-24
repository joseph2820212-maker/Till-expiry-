/** App identity used by About / Help / exports. `APP_VERSION` must match app.json (guarded by a test). */
export const APP_NAME = 'TillExpiry';
export const APP_VERSION = '0.1.0';
/** Review build (§29): every feature unlocked, no billing, no store upload. */
export const BUILD_KIND = 'review' as const;
export const PUBLISHER = 'LLILL LTD';
/** Support address: Codex sets EXPO_PUBLIC_SUPPORT_EMAIL before the store build (see docs/RELEASE_RECIPE.md). */
export const SUPPORT_EMAIL = process.env.EXPO_PUBLIC_SUPPORT_EMAIL || 'support@tillnote.com';

/**
 * Legal identity — the same publisher details as Till Note (owner decision, 23 Sep 2026: "everything the
 * same as Till Note"). Only the wording of the documents is app-specific. Every address can be
 * overridden per build with EXPO_PUBLIC_* variables.
 */
export const EFFECTIVE_DATE = '23 September 2026';
export const EMAILS = {
  support: SUPPORT_EMAIL,
  privacy: process.env.EXPO_PUBLIC_PRIVACY_EMAIL || 'privacy@tillnote.com',
  legal: process.env.EXPO_PUBLIC_LEGAL_EMAIL || 'legal@tillnote.com',
  security: process.env.EXPO_PUBLIC_SECURITY_EMAIL || 'security@tillnote.com',
} as const;
export const COMPANY_DETAILS = {
  registrationNumber: '11792206',
  registeredOffice: '20a Southover Street, Brighton, England, BN2 9UD',
  /** Shown through the translated `legal.vatNotRegistered` string. */
  vatRegistered: false,
  governingJurisdiction: 'England and Wales',
} as const;
