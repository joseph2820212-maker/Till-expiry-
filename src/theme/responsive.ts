/**
 * responsive.ts
 *
 * Screen-width-aware scaling utilities.
 * Base design width: 390dp (iPhone 15 / modern mid-range).
 * Scale is clamped to ±18% so font changes are gentle, not aggressive.
 *
 * Tested breakpoints:
 *   360dp  Samsung Galaxy A series   scale ≈ 0.92
 *   390dp  iPhone 15 / Pixel 7       scale = 1.00  (base)
 *   430dp  iPhone 15 Pro Max         scale ≈ 1.10
 */

import { Dimensions, I18nManager } from 'react-native';

const { width: SCREEN_W } = Dimensions.get('window');
const BASE_W = 390;

/** Gentle linear scale clamped between 0.82 and 1.18 */
export const scale = Math.min(Math.max(SCREEN_W / BASE_W, 0.82), 1.18);

/** Responsive pixel value (padding, margin, icon size, etc.) */
export function rs(n: number): number {
  return Math.round(n * scale);
}

/**
 * Responsive font size with explicit min/max guards.
 * @param base  Design-base size at 390dp
 * @param min   Floor — never goes below this on tiny screens
 * @param max   Ceiling — never goes above this on large screens
 */
export function fs(base: number, min: number, max: number): number {
  return Math.min(Math.max(Math.round(base * scale), min), max);
}

/** Current screen width (dp) */
export const screenW = SCREEN_W;

/** True when Arabic RTL is active */
export const isRTL = I18nManager.isRTL;

/**
 * Returns 'row' or 'row-reverse' depending on RTL state.
 * Use this for flex rows whose visual order must flip in Arabic.
 */
export const rowDir: 'row' | 'row-reverse' = isRTL ? 'row-reverse' : 'row';
