import { Platform } from 'react-native';

export const ANDROID_NAV_BAR_FALLBACK = 48;
export const ANDROID_MODAL_SHEET_NAV_BAR_FALLBACK = 72;

export function safeBottom(insetBottom: number): number {
  return Platform.OS === 'android'
    ? Math.max(insetBottom, ANDROID_NAV_BAR_FALLBACK)
    : insetBottom;
}

export function safeSheetBottom(insetBottom: number): number {
  return Platform.OS === 'android'
    ? Math.max(insetBottom, ANDROID_MODAL_SHEET_NAV_BAR_FALLBACK)
    : insetBottom;
}
