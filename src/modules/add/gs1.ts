/**
 * GS1 element strings (master handoff §11.2): only AIs (01) GTIN, (10) batch/lot, (15) best before and (17) expiration
 * are USED; other well-known AIs are recognised only so their length can be skipped. Anything that cannot be read
 * reliably is dropped with a reason — a malformed code never invents a date (T34).
 *
 * The result is a SUGGESTION: the add form prefills it and the user still has to confirm the date and its kind.
 * A standard EAN/UPC product code is not GS1 data and returns null here (the form then simply asks for the date).
 *
 * Accepted forms:
 * - symbology identifier prefix `]C1` (GS1-128), `]d2` (GS1 DataMatrix), `]Q3` (GS1 QR), `]e0` (GS1 DataBar),
 *   `]J1` (GS1 DotCode), followed by the element string with FNC1 transmitted as GS (0x1D);
 * - a plain element string that contains GS separators, or (when the caller says the symbol can carry GS1 data)
 *   one that starts with AI (01);
 * - human-readable form `(01)09501101530003(17)261231(10)AB-12`.
 *
 * Dates are YYMMDD. DD = 00 is interpreted per AI (EXP-REV-09): for AI (17) expiration it is the LAST DAY of that month
 * (GS1 General Specifications, leap years included) and is returned as that calendar date; for AI (15) best before it
 * stays a "best before end of month" with month precision. The century follows the
 * GS1 General Specifications sliding window (§7.12): YY minus the current two-digit year from 51 to 99 → previous
 * century, from −99 to −50 → next century, otherwise the current century.
 */
import type { DeadlineValue } from '../../domain/expiry/expiryTypes';

export const GS = '\u001d';

export type Gs1IssueCode =
  | 'unknownAi'        // an AI this parser does not know: the rest of the string cannot be split reliably
  | 'truncated'        // a fixed-length field is cut short
  | 'malformed'        // text that is not a valid element string (e.g. stray characters in the bracketed form)
  | 'badLength'        // a field longer / shorter than the AI allows
  | 'badGtin'          // AI 01 is not 14 digits
  | 'badGtinCheck'     // AI 01 check digit is wrong
  | 'badLot'           // AI 10 empty, longer than 20 or uses characters outside the GS1 set
  | 'badDate'          // AI 15 / 17 is not a real YYMMDD date
  | 'conflict';        // the same AI appears twice with different values

export interface Gs1Issue { code: Gs1IssueCode; ai?: string }

export interface Gs1Result {
  /** The text as received. */
  raw: string;
  /** GTIN-14 with a valid check digit. */
  gtin?: string;
  lot?: string;
  /** AI 15 — best before (quality date). */
  bestBefore?: DeadlineValue;
  /** AI 17 — expiration date. */
  expiry?: DeadlineValue;
  /** Every AI seen, in order (including ignored ones). */
  ais: string[];
  /** True when the whole string was split without a structural problem. */
  complete: boolean;
  issues: Gs1Issue[];
}

interface AiSpec { fixed?: number; max?: number; min?: number }

/** Two-digit AIs. */
const AI2: Record<string, AiSpec> = {
  '00': { fixed: 18 }, '01': { fixed: 14 }, '02': { fixed: 14 }, '03': { fixed: 14 }, '04': { fixed: 16 },
  '10': { max: 20 }, '11': { fixed: 6 }, '12': { fixed: 6 }, '13': { fixed: 6 }, '15': { fixed: 6 }, '16': { fixed: 6 },
  '17': { fixed: 6 }, '20': { fixed: 2 }, '21': { max: 20 }, '22': { max: 20 }, '30': { max: 8 }, '37': { max: 8 },
  '90': { max: 30 }, '91': { max: 90 }, '92': { max: 90 }, '93': { max: 90 }, '94': { max: 90 }, '95': { max: 90 },
  '96': { max: 90 }, '97': { max: 90 }, '98': { max: 90 }, '99': { max: 90 },
};

/** Three-digit AIs. */
const AI3: Record<string, AiSpec> = {
  '235': { max: 28 }, '240': { max: 30 }, '241': { max: 30 }, '242': { max: 6 }, '243': { max: 20 }, '250': { max: 30 },
  '251': { max: 30 }, '253': { min: 13, max: 30 }, '254': { max: 20 }, '255': { min: 13, max: 25 }, '400': { max: 30 },
  '401': { max: 30 }, '402': { fixed: 17 }, '403': { max: 30 }, '410': { fixed: 13 }, '411': { fixed: 13 },
  '412': { fixed: 13 }, '413': { fixed: 13 }, '414': { fixed: 13 }, '415': { fixed: 13 }, '416': { fixed: 13 },
  '417': { fixed: 13 }, '420': { max: 20 }, '421': { min: 4, max: 12 }, '422': { fixed: 3 }, '423': { min: 3, max: 15 },
  '424': { fixed: 3 }, '425': { min: 3, max: 15 }, '426': { fixed: 3 }, '427': { max: 3 },
};

