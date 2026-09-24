/**
 * csv.ts — minimal RFC-4180 CSV builder. Pure string helpers, no I/O.
 */

/**
 * Escape one cell: wrap in quotes if it contains a comma, quote, or newline,
 * and neutralise spreadsheet formula injection. A text cell beginning with
 * `= + - @` (or a tab/CR) is treated as a formula by Excel/Sheets, so such a
 * cell — e.g. a user-named category like `=HYPERLINK(...)` — is prefixed with a
 * single quote so it renders as text. Numbers pass through untouched so negative
 * amounts (-50) are never mangled.
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return String(value);
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Join rows of cells into CSV text (CRLF line endings, as spreadsheets expect). */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows.map(row => row.map(csvCell).join(',')).join('\r\n');
}
