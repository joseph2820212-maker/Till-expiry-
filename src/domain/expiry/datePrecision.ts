/**
 * Calendar dates, months and exact instants in a workspace time zone.
 *
 * - A date-only value stays a calendar day: it is never turned into "UTC midnight" (which moves it to the previous
 *   day west of Greenwich). Day maths uses UTC day numbers built from the three fields (see domain/dates.ts).
 * - An exact deadline is an offset-aware ISO instant. Converting a wall-clock time in a zone to an instant uses the
 *   zone's real offset at that moment, so daylight-saving changes are handled.
 */
import { addDays, endOfMonth, isLocalDate } from '../dates';
import type { DeadlineValue, LocalDate, LocalMonth } from './expiryTypes';

export { addDays, daysBetween, isLocalDate, endOfMonth } from '../dates';

const MONTH = /^(\d{4})-(\d{2})$/;
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isLocalMonth(s: unknown): s is LocalMonth {
  if (typeof s !== 'string') return false;
  const m = MONTH.exec(s);
  return !!m && Number(m[2]) >= 1 && Number(m[2]) <= 12 && Number(m[1]) >= 1900 && Number(m[1]) <= 2200;
}

export function isTime(s: unknown): s is string {
  return typeof s === 'string' && TIME.test(s);
}

/** True for an ISO timestamp that carries its own offset (Z or ±hh:mm), so it names one instant everywhere. */
export function isOffsetIso(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(s) && Number.isFinite(Date.parse(s));
}

/** Last calendar day of a month, used only for sorting / status of month-precision dates. */
export function monthEndDate(month: LocalMonth): LocalDate {
  return endOfMonth(`${month}-01`);
}

const formatters = new Map<string, Intl.DateTimeFormat | null>();
function formatter(tz: string): Intl.DateTimeFormat | null {
  if (!formatters.has(tz)) {
    try {
      formatters.set(tz, new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch {
      formatters.set(tz, null);
    }
  }
  return formatters.get(tz) ?? null;
}

export function isValidTimeZone(tz: unknown): tz is string {
  return typeof tz === 'string' && tz.length > 0 && formatter(tz) !== null;
}

export function deviceTimeZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimeZone(tz) ? tz : 'UTC';
  } catch { return 'UTC'; }
}

export interface ZonedParts { year: number; month: number; day: number; hour: number; minute: number; second: number }

/** Wall-clock parts of an instant in a zone. Falls back to device-local time if the zone is unknown. */
export function zonedParts(instantMs: number, tz: string): ZonedParts {
  const f = formatter(tz);
  if (!f) {
    const d = new Date(instantMs);
    return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), hour: d.getHours(), minute: d.getMinutes(), second: d.getSeconds() };
  }
  const p: Record<string, number> = {};
  for (const part of f.formatToParts(new Date(instantMs))) if (part.type !== 'literal') p[part.type] = Number(part.value);
  return { year: p.year, month: p.month, day: p.day, hour: p.hour === 24 ? 0 : p.hour, minute: p.minute, second: p.second };
}

/** Offset of the zone from UTC at an instant, in minutes (Europe/London in summer: +60). */
export function zoneOffsetMinutes(instantMs: number, tz: string): number {
  const p = zonedParts(instantMs, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(instantMs / 1000) * 1000) / 60000);
}

const pad = (n: number, w = 2) => String(Math.abs(n)).padStart(w, '0');

export function localDateOf(instantMs: number, tz: string): LocalDate {
  const p = zonedParts(instantMs, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export function localTimeOf(instantMs: number, tz: string): string {
  const p = zonedParts(instantMs, tz);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** "Today" in the workspace zone. */
export function todayIn(tz: string, now: number = Date.now()): LocalDate {
  return localDateOf(now, tz);
}

/** An ISO string with the zone's offset at that instant, e.g. 2026-10-25T01:30:00+01:00. */
export function isoInZone(instantMs: number, tz: string): string {
  const p = zonedParts(instantMs, tz);
  const off = zoneOffsetMinutes(instantMs, tz);
  const sign = off < 0 ? '-' : '+';
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}${sign}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`;
}

/**
 * The instant at which a wall-clock time happens in a zone. A time skipped by a spring-forward change resolves to the
 * same wall-clock offset after the change (01:30 on the London change day → 02:30 BST); an ambiguous autumn time
 * resolves to the first occurrence.
 */
export function zonedTimeToInstant(date: LocalDate, time: string, tz: string): number {
  if (!isLocalDate(date) || !isTime(time)) throw new RangeError(`bad date/time ${date} ${time}`);
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  // Offsets a day either side of the wall-clock time: equal except around a daylight-saving change.
  const before = zoneOffsetMinutes(guess - 86400000, tz);
  const after = zoneOffsetMinutes(guess + 86400000, tz);
  const candidates = [...new Set([before, after])].map(o => guess - o * 60000);
  const valid = candidates.filter(t => {
    const p = zonedParts(t, tz);
    return p.hour === hh && p.minute === mm && p.day === d;
  });
  if (valid.length) return Math.min(...valid);         // normal, or the first of a repeated autumn hour
  return guess - before * 60000;                        // skipped spring hour: same wall-clock offset, lands after the gap
}

export function zonedIso(date: LocalDate, time: string, tz: string): string {
  return isoInZone(zonedTimeToInstant(date, time, tz), tz);
}

/** Last instant of a local calendar day in a zone (used to compare a date-only deadline with an exact one). */
export function endOfLocalDay(date: LocalDate, tz: string): number {
  return zonedTimeToInstant(addDays(date, 1), '00:00', tz) - 1;
}

/** The comparable instant of any deadline (month → end of its last day; date → end of that day). */
export function deadlineInstant(d: DeadlineValue, tz: string): number {
  if (d.precision === 'datetime') return Date.parse(d.at);
  const date = d.precision === 'month' ? monthEndDate(d.month) : d.date;
  return endOfLocalDay(date, tz);
}

/** The calendar day a deadline falls on in the zone. */
export function deadlineDate(d: DeadlineValue, tz: string): LocalDate {
  if (d.precision === 'datetime') return localDateOf(Date.parse(d.at), tz);
  return d.precision === 'month' ? monthEndDate(d.month) : d.date;
}

export function isValidDeadline(d: DeadlineValue | undefined): d is DeadlineValue {
  if (!d) return false;
  if (d.precision === 'date') return isLocalDate(d.date);
  if (d.precision === 'month') return isLocalMonth(d.month);
  return isOffsetIso(d.at);
}
