import { ceilToMinor, displayDecimals, minorUnitsFor, minorUnitStep, roundToMinor } from '../currencyUnits';
import { SYMBOL_MAP } from '../currency';

describe('minorUnitsFor', () => {
  it('knows the 3-decimal and 0-decimal currencies the app offers', () => {
    for (const code of ['KWD', 'BHD', 'OMR', 'JOD', 'IQD', 'TND']) expect(minorUnitsFor(code)).toBe(3);
    for (const code of ['CLP', 'XOF', 'XAF']) expect(minorUnitsFor(code)).toBe(0);
    for (const code of ['GBP', 'EUR', 'USD', 'TRY', 'SAR', 'AED']) expect(minorUnitsFor(code)).toBe(2);
  });

  it('returns a valid minor unit for every currency option in SYMBOL_MAP', () => {
    for (const option of Object.keys(SYMBOL_MAP)) {
      const code = option.split(' ').pop() as string;
      expect([0, 2, 3]).toContain(minorUnitsFor(code));
    }
  });

  it('is case-insensitive and defaults unknown codes to 2', () => {
    expect(minorUnitsFor('kwd')).toBe(3);
    expect(minorUnitsFor('ZZZ')).toBe(2);
    expect(minorUnitsFor('')).toBe(2);
  });
});

describe('rounding to minor units', () => {
  it('rounds half-up at 0, 2 and 3 decimals', () => {
    expect(roundToMinor(4.425, 2)).toBe(4.43);
    expect(roundToMinor(4.4245, 3)).toBe(4.425);
    expect(roundToMinor(4.5, 0)).toBe(5);
    expect(roundToMinor(1.005, 2)).toBe(1.01);
  });
  it('ceils without floating drift', () => {
    expect(ceilToMinor(4.42, 2)).toBe(4.42);
    expect(ceilToMinor(4.421, 2)).toBe(4.43);
    expect(ceilToMinor(4.4201, 3)).toBe(4.421);
    expect(ceilToMinor(4.1, 0)).toBe(5);
  });
  it('exposes the step and display decimals', () => {
    expect(minorUnitStep(0)).toBe(1);
    expect(minorUnitStep(2)).toBe(0.01);
    expect(minorUnitStep(3)).toBe(0.001);
    expect(displayDecimals(12, 2)).toBe(0);
    expect(displayDecimals(12.5, 2)).toBe(2);
    expect(displayDecimals(12.5, 3)).toBe(3);
    expect(displayDecimals(12.5, 0)).toBe(0);
  });
  it('handles non-finite input', () => {
    expect(roundToMinor(NaN, 2)).toBe(0);
    expect(ceilToMinor(Infinity, 2)).toBe(0);
  });
});
