import i18n from '../i18n';

const AR = '٠١٢٣٤٥٦٧٨٩';

// Convert Eastern Arabic-Indic digits (٠-٩) to Western 0-9 (for parsing input, and to
// force straight Latin digits on any locale-formatted output).
export function normalizeArabicNumerals(str: string): string {
  return str.replace(/[٠-٩]/g, d => String(AR.indexOf(d)));
}

/**
 * F09.4 (audit, owner decision): financial figures use WESTERN digits 0-9 in every
 * language, Arabic included, consistently across fields, result cards, PDFs, CSV
 * and the checklist. Arabic-Indic input is still accepted (normalizeArabicNumerals).
 * The switch is kept explicit so the decision is visible and reversible.
 */
export const FINANCIAL_DIGITS: 'western' | 'arabicIndic' = 'western';

export function localizeDigits(str: string): string {
  if (FINANCIAL_DIGITS !== 'arabicIndic' || i18n.language !== 'ar') return str;
  return str.replace(/[0-9]/g, d => AR[+d]);
}

// Locale used for DATE name/structure formatting (en/tr go through platform Intl;
// Arabic is built from bundled name arrays — see arabicDate).
export function appLocale(): string {
  const l = i18n.language;
  if (l === 'tr') return 'tr-TR';
  if (l === 'ar') return 'ar';
  if (l === 'fr') return 'fr-FR';
  if (l === 'es') return 'es-ES';
  if (l === 'de') return 'de-DE';
  return 'en-GB';
}

const pad2 = (n: number) => String(n).padStart(2, '0');

// MON-04: turn a stored date value into a Date for DISPLAY. A bare YYYY-MM-DD
// business date must be parsed in LOCAL time — `new Date('2026-03-01')` is parsed
// as UTC midnight, which renders as the PREVIOUS calendar day for users west of
// UTC. Strings that carry a time component (full ISO timestamps like createdAt)
// keep their normal TZ-aware parsing; only the date-only form is reconstructed
// locally.
export function toDisplayDate(date: string | Date): Date {
  if (typeof date !== 'string') return date;
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(date);
}

function names(key: string): string[] {
  const v = i18n.t(key, { returnObjects: true });
  return Array.isArray(v) ? (v as string[]) : [];
}

