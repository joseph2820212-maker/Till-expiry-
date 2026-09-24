/**
 * TillExpiry record types. Every stored record has a stable id and a schemaVersion so later migrations are explicit.
 *
 * A Product is what the shop sells (name, barcodes, defaults). A DateBatch is one date on the shelf: the same
 * product can have several batches with different dates at once. What happens to a batch (checked, reduced,
 * sold, wasted, returned, donated) is kept as a list of events on the batch, so the history and the waste
 * report are built from the same records the shelf list uses.
 */
import type { Money } from './money';

export const SCHEMA_VERSIONS = {
  product: 1,
  batch: 1,
  settings: 1,
} as const;

export type IsoDateTime = string;
/** Local calendar date YYYY-MM-DD on the device. */
export type LocalDate = string;

export type BarcodeFormat = 'ean13' | 'ean8' | 'upca' | 'code128';

export interface ProductBarcode {
  /** Exactly as scanned or typed: leading zeros and spacing preserved. */
  raw: string;
  /** Normalised form used for matching (see products/utils/barcode.ts). */
  normalized: string;
  format: BarcodeFormat | 'unknown';
}

/**
 * The kind of date printed on the pack. The app never decides what the law requires for a kind; it only keeps
 * them apart so the shop can follow its own rules (Help explains the usual difference).
 */
export type DateType = 'useBy' | 'bestBefore' | 'sellBy' | 'displayUntil';
export const DATE_TYPES: readonly DateType[] = ['useBy', 'bestBefore', 'sellBy', 'displayUntil'] as const;

export interface Product {
  schemaVersion: typeof SCHEMA_VERSIONS.product;
  id: string;
  /** Full name exactly as typed or imported. */
  name: string;
  barcodes: ProductBarcode[];
  sku?: string;
  /** Aisle / shelf / fridge, printed on the date-check sheet. */
  shelfLocation?: string;
  category?: string;
  /** Date kind suggested when a new date is added for this product. */
  defaultDateType?: DateType;
  /** Typical shelf life in days: offers "today + N" when a date is added. */
  shelfLifeDays?: number;
  /** Warn this many days ahead for this product (overrides the shop setting). */
  alertDays?: number;
  /** Optional normal selling price: used only to value waste and reductions. */
  price?: Money;
  status: 'active' | 'archived';
  isSample: boolean;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/** What happened to (part of) a batch. `quantity` is how many units left the shelf through this event. */
export type BatchEventKind = 'checked' | 'reduced' | 'sold' | 'wasted' | 'returned' | 'donated';
export const REMOVAL_KINDS: readonly BatchEventKind[] = ['sold', 'wasted', 'returned', 'donated'] as const;

export type WasteReason = 'expired' | 'damaged' | 'quality' | 'other';

export interface BatchEvent {
  id: string;
  kind: BatchEventKind;
  on: LocalDate;
  at: IsoDateTime;
  /** Units removed (sold / wasted / returned / donated). Absent = "all that was left". */
  quantity?: number;
  /** Reduced-to price (reduced) — exact money, never a float. */
  price?: Money;
  reason?: WasteReason;
  note?: string;
}

export interface DateBatch {
  schemaVersion: typeof SCHEMA_VERSIONS.batch;
  id: string;
  productId: string;
  /** Snapshot of the product name when the date was added (history stays readable if the product changes). */
  productName: string;
  date: LocalDate;
  dateType: DateType;
  /** Units with this date when it was added. Absent = not counted. */
  quantity?: number;
  location?: string;
  note?: string;
  /** Open batches are on the shelf; closed ones are history. */
  status: 'open' | 'closed';
  events: BatchEvent[];
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  closedAt?: IsoDateTime;
}

/** The six app languages. */
export type LanguageCode = 'en' | 'ar' | 'tr' | 'fr' | 'es' | 'de';

export interface ReminderSettings {
  enabled: boolean;
  /** Local time of the daily reminder. */
  hour: number;
  minute: number;
}

export interface ExpirySettings {
  schemaVersion: typeof SCHEMA_VERSIONS.settings;
  /** Dates within this many days (after today) count as "due soon". */
  alertDays: number;
  defaultDateType: DateType;
  reminder: ReminderSettings;
}

export const DEFAULT_SETTINGS: ExpirySettings = {
  schemaVersion: 1,
  alertDays: 3,
  defaultDateType: 'bestBefore',
  reminder: { enabled: false, hour: 8, minute: 0 },
};
