import {
  formatCompact,
  formatAmount,
  formatAmountForCurrency,
  getCurrencyCode,
  getCurrencyVersion,
  setCurrencyOption,
  setCurrencySymbolFromOption,
  subscribeCurrencyChanges,
} from '../currency';
import AsyncStorage from '@react-native-async-storage/async-storage';

describe('currency compact formatting', () => {
  beforeEach(() => {
    setCurrencySymbolFromOption('£ GBP');
  });

  it('abbreviates thousands and millions to keep narrow stat cells on one line', () => {
    expect(formatCompact(999)).toBe('£999');
    expect(formatCompact(1240)).toBe('£1.2k');
    expect(formatCompact(1_240_000)).toBe('£1.2m');
  });

  it('keeps negative sign for negative compact values', () => {
    expect(formatCompact(-1250)).toBe('£-1.3k');
  });

  it('notifies mounted UI when the display currency changes', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeCurrencyChanges(listener);
    const before = getCurrencyVersion();

    setCurrencySymbolFromOption('$ USD');

    expect(getCurrencyVersion()).toBe(before + 1);
    expect(listener).toHaveBeenCalledTimes(1);

    setCurrencySymbolFromOption('$ USD');
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
  });
});

// ── Defect 1: Signed money format ──────────────────────────────────

describe('signed money format', () => {
  beforeEach(() => {
    setCurrencySymbolFromOption('£ GBP');
  });

  it('formatAmount: negative value auto-displays minus sign', () => {
    expect(formatAmount(-10)).toBe('-£10');
  });

  it('formatAmount: positive value has no sign', () => {
    expect(formatAmount(10)).toBe('£10');
  });

  it('formatAmount: zero has no sign', () => {
    expect(formatAmount(0)).toBe('£0');
  });

  it('formatAmount: explicit + sign overrides auto-sign for positive', () => {
    expect(formatAmount(10, '+')).toBe('+£10');
  });

  it('formatAmount: negative with fractional cents', () => {
    expect(formatAmount(-10.50)).toBe('-£10.50');
  });

  it('formatAmountForCurrency: negative value auto-displays minus sign', () => {
    expect(formatAmountForCurrency(-10, 'GBP')).toBe('-£10');
  });

  it('formatAmountForCurrency: positive value has no sign', () => {
    expect(formatAmountForCurrency(10, 'GBP')).toBe('£10');
  });

  it('formatAmountForCurrency: zero has no sign', () => {
    expect(formatAmountForCurrency(0, 'GBP')).toBe('£0');
  });

  it('formatAmountForCurrency: negative with USD symbol', () => {
    expect(formatAmountForCurrency(-25.99, 'USD')).toBe('-$25.99');
  });

  it('formatAmountForCurrency: explicit + overrides for positive', () => {
    expect(formatAmountForCurrency(100, 'EUR', '+')).toBe('+€100');
  });
});

// ── Defect 2: Atomic currency save ─────────────────────────────────

describe('atomic currency save', () => {
  beforeEach(() => {
    setCurrencySymbolFromOption('£ GBP');
    (AsyncStorage.setItem as jest.Mock).mockClear();
  });

  it('keeps GBP when AsyncStorage rejects the write', async () => {
    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('disk full'));

    await expect(setCurrencyOption('€ EUR')).rejects.toThrow('disk full');

    expect(getCurrencyCode()).toBe('GBP');
  });
});

// ── International correction (24 Sep 2026): no silent GBP ─────────────

describe('no default currency', () => {
  it('a fresh module has no currency until the user chooses one', () => {
    jest.isolateModules(() => {
      const fresh = require('../currency');
      expect(fresh.getCurrencyCode()).toBe('');
      expect(fresh.getCurrencySymbol()).toBe('');
      expect(fresh.isCurrencySet()).toBe(false);
    });
  });
  it('initCurrency with nothing stored stays unset (never GBP)', async () => {
    await jest.isolateModulesAsync(async () => {
      const AS = require('@react-native-async-storage/async-storage').default;
      await AS.removeItem('settings:currency');
      const fresh = require('../currency');
      await fresh.initCurrency();
      expect(fresh.isCurrencySet()).toBe(false);
      expect(fresh.getCurrencyCode()).toBe('');
    });
  });
  it('the choice is stored as its ISO code and read back; an old "symbol CODE" value still loads', async () => {
    await jest.isolateModulesAsync(async () => {
      const AS = require('@react-native-async-storage/async-storage').default;
      const fresh = require('../currency');
      await fresh.setCurrencyOption('د.إ AED');
      expect(await AS.getItem('settings:currency')).toBe('AED');
      expect(fresh.getCurrencyCode()).toBe('AED');
    });
    await jest.isolateModulesAsync(async () => {
      const AS = require('@react-native-async-storage/async-storage').default;
      await AS.setItem('settings:currency', '€ EUR');
      const fresh = require('../currency');
      await fresh.initCurrency();
      expect(fresh.getCurrencyCode()).toBe('EUR');
      expect(fresh.isCurrencySet()).toBe(true);
    });
  });
});