/** Four-digit AIs (the fourth digit is a decimal position or a variant). */
function ai4(code: string): AiSpec | undefined {
  const p = code.slice(0, 3);
  if (/^3[1-6]\d$/.test(p)) return { fixed: 6 };                 // measures 310n–369n
  if (p === '390' || p === '392') return { max: 15 };             // amounts payable
  if (p === '391' || p === '393') return { min: 4, max: 18 };     // amounts with ISO currency
  if (p === '394') return { fixed: 4 };
  if (p === '395') return { fixed: 6 };
  const fixed4: Record<string, AiSpec> = { '7001': { fixed: 13 }, '7003': { fixed: 10 }, '7006': { fixed: 6 }, '8005': { fixed: 6 }, '8006': { fixed: 18 } };
  const var4: Record<string, AiSpec> = { '7002': { max: 30 }, '7004': { max: 4 }, '7005': { max: 12 }, '7007': { min: 6, max: 12 }, '7008': { max: 3 }, '7009': { max: 10 }, '7010': { max: 2 }, '8001': { fixed: 14 }, '8002': { max: 20 }, '8003': { min: 14, max: 30 }, '8004': { max: 30 }, '8007': { max: 34 }, '8008': { min: 8, max: 12 }, '8020': { max: 25 }, '8200': { max: 70 } };
  return fixed4[code] ?? var4[code];
}

function lookupAi(s: string, pos: number): { ai: string; spec: AiSpec } | null {
  const two = s.slice(pos, pos + 2);
  if (/^\d{2}$/.test(two) && AI2[two]) return { ai: two, spec: AI2[two] };
  const three = s.slice(pos, pos + 3);
  if (/^\d{3}$/.test(three) && AI3[three]) return { ai: three, spec: AI3[three] };
  const four = s.slice(pos, pos + 4);
  if (/^\d{4}$/.test(four)) { const sp = ai4(four); if (sp) return { ai: four, spec: sp }; }
  return null;
}

function specFor(ai: string): AiSpec | undefined {
  if (ai.length === 2) return AI2[ai];
  if (ai.length === 3) return AI3[ai];
  if (ai.length === 4) return ai4(ai);
  return undefined;
}

// ─── field validation ──────────────────────────────────────────────────────────

