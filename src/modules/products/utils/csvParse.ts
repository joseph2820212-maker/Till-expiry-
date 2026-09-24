/**
 * CSV reading carried over from TillCalc (parseCsv, normaliseHeader). Only the
 * text-to-cells part is reused: number parsing is deliberately NOT carried over
 * (TillCalc's parseNumberCell guesses decimal commas; see docs/REUSE_MANIFEST.md, V1).
 */
/** RFC-4180-style parser: quotes, escaped quotes, CRLF. */
export function parseCsv(text: string, delimiter: ',' | ';' | '\t' = ','): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  const src = (text || '').replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else inQuotes = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') { inQuotes = true; continue; }
    if (ch === delimiter) { row.push(cell); cell = ''; continue; }
    if (ch === '\r') continue;
    if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; continue; }
    cell += ch;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}

export function normaliseHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

/**
 * The delimiter of a CSV file, from its first line (outside quotes): Excel in France, Germany, Spain and Turkey saves
 * ";" because "," is the decimal mark. Tabs are recognised too.
 */
export function detectDelimiter(text: string): ',' | ';' | '\t' {
  const first = (text.replace(/^\uFEFF/, '').split(/\r?\n/)[0] ?? '').replace(/"[^"]*"/g, '');
  const count = (c: string) => first.split(c).length - 1;
  const counts: [',' | ';' | '\t', number][] = [[';', count(';')], ['\t', count('\t')], [',', count(',')]];
  const best = counts.sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : ',';
}
