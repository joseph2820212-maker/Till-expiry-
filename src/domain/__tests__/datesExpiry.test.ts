import { addDays, compareDates, daysBetween, endOfMonth, isAmbiguousDayMonth, isLocalDate, parseDateInOrder, todayLocal } from '../dates';
import { bandFor, byDateThenSafety, checkedToday, clampAlertDays, countBands, currentReduction, multiplyMoney, needsAttention, percentOff, reducedBy, remainingQuantity, alertDaysFor } from '../expiry';
import { moneyFromMinor } from '../money';
import type { DateBatch } from '../types';

const b = (over: Partial<DateBatch>): DateBatch => ({
  schemaVersion: 1, id: 'x', productId: 'p', productName: 'P', date: '2026-09-24', dateType: 'useBy', status: 'open', events: [],
  createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z', ...over,
});

describe('calendar dates', () => {
  it('knows real calendar dates only', () => {
    expect(isLocalDate('2028-02-29')).toBe(true);
    expect(isLocalDate('2026-02-29')).toBe(false);
    expect(isLocalDate('2026-13-01')).toBe(false);
    expect(isLocalDate('2026-9-1')).toBe(false);
    expect(isLocalDate(20260901)).toBe(false);
  });
  it('adds days and counts days across months, years and daylight-saving changes', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2); // EU clocks change on 29 Mar 2026
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2);
    expect(daysBetween('2026-09-24', '2026-09-20')).toBe(-4);
    expect(() => addDays('2026-02-30', 1)).toThrow();
    expect(() => addDays('2026-02-01', 1.5)).toThrow();
  });
  it('end of month and comparisons', () => {
    expect(endOfMonth('2028-02-10')).toBe('2028-02-29');
    expect(endOfMonth('2026-12-01')).toBe('2026-12-31');
    expect(compareDates('2026-01-02', '2026-01-10')).toBe(-1);
  });
  it('today is the device-local calendar day', () => {
    expect(todayLocal(new Date(2026, 8, 24, 23, 59))).toBe('2026-09-24');
    expect(todayLocal(new Date(2026, 0, 1, 0, 0))).toBe('2026-01-01');
  });
  it('parses a file date only in the confirmed order; never guesses', () => {
    expect(parseDateInOrder('03/04/2026', 'dmy')).toBe('2026-04-03');
    expect(parseDateInOrder('03/04/2026', 'mdy')).toBe('2026-03-04');
    expect(parseDateInOrder('2026-04-03', 'dmy')).toBe('2026-04-03'); // ISO is unambiguous in any order
    expect(parseDateInOrder('3.4.26', 'dmy')).toBe('2026-04-03');
    expect(parseDateInOrder('31/02/2026', 'dmy')).toBeNull();
    expect(parseDateInOrder('13/25/2026', 'mdy')).toBeNull();
    expect(parseDateInOrder('next week', 'dmy')).toBeNull();
    expect(parseDateInOrder('', 'dmy')).toBeNull();
    expect(isAmbiguousDayMonth('03/04/2026')).toBe(true);
    expect(isAmbiguousDayMonth('13/04/2026')).toBe(false);
    expect(isAmbiguousDayMonth('04/04/2026')).toBe(false);
    expect(isAmbiguousDayMonth('2026-04-03')).toBe(false);
  });
});

