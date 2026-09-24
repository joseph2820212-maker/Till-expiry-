/**
 * Calendar arithmetic on local dates (YYYY-MM-DD). All maths runs on UTC day numbers built from the three
 * fields, so a device timezone or a daylight-saving change can never move a date by one day.
 */
import type { LocalDate } from './types';

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

/** True for a real calendar date written as YYYY-MM-DD (2026-02-30 is false). */
export function isLocalDate(s: unknown): s is LocalDate {
  if (typeof s !== 'string') return false;
  const m = ISO.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1900 || y > 2200 || mo < 1 || mo > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, mo, 0)).getUTCDate();
}

function dayNumber(s: LocalDate): number {
  const m = ISO.exec(s);
  if (!m || !isLocalDate(s)) throw new RangeError(`not a calendar date: ${s}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY_MS;
}

function fromDayNumber(n: number): LocalDate {
  const d = new Date(n * DAY_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** Today on this device, as a local calendar date. */
export function todayLocal(now: Date = new Date()): LocalDate {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function addDays(date: LocalDate, days: number): LocalDate {
  if (!Number.isInteger(days)) throw new RangeError('days must be an integer');
  return fromDayNumber(dayNumber(date) + days);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: LocalDate, to: LocalDate): number {
  return dayNumber(to) - dayNumber(from);
}

export function compareDates(a: LocalDate, b: LocalDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Last day of the month `date` falls in (for "end of month" date entry). */
export function endOfMonth(date: LocalDate): LocalDate {
  const [y, m] = date.split('-').map(Number);
  return fromDayNumber(Date.UTC(y, m, 0) / DAY_MS);
}

/**
 * How a date column in an imported file is written. Chosen and confirmed by the user, never guessed from one
 * value: "03/04/2026" is 3 April in one country and 4 March in another.
 */
export type DateOrder = 'ymd' | 'dmy' | 'mdy';

/** Parse a typed or imported date in the given order. Accepts "/", "-", "." and spaces; 2-digit years are 20xx. */
export function parseDateInOrder(input: string, order: DateOrder): LocalDate | null {
  const s = String(input ?? '').trim();
  if (!s) return null;
  if (ISO.test(s)) return isLocalDate(s) ? s : null;
  const parts = s.split(/[/.\-\s]+/).filter(Boolean);
  if (parts.length !== 3 || parts.some(p => !/^\d+$/.test(p))) return null;
  let y: string, m: string, d: string;
  if (order === 'ymd') [y, m, d] = parts;
  else if (order === 'dmy') [d, m, y] = parts;
  else [m, d, y] = parts;
  if (y.length === 2) y = `20${y}`;
  if (y.length !== 4 || m.length > 2 || d.length > 2) return null;
  const iso = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  return isLocalDate(iso) ? iso : null;
}

/** True when a value reads differently as day/month and month/day (both parts ≤ 12 and not equal). */
export function isAmbiguousDayMonth(input: string): boolean {
  const parts = String(input ?? '').trim().split(/[/.\-\s]+/);
  if (parts.length !== 3 || parts[0].length === 4) return false;
  const [a, b] = [Number(parts[0]), Number(parts[1])];
  return a >= 1 && a <= 12 && b >= 1 && b <= 12 && a !== b;
}