// Build an Arabic date from the bundled month/weekday name arrays. This does NOT depend
// on platform Intl (Hermes can lack Arabic locale data and fall back to English), and
// always uses straight Latin digits. Arrays are Monday-first.
function arabicDate(d: Date, opts: Intl.DateTimeFormatOptions): string {
  const midx = d.getMonth();
  const widx = (d.getDay() + 6) % 7;
  const weekday = opts.weekday
    ? (opts.weekday === 'long' ? names('common.weekdaysFull') : names('common.weekdaysShort'))[widx] ?? ''
    : '';

  let body = '';
  if ((opts.month === '2-digit' || opts.month === 'numeric') && opts.day && opts.year) {
    // numeric date → 15/05/2026
    const day = opts.day === '2-digit' ? pad2(d.getDate()) : String(d.getDate());
    const mon = opts.month === '2-digit' ? pad2(midx + 1) : String(midx + 1);
    body = `${day}/${mon}/${d.getFullYear()}`;
  } else {
    const bits: string[] = [];
    if (opts.day) bits.push(opts.day === '2-digit' ? pad2(d.getDate()) : String(d.getDate()));
    if (opts.month === 'long') bits.push(names('common.monthsFull')[midx] ?? '');
    else if (opts.month === 'short') bits.push(names('common.monthsShort')[midx] ?? '');
    else if (opts.month === '2-digit') bits.push(pad2(midx + 1));
    else if (opts.month === 'numeric') bits.push(String(midx + 1));
    if (opts.year) bits.push(String(d.getFullYear()));
    body = bits.join(' ');
  }

  let out = weekday && body ? `${weekday}، ${body}` : (body || weekday);
  if (opts.hour || opts.minute) out = `${out ? out + ' ' : ''}${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  return localizeDigits(out.trim()); // Arabic-Indic digits (no-op for other languages)
}

// Full date: "Friday, 15 May 2026" / "الجمعة، 15 مايو 2026" (Arabic name, Latin digits)
export function localDate(
  date: string | Date,
  opts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
): string {
  try {
    const d = toDisplayDate(date);
    if (isNaN(d.getTime())) return String(date);
    if (i18n.language === 'ar') return arabicDate(d, opts);
    return normalizeArabicNumerals(d.toLocaleDateString(appLocale(), opts));
  } catch { return String(date); }
}

// Short date: "15 May 2026" / "15 مايو 2026"
export function localDateShort(date: string | Date): string {
  return localDate(date, { day: 'numeric', month: 'short', year: 'numeric' });
}

// Numeric date: "15/05/2026"
export function localDateNumeric(date: string | Date): string {
  return localDate(date, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Locale-aware short month name for a 0-based month index (0=Jan). "Jan" / "ينا" / "Oca".
export function localMonthShort(monthIndex: number): string {
  const idx = ((monthIndex % 12) + 12) % 12;
  try {
    if (i18n.language === 'ar') return names('common.monthsShort')[idx] ?? String(monthIndex);
    const d = new Date(2020, idx, 1);
    return normalizeArabicNumerals(d.toLocaleDateString(appLocale(), { month: 'short' }));
  } catch { return String(monthIndex); }
}

// Locale-aware short weekday name for a 0-based day index (0=Sunday). "Sun" / "الأح".
export function localWeekdayShort(dayIndex: number): string {
  try {
    if (i18n.language === 'ar') return names('common.weekdaysShort')[(((dayIndex % 7) + 7) % 7 + 6) % 7] ?? String(dayIndex);
    const d = new Date(2024, 0, 7 + (((dayIndex % 7) + 7) % 7));
    return normalizeArabicNumerals(d.toLocaleDateString(appLocale(), { weekday: 'short' }));
  } catch { return String(dayIndex); }
}

export function localTime(
  date: string | Date,
  opts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' },
): string {
  try {
    const d = toDisplayDate(date);
    if (isNaN(d.getTime())) return String(date);
    if (i18n.language === 'ar') return localizeDigits(`${pad2(d.getHours())}:${pad2(d.getMinutes())}`);
    return normalizeArabicNumerals(d.toLocaleTimeString(appLocale(), opts));
  } catch { return String(date); }
}

export function localDateTime(
  date: string | Date,
  opts: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  },
): string {
  try {
    const d = toDisplayDate(date);
    if (isNaN(d.getTime())) return String(date);
    if (i18n.language === 'ar') return arabicDate(d, opts);
    return normalizeArabicNumerals(d.toLocaleString(appLocale(), opts));
  } catch { return String(date); }
}

// Deterministic number grouping — does NOT use Intl/toLocaleString, which on the
// device JS engine (Hermes) ignores the locale argument and falls back to the
// PHONE's locale.
export function groupNumber(
  value: number | null | undefined,
  minFrac = 0,
  maxFrac = 3,
): string {
  const v = value === null || value === undefined || !Number.isFinite(value) ? 0 : value;
  const language = i18n.language;
  const commaDecimal = language === 'tr' || language === 'fr' || language === 'es' || language === 'de';
  const thousands = language === 'fr' ? ' ' : commaDecimal ? '.' : ',';
  const decimal = commaDecimal ? ',' : '.';
  const neg = v < 0 ? '-' : '';
  const max = Math.max(minFrac, maxFrac);
  const parts = Math.abs(v).toFixed(max).split('.');
  let int = parts[0];
  let frac = parts[1] ?? '';
  if (maxFrac > minFrac) frac = frac.replace(/0+$/, '');
  while (frac.length < minFrac) frac += '0';
  // Spanish convention normally leaves four-digit values ungrouped.
  if (language !== 'es' || int.length > 4) {
    int = int.replace(/\B(?=(\d{3})+(?!\d))/g, thousands);
  }
  return localizeDigits(neg + (frac ? `${int}${decimal}${frac}` : int));
}

// Number formatting — consistent grouping across all languages (Arabic-Indic
// digits for Arabic), independent of the device locale.
export function formatNumber(
  value: number | null | undefined,
  opts: Intl.NumberFormatOptions = {},
): string {
  return groupNumber(value, opts.minimumFractionDigits ?? 0, opts.maximumFractionDigits ?? 3);
}

export function formatPercent(value: number | null | undefined, decimals = 1): string {
  return `${formatNumber(value, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}%`;
}

// ── Display-safe formatters ──────────────────────────────────────────────────

/** App-standard date+time for the UI; never renders a raw ISO string. */
export function formatDisplayDateTime(value: string | Date | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  return localDateTime(value);
}

/** Percent for display: "—" when not finite, capped at ±999%. */
export function formatDisplayPercent(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  if (value > 999) return '>999%';
  if (value < -999) return '<-999%';
  return formatPercent(value, decimals);
}

/** Adaptive file size: KB under 1 MB, one-decimal MB at/above 1 MB. */
export function formatFileSize(bytes: number | null | undefined): string {
  const b = bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0 ? 0 : bytes;
  const KB = 1024, MB = KB * 1024;
  if (b < MB) {
    const kb = b <= 0 ? 0 : Math.max(1, Math.round(b / KB));
    return `${localizeDigits(String(kb))} KB`;
  }
  return `${groupNumber(b / MB, 1, 1)} MB`;
}

/** Minimal pluraliser: pluralise(1,'file') → "1 file", pluralise(3,'file') → "3 files". */
export function pluralise(count: number, singular: string, plural?: string): string {
  const word = count === 1 ? singular : (plural ?? `${singular}s`);
  return `${localizeDigits(String(count))} ${word}`;
}
