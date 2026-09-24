import { Platform } from 'react-native';
import { ANDROID_NAV_BAR_FALLBACK, safeBottom } from '../safeArea';

describe('safeBottom', () => {
  const originalOS = Platform.OS;

  afterEach(() => {
    (Platform as { OS: string }).OS = originalOS;
  });

  it('floors a zero Android inset to the Samsung 3-button nav-bar height', () => {
    (Platform as { OS: string }).OS = 'android';
    expect(ANDROID_NAV_BAR_FALLBACK).toBe(48);
    expect(safeBottom(0)).toBe(48);
  });

  it('keeps larger Android insets unchanged', () => {
    (Platform as { OS: string }).OS = 'android';
    expect(safeBottom(60)).toBe(60);
  });

  it('returns the raw iOS inset', () => {
    (Platform as { OS: string }).OS = 'ios';
    expect(safeBottom(0)).toBe(0);
    expect(safeBottom(34)).toBe(34);
  });
});
