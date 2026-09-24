/**
 * What happens after a scan (E15). A standard product barcode identifies the PRODUCT only — it never means a pack date
 * was captured, so the add route always goes on to the form that asks for the date (§11.1, T32). GS1 data, when
 * present and reliable, travels as the raw text and is re-parsed by the form as a suggestion (§11.2).
 */
import type { Product } from '../../domain/expiry/expiryTypes';
import type { TabStackParamList } from '../../navigation/AppNavigator';
import type { BarcodeSymbology } from '../products/utils/barcode';
import { findByBarcodeIn } from '../products/productStore';
import { gtinLookupCodes, parseGs1, type Gs1Result } from './gs1';

export type ScanPurpose = TabStackParamList['BarcodeScanner']['purpose'];

export function symbologyOf(type: string): BarcodeSymbology {
  const t = String(type ?? '').toLowerCase().replace('org.gs1.', '').replace('org.iso.', '').replace('-', '_');
  if (t.includes('ean13') || t === 'ean_13') return 'ean13';
  if (t.includes('ean8') || t === 'ean_8') return 'ean8';
  if (t.includes('upc_e') || t === 'upce') return 'upc_e';
  if (t.includes('upc_a') || t === 'upca') return 'upc_a';
  if (t.includes('code128') || t === 'code_128') return 'code128';
  if (t.includes('itf14') || t === 'itf_14') return 'itf14';
  return 'unknown';
}

/** Symbol types that can carry GS1 element strings without a symbology prefix. */
export function canCarryGs1(type: string): boolean {
  const t = String(type ?? '').toLowerCase();
  return t.includes('datamatrix') || t.includes('data_matrix') || t.includes('code128') || t.includes('code_128') || t.includes('gs1');
}

export interface ReadCode {
  /** The product code to match / store (the GTIN's pack code for GS1 data), or null when GS1 data has no GTIN. */
  code: string | null;
  symbology: BarcodeSymbology;
  /** Codes to try, in order, against the products of the active workspace. */
  lookup: string[];
  gs1: Gs1Result | null;
  raw: string;
}

export function readScannedCode(raw: string, type: string): ReadCode {
  const text = String(raw ?? '').trim();
  const gs1 = parseGs1(text, { allowBare: canCarryGs1(type) });
  if (gs1) {
    const lookup = gs1.gtin ? gtinLookupCodes(gs1.gtin) : [];
    return { code: lookup[0] ?? null, symbology: lookup[0]?.length === 13 ? 'ean13' : 'unknown', lookup, gs1, raw: text };
  }
  const symbology = symbologyOf(type);
  return { code: text || null, symbology, lookup: text ? [text] : [], gs1: null, raw: text };
}

export function findProductFor(read: ReadCode, products: Product[]): Product | null {
  for (const c of read.lookup) {
    const p = findByBarcodeIn(products, c, read.symbology);
    if (p) return p;
  }
  return null;
}

export type ScanOutcome =
  | { type: 'navigate'; route: 'AddBoughtIn'; params: NonNullable<TabStackParamList['AddBoughtIn']> }
  | { type: 'navigate'; route: 'AddOpened'; params: NonNullable<TabStackParamList['AddOpened']> }
  | { type: 'navigate'; route: 'ProductDetail'; params: TabStackParamList['ProductDetail'] }
  | { type: 'attach'; code: string; symbology: string }
  | { type: 'notFound'; code: string; symbology: string }
  | { type: 'nothing' };

/** Pure routing after a scan; the screen performs it. */
export function scanOutcome(purpose: ScanPurpose, read: ReadCode, product: Product | null): ScanOutcome {
  if (purpose === 'attach') return read.code ? { type: 'attach', code: read.code, symbology: read.symbology } : { type: 'nothing' };
  if (purpose === 'add') {
    // Known or unknown product: always the bought-in form, which asks for the date (a GS1 date is only prefilled).
    const params: NonNullable<TabStackParamList['AddBoughtIn']> = {};
    if (product) params.productId = product.id;
    else if (read.code) { params.barcode = read.code; params.symbology = read.symbology; }
    if (read.gs1) params.gs1 = read.raw;
    if (!product && !read.code && !read.gs1) return { type: 'nothing' };
    return { type: 'navigate', route: 'AddBoughtIn', params };
  }
  if (!product) return read.code ? { type: 'notFound', code: read.code, symbology: read.symbology } : { type: 'nothing' };
  if (purpose === 'open') return { type: 'navigate', route: 'AddOpened', params: { productId: product.id } };
  return { type: 'navigate', route: 'ProductDetail', params: { id: product.id } };
}

export const DUPLICATE_WINDOW_MS = 1500;

/** Drops the same raw text read again within the window (a held camera reads a code many times a second). */
export function createScanDebounce(windowMs = DUPLICATE_WINDOW_MS, clock: () => number = Date.now) {
  let last: { code: string; at: number } | null = null;
  return (code: string): boolean => {
    const now = clock();
    if (last && last.code === code && now - last.at < windowMs) return false;
    last = { code, at: now };
    return true;
  };
}