describe('bands', () => {
  const today = '2026-09-24';
  it('expired / today / soon / later with the alert window inclusive', () => {
    expect(bandFor('2026-09-23', today, 3)).toBe('expired');
    expect(bandFor('2026-09-24', today, 3)).toBe('today');
    expect(bandFor('2026-09-27', today, 3)).toBe('soon');
    expect(bandFor('2026-09-28', today, 3)).toBe('later');
    expect(bandFor('2026-09-25', today, 0)).toBe('later');
  });
  it('a product window overrides the shop window, within bounds', () => {
    expect(alertDaysFor({ alertDays: 7 }, 3)).toBe(7);
    expect(alertDaysFor({ alertDays: undefined }, 3)).toBe(3);
    expect(alertDaysFor(undefined, 3)).toBe(3);
    expect(clampAlertDays(500, 3)).toBe(60);
    expect(clampAlertDays(-2, 3)).toBe(0);
    expect(clampAlertDays('5', 3)).toBe(3);
  });
  it('needs attention = open and not later; oldest first, use-by first on the same day', () => {
    const list = [
      b({ id: 'late', date: '2026-10-30' }),
      b({ id: 'bb', date: '2026-09-25', dateType: 'bestBefore', productName: 'A' }),
      b({ id: 'ub', date: '2026-09-25', dateType: 'useBy', productName: 'Z' }),
      b({ id: 'old', date: '2026-09-01' }),
      b({ id: 'closed', date: '2026-09-02', status: 'closed' }),
    ];
    expect(needsAttention(list, today, () => 3).map(x => x.id)).toEqual(['old', 'ub', 'bb']);
    expect([...list].sort(byDateThenSafety).map(x => x.id)).toEqual(['old', 'closed', 'ub', 'bb', 'late']);
    const c = countBands(list, today, () => 3);
    expect(c).toEqual({ expired: 1, today: 0, soon: 2, later: 1, reduced: 0, open: 4 });
  });
});

describe('what is left and the latest reduction', () => {
  it('removals subtract; checks and reductions do not', () => {
    const x = b({ quantity: 10, events: [
      { id: '1', kind: 'checked', on: '2026-09-20', at: '' },
      { id: '2', kind: 'reduced', on: '2026-09-21', at: '', price: moneyFromMinor(100, 'EUR') },
      { id: '3', kind: 'sold', on: '2026-09-22', at: '', quantity: 4 },
      { id: '4', kind: 'reduced', on: '2026-09-23', at: '', price: moneyFromMinor(50, 'EUR') },
      { id: '5', kind: 'wasted', on: '2026-09-24', at: '', quantity: 1 },
    ] });
    expect(remainingQuantity(x)).toBe(5);
    expect(currentReduction(x)?.price?.minor).toBe(50);
    expect(remainingQuantity(b({}))).toBeNull();
    expect(checkedToday(x, '2026-09-24')).toBe(true);
    expect(checkedToday(x, '2026-09-25')).toBe(false);
  });
});

describe('exact money for reductions and waste', () => {
  it('percent off is whole-percent half-up; reduced-by is half-up to the minor unit', () => {
    expect(percentOff(moneyFromMinor(300, 'GBP'), moneyFromMinor(199, 'GBP'))).toBe(34); // 33.67 → 34
    expect(percentOff(moneyFromMinor(200, 'GBP'), moneyFromMinor(150, 'GBP'))).toBe(25);
    expect(percentOff(moneyFromMinor(200, 'GBP'), moneyFromMinor(250, 'GBP'))).toBeNull();
    expect(percentOff(moneyFromMinor(200, 'GBP'), moneyFromMinor(150, 'EUR'))).toBeNull();
    expect(reducedBy(moneyFromMinor(145, 'GBP'), 50)).toEqual(moneyFromMinor(73, 'GBP')); // 72.5 → 73
    expect(reducedBy(moneyFromMinor(999, 'JPY'), 25)).toEqual(moneyFromMinor(749, 'JPY')); // 749.25
    expect(reducedBy(moneyFromMinor(1250, 'KWD'), 75)).toEqual(moneyFromMinor(313, 'KWD')); // 312.5 → 313
    expect(() => reducedBy(moneyFromMinor(100, 'GBP'), 0)).toThrow();
    expect(() => reducedBy(moneyFromMinor(100, 'GBP'), 100)).toThrow();
  });
  it('price × quantity is exact and refuses unsafe results', () => {
    expect(multiplyMoney(moneyFromMinor(145, 'GBP'), 3)).toEqual(moneyFromMinor(435, 'GBP'));
    expect(multiplyMoney(moneyFromMinor(Number.MAX_SAFE_INTEGER, 'GBP'), 2)).toBeNull();
    expect(multiplyMoney(moneyFromMinor(1, 'GBP'), -1)).toBeNull();
    expect(multiplyMoney(moneyFromMinor(1, 'GBP'), 1.5)).toBeNull();
  });
});
