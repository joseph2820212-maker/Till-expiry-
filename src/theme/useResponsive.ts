import { useWindowDimensions } from 'react-native';

// ─── Responsive layout info (tablet vs phone, orientation) ──────────────────────
//
// The phone-first `responsive.ts` reads Dimensions ONCE at module load, so it can't
// react to rotation or iPad split-view. Layout decisions (tablet split-views, grids,
// the sidebar) use THIS hook instead — it's driven by useWindowDimensions, so it
// re-renders on rotation / multitasking resize.

export type ResponsiveInfo = {
  width: number;
  height: number;
  /** Shortest side ≥ 600dp — covers every iPad, orientation-independent. */
  isTablet: boolean;
  isLandscape: boolean;
};

/** A device is a "tablet" when its SHORTEST side is ≥ this (Android's "large" cutoff). */
export const TABLET_MIN_SHORT_SIDE = 600;

/** Pure classifier — exported so it can be unit-tested without a renderer. */
export function classifyDevice(width: number, height: number): ResponsiveInfo {
  const shortSide = Math.min(width, height);
  return {
    width,
    height,
    isTablet: shortSide >= TABLET_MIN_SHORT_SIDE,
    isLandscape: width > height,
  };
}

export function useResponsive(): ResponsiveInfo {
  const { width, height } = useWindowDimensions();
  return classifyDevice(width, height);
}