/** GS1 mod-10 check digit for the digits before the check digit. */
export function gs1CheckDigit(body: string): number {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const fromRight = body.length - 1 - i;
    sum += Number(body[i]) * (fromRight % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

export function isValidGtin14(g: string): boolean {
  return /^\d{14}$/.test(g) && gs1CheckDigit(g.slice(0, 13)) === Number(g[13]);
}

/** GS1 AI encodable character set 82 (what AI 10 may contain). */
const CSET82 = /^[!"%&'()*+,\-./0-9:;<=>?A-Z_a-z]+$/;

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Four-digit year for a two-digit GS1 year, relative to `now` (GS1 General Specifications §7.12). */
export function gs1Year(yy: number, now: Date = new Date()): number {
  const current = now.getFullYear();
  const cy = current % 100;
  const century = current - cy;
  const diff = yy - cy;
  if (diff >= 51) return century - 100 + yy;
  if (diff <= -50) return century + 100 + yy;
  return century + yy;
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** YYMMDD → a calendar date; DD 00 → the month (AI 15) or its last day (AI 17). Null when not a real date. */
export function parseGs1Date(v: string, now: Date = new Date(), ai: '15' | '17' = '15'): DeadlineValue | null {
  if (!/^\d{6}$/.test(v)) return null;
  const yy = Number(v.slice(0, 2));
  const mm = Number(v.slice(2, 4));
  const dd = Number(v.slice(4, 6));
  if (mm < 1 || mm > 12) return null;
  const year = gs1Year(yy, now);
  if (dd === 0) {
    return ai === '17'
      ? { precision: 'date', date: `${year}-${pad2(mm)}-${pad2(daysInMonth(year, mm))}` }
      : { precision: 'month', month: `${year}-${pad2(mm)}` };
  }
  if (dd > daysInMonth(year, mm)) return null;
  return { precision: 'date', date: `${year}-${pad2(mm)}-${pad2(dd)}` };
}

// ─── splitting ─────────────────────────────────────────────────────────────────

const PREFIXES = [']C1', ']d2', ']Q3', ']e0', ']J1'];

interface Split { pairs: { ai: string; value: string }[]; issues: Gs1Issue[]; complete: boolean }

function splitElementString(data: string): Split {
  const pairs: Split['pairs'] = [];
  const issues: Gs1Issue[] = [];
  let pos = 0;
  while (pos < data.length) {
    if (data[pos] === GS) { pos += 1; continue; }
    const found = lookupAi(data, pos);
    if (!found) { issues.push({ code: 'unknownAi', ai: data.slice(pos, pos + 4).replace(/\D.*$/, '') || undefined }); return { pairs, issues, complete: false }; }
    const { ai, spec } = found;
    pos += ai.length;
    if (spec.fixed) {
      const value = data.slice(pos, pos + spec.fixed);
      if (value.length < spec.fixed || value.includes(GS)) { issues.push({ code: 'truncated', ai }); return { pairs, issues, complete: false }; }
      pairs.push({ ai, value });
      pos += spec.fixed;
    } else {
      let end = data.indexOf(GS, pos);
      if (end < 0) end = data.length;
      const value = data.slice(pos, end);
      pairs.push({ ai, value });
      pos = end;
    }
  }
  return { pairs, issues, complete: true };
}

function splitBracketed(data: string): Split {
  const pairs: Split['pairs'] = [];
  const issues: Gs1Issue[] = [];
  const text = data.replace(/\s+(?=\()/g, '').trim();
  const re = /\((\d{2,4})\)([^()]*)/g;
  let consumed = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index !== consumed) { issues.push({ code: 'malformed' }); return { pairs, issues, complete: false }; }
    consumed = re.lastIndex;
    const ai = m[1];
    if (!specFor(ai)) { issues.push({ code: 'unknownAi', ai }); return { pairs, issues, complete: false }; }
    pairs.push({ ai, value: m[2].trim() });
  }
  if (consumed !== text.length || !pairs.length) { issues.push({ code: 'malformed' }); return { pairs, issues, complete: false }; }
  return { pairs, issues, complete: true };
}

export interface ParseOptions {
  /** The symbol type can carry GS1 data (DataMatrix, GS1-128, QR…): a bare string starting with (01) is tried. */
  allowBare?: boolean;
  /** Reference "today" for the century window (tests). */
  now?: Date;
}

/**
 * Parse a scanned or typed GS1 element string. Returns null when the text is not GS1 data at all (e.g. a plain EAN-13),
 * otherwise what could be read reliably plus the reasons for anything dropped.
 */
export function parseGs1(input: string, opts: ParseOptions = {}): Gs1Result | null {
  const raw = String(input ?? '');
  let data = raw.replace(/^[\s\r\n]+|[\s\r\n]+$/g, '');
  if (!data) return null;
  let mode: 'element' | 'bracketed' | null = null;
  const prefix = PREFIXES.find(p => data.startsWith(p));
  if (prefix) {
    data = data.slice(prefix.length);
    mode = data.startsWith('(') ? 'bracketed' : 'element';
  } else if (/^\(\d{2,4}\)/.test(data)) {
    mode = 'bracketed';
  } else if (data.includes(GS)) {
    mode = 'element';
  } else if (opts.allowBare && /^01\d{14}/.test(data)) {
    mode = 'element';
  }
  if (!mode) return null;
  if (!data) return { raw, ais: [], complete: false, issues: [{ code: 'malformed' }] };

  const split = mode === 'bracketed' ? splitBracketed(data) : splitElementString(data);
  const result: Gs1Result = { raw, ais: split.pairs.map(p => p.ai), complete: split.complete, issues: [...split.issues] };
  const seen = new Map<string, string>();
  const conflicted = new Set<string>();

  for (const { ai, value } of split.pairs) {
    const spec = specFor(ai) as AiSpec;
    const prior = seen.get(ai);
    if (prior !== undefined && prior !== value) { conflicted.add(ai); continue; }
    seen.set(ai, value);
    if (spec.fixed && value.length !== spec.fixed) { result.issues.push({ code: 'badLength', ai }); continue; }
    if (!spec.fixed && (value.length === 0 || (spec.max && value.length > spec.max) || (spec.min && value.length < spec.min))) {
      result.issues.push({ code: ai === '10' ? 'badLot' : 'badLength', ai });
      continue;
    }
    if (ai === '01') {
      if (!/^\d{14}$/.test(value)) result.issues.push({ code: 'badGtin', ai });
      else if (!isValidGtin14(value)) result.issues.push({ code: 'badGtinCheck', ai });
      else result.gtin = value;
    } else if (ai === '10') {
      if (!CSET82.test(value)) result.issues.push({ code: 'badLot', ai });
      else result.lot = value;
    } else if (ai === '15' || ai === '17') {
      const d = parseGs1Date(value, opts.now, ai);
      if (!d) result.issues.push({ code: 'badDate', ai });
      else if (ai === '15') result.bestBefore = d; else result.expiry = d;
    }
  }
  for (const ai of conflicted) {
    result.issues.push({ code: 'conflict', ai });
    if (ai === '01') delete result.gtin;
    if (ai === '10') delete result.lot;
    if (ai === '15') delete result.bestBefore;
    if (ai === '17') delete result.expiry;
  }
  return result;
}

/**
 * The product code to look the GTIN up by: a GTIN-14 with a leading zero is the EAN-13 / UPC-A printed on the pack
 * (indicator digit 0); any other indicator digit is a case / pack level code and stays 14 digits.
 */
export function gtinLookupCodes(gtin: string): string[] {
  if (!/^\d{14}$/.test(gtin)) return [];
  if (gtin.startsWith('0')) return [gtin.slice(1), gtin];
  return [gtin];
}

/** True when the result holds anything the add form can prefill. */
export function hasSuggestion(r: Gs1Result | null | undefined): r is Gs1Result {
  return !!r && !!(r.gtin || r.lot || r.bestBefore || r.expiry);
}
