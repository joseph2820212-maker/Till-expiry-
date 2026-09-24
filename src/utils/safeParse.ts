/**
 * safeParse.ts — validated parsers for user-entered strings.
 *
 * Replaces the foot-gun pattern `str.split('/').map(Number)` (which silently
 * yields NaN values that JSON.stringify turns into null, leading to silent
 * zeros in downstream arithmetic). Every helper here returns `null` on
 * malformed input — callers must explicitly handle the failure case rather
 * than letting bad data flow into storage or calculations.
 */

/** Parse a "DD/MM/YYYY" string into a Date. Returns null if malformed. */
export function parseDmy(input: string | null | undefined): Date | null {
  if (!input) return null;
  const normalized = String(input)
    .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x06f0));
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(normalized)) return null;
  const parts = normalized.split('/');
  if (parts.length !== 3) return null;
  const d = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const y = parseInt(parts[2], 10);
  if (!Number.isFinite(d) || !Number.isFinite(m) || !Number.isFinite(y)) return null;
  if (d < 1 || d > 31 || m < 1 || m > 12 || y < 1900 || y > 9999) return null;
  const date = new Date(y, m - 1, d);
  // Reject roll-over dates like 31/02/2026 — JS would silently make it March
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}

/** Parse "DD/MM/YYYY" into "YYYY-MM-DD" ISO. Returns null if malformed. */
export function dmyToIso(input: string | null | undefined): string | null {
  const d = parseDmy(input);
  if (!d) return null;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Parse a numeric string into a finite number.
 * Returns null on NaN, Infinity, or empty input — caller decides the fallback.
 * Use this instead of `parseFloat(x) || 0` when you need to distinguish
 * "user left it blank" from "user typed nonsense".
 */
export function parseFiniteAmount(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined || input === '') return null;
  const n = typeof input === 'number' ? input : parseFloat(input);
  return Number.isFinite(n) ? n : null;
}

/**
 * DB-10: Strict parser for user-entered money amounts. Unlike parseFloat,
 * which silently accepts garbage ("12abc" → 12, "1,000" → 1, "1e3" → 1000),
 * this returns null for anything that is not a clean, non-negative decimal:
 * only digits with at most one dot. No sign, no thousands separators, no
 * exponent, no trailing letters. Returns null for empty/NaN/Infinity/negative.
 */
export function parseStrictAmount(input: string | number | null | undefined): number | null {
  if (typeof input === 'number') return Number.isFinite(input) && input >= 0 ? input : null;
  if (input === null || input === undefined) return null;
  let s = String(input).trim();
  if (s === '') return null;
  // M4: let decimal-comma locales (tr) and Arabic numerals enter decimals. The
  // decimal-pad keyboard there has no '.' key, so '12,5' / '١٢٫٥' would otherwise
  // fail the strict test and collapse to 0. Normalise Eastern-Arabic digits and
  // the Arabic decimal mark, and treat a SOLE comma (no dot) as the decimal point.
  s = s.replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/٫/g, '.');
  // Treat a comma as the decimal separator only when it's the sole separator and
  // followed by 1-2 fraction digits (a currency decimal), so '12,5'/'12,50' parse
  // while ambiguous thousands-style '1,000' stays rejected.
  if (!s.includes('.')) {
    const m = s.match(/^(\d+),(\d{1,2})$/);
    if (m) s = `${m[1]}.${m[2]}`;
  }
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Coerce any value to a finite number, falling back to a default. */
export function toFiniteOr(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  return Number.isFinite(n) ? n : fallback;
}

/** True only if the value is a finite, real number (not NaN, not Infinity, not null). */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Returns today's date as YYYY-MM-DD using LOCAL time, not UTC.
 * Use this everywhere a business date is needed (invoice dates, daily book dates,
 * dashboard "today" filters). Never use toISOString().slice(0, 10) for these
 * contexts — that returns the UTC date which can be the wrong calendar day for
 * users east of UTC+0 late at night.
 */
export function localISODate(d: Date = new Date()): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// True only for a REAL calendar day in strict YYYY-MM-DD form. Round-trips
// through Date so impossible inputs (2020-99-99, 2026-02-31) and non-numeric
// junk are rejected — a lexicographic comparison alone can't catch these.
export function isRealISODate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}
