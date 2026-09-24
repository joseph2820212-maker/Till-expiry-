/**
 * Step 2 of the CSV import (§19.3): decode a picked file safely.
 *
 * - Size, row, column and cell caps are checked before anything else is done with the content.
 * - UTF-8 with or without a BOM; bytes that are not valid UTF-8 are read as Windows-1252 (Excel's "CSV") so "£1.50"
 *   never turns into garbage (utils/base64.decodeText).
 * - "," ";" and tab delimiters (Excel in FR/DE/ES/TR saves ";"), RFC-4180 quoting (products/utils/csvParse).
 * - Spreadsheets (.xlsx is a zip) and binary files are refused with their own message instead of being parsed.
 * - The fingerprint is SHA-256 over the normalised text + import kind + workspace id: the same file imported twice
 *   into the same workspace is recognised whatever line endings or BOM it was saved with (T35).
 */
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { decodeText } from '../../utils/base64';
import { detectDelimiter, parseCsv } from '../products/utils/csvParse';

export type ImportKind = 'products' | 'batches';

export const IMPORT_LIMITS = {
  /** Bytes of the picked file. */
  fileBytes: 5 * 1024 * 1024,
  /** Data rows (the header row is not counted). */
  rows: 5000,
  columns: 60,
  cellChars: 1000,
} as const;

export type DecodeError = 'empty' | 'tooLarge' | 'spreadsheet' | 'binary' | 'tooManyRows' | 'tooManyColumns' | 'cellTooLong' | 'noDataRows';

export interface DecodedCsv {
  fileName: string;
  encoding: 'utf-8' | 'windows-1252';
  delimiter: ',' | ';' | '\t';
  /** Text with BOM removed, line endings unified and trailing blank lines trimmed (the fingerprint input). */
  normalized: string;
  header: string[];
  /** Data rows (without the header), each padded to the header width. */
  rows: string[][];
  columnCount: number;
}

export type DecodeResult = { ok: true; csv: DecodedCsv } | { ok: false; error: DecodeError };

/** Text as it is fingerprinted: no BOM, "\n" line endings, no trailing whitespace at the end of the file. */
export function normalizeCsvText(text: string): string {
  return text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').replace(/\s+$/, '');
}

export function decodeCsvText(text: string, fileName: string, encoding: DecodedCsv['encoding'] = 'utf-8'): DecodeResult {
  const normalized = normalizeCsvText(text);
  if (!normalized.trim()) return { ok: false, error: 'empty' };
  if (normalized.includes('\u0000')) return { ok: false, error: 'binary' };
  const delimiter = detectDelimiter(normalized);
  const all = parseCsv(normalized, delimiter);
  if (all.length === 0) return { ok: false, error: 'empty' };
  if (all.length - 1 > IMPORT_LIMITS.rows) return { ok: false, error: 'tooManyRows' };
  const columnCount = all.reduce((m, r) => Math.max(m, r.length), 0);
  if (columnCount > IMPORT_LIMITS.columns) return { ok: false, error: 'tooManyColumns' };
  for (const r of all) for (const c of r) if (c.length > IMPORT_LIMITS.cellChars) return { ok: false, error: 'cellTooLong' };
  const pad = (r: string[]) => (r.length < columnCount ? [...r, ...Array(columnCount - r.length).fill('')] : r);
  const header = pad(all[0]).map(h => h.trim());
  const rows = all.slice(1).map(pad);
  if (!rows.length) return { ok: false, error: 'noDataRows' };
  return { ok: true, csv: { fileName, encoding, delimiter, normalized, header, rows, columnCount } };
}

/** Bytes of a picked file → decoded CSV, or the reason it cannot be read. */
export function decodeCsvBytes(bytes: Uint8Array, fileName: string): DecodeResult {
  if (bytes.length === 0) return { ok: false, error: 'empty' };
  if (bytes.length > IMPORT_LIMITS.fileBytes) return { ok: false, error: 'tooLarge' };
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return { ok: false, error: 'spreadsheet' };        // zip: .xlsx / .ods
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf) return { ok: false, error: 'spreadsheet' };        // legacy .xls
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return { ok: false, error: 'binary' }; // %PDF
  if ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff)) return { ok: false, error: 'binary' }; // UTF-16: not supported
  const { text, encoding } = decodeText(bytes);
  return decodeCsvText(text, fileName, encoding);
}

/** SHA-256 import fingerprint (hex) of the normalised content, bound to the kind and the workspace. */
export function importFingerprint(normalized: string, kind: ImportKind, workspaceId: string): string {
  return bytesToHex(sha256(utf8ToBytes(`tillexpiry-import:v1\n${kind}\n${workspaceId}\n${normalizeCsvText(normalized)}`)));
}
