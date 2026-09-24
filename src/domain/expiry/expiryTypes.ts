/**
 * TillExpiry record types (master handoff §7). A product and a dated batch of that product are always separate
 * records; rules and locations are their own records; every meaningful mutation appends a BatchEvent.
 * Every record belongs to exactly one workspace.
 */

export type IsoDateTime = string;
/** Calendar date YYYY-MM-DD, interpreted in the workspace time zone. */
export type LocalDate = string;
/** Calendar month YYYY-MM. */
export type LocalMonth = string;

export type WorkspaceMode = 'retail' | 'food_prep' | 'mixed' | 'home_other';

export interface Workspace {
  id: string;
  name: string;
  mode: WorkspaceMode;
  /** ISO 4217; '' until the user chooses one. Only used for optional costs / prices. */
  currency: string;
  /** IANA zone, e.g. Europe/London. Status and "today" are computed in this zone. */
  timeZone: string;
  status: 'active' | 'hidden';
  isDefault: boolean;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export type BarcodeRole = 'single' | 'pack' | 'case';

export interface ProductBarcode {
  /** Exactly as scanned or typed (leading zeros kept). */
  code: string;
  /** Normalised form used for matching (UPC-A = EAN-13). */
  normalized: string;
  symbology?: string;
  role: BarcodeRole;
  unitCount?: number;
}

export type TrackingUnit = 'each' | 'pack' | 'case' | 'g' | 'kg' | 'ml' | 'l' | 'custom';
export const TRACKING_UNITS: readonly TrackingUnit[] = ['each', 'pack', 'case', 'g', 'kg', 'ml', 'l', 'custom'] as const;

/** Exact money: integer minor units + ISO currency (never a float). */
export interface MoneyValue { minor: number; currency: string }

export interface Product {
  id: string;
  workspaceId: string;
  name: string;
  sku?: string;
  barcodes: ProductBarcode[];
  categoryId?: string;
  supplierId?: string;
  trackingUnit: TrackingUnit;
  customUnitLabel?: string;
  /** Unknown cost is undefined, never zero. */
  costPerTrackingUnit?: MoneyValue;
  sellingPrice?: MoneyValue;
  defaultLocationId?: string;
  defaultRuleId?: string;
  /** Kind of date usually printed on this product (bought-in flow default). */
  defaultDateKind?: DateKind;
  /** True for a preparation / recipe item (prepared flow). */
  isPrepared?: boolean;
  notes?: string;
  status: 'active' | 'hidden';
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  schemaVersion: 1;
}

export type DateKind = 'use_by' | 'best_before' | 'manufacturer_expiry' | 'internal_cutoff' | 'quality_review' | 'none';
export const DATE_KINDS: readonly DateKind[] = ['use_by', 'best_before', 'manufacturer_expiry', 'internal_cutoff', 'quality_review', 'none'] as const;

export type DatePrecision = 'date' | 'month' | 'datetime';

/** A deadline value that keeps its precision: a month-only best-before is never shown as a specific day. */
export type DeadlineValue =
  | { precision: 'date'; date: LocalDate }
  | { precision: 'month'; month: LocalMonth }
  | { precision: 'datetime'; at: IsoDateTime };

/** Why a date controls a batch. Shown to the user next to the effective date. */
export type DeadlineReason =
  | 'printed'              // the date printed on the pack
  | 'direct'               // a deadline the user entered directly
  | 'rule'                 // calculated from a saved after-opening / preparation rule
  | 'original_hard'        // the original hard date (e.g. use-by) is earlier than the rule result
  | 'original_quality'     // the original best-before of the unopened pack (kept as a quality date)
  | 'corrected'            // an explicit deadline correction with a recorded reason
  | 'none';                // no date: needs checking

export interface DeadlineInfo {
  dateKind: DateKind;
  deadline?: DeadlineValue;
  reason: DeadlineReason;
}

export type BatchKind = 'bought_in' | 'opened' | 'prepared' | 'other';

export type RuleClass = 'hard_cutoff' | 'quality_review';

export interface AppliedRuleSnapshot {
  ruleId: string;
  ruleVersion: number;
  ruleName: string;
  class: RuleClass;
  durationMinutes?: number;
  sourceText?: string;
  storageInstruction?: string;
}

export interface Batch {
  id: string;
  workspaceId: string;
  productId: string;
  /** Snapshot for history / search when the product changes later. */
  productName: string;
  parentBatchId?: string;
  kind: BatchKind;

  lotNumber?: string;
  receivedAt?: IsoDateTime;
  openedAt?: IsoDateTime;
  preparedAt?: IsoDateTime;

  quantityInitial?: number;
  quantityRemaining?: number;
  quantityUnit?: string;

  /** The batch's own date as entered or printed. */
  dateKind: DateKind;
  datePrecision: DatePrecision;
  printedDate?: LocalDate;
  printedMonth?: LocalMonth;
  exactDeadlineAt?: IsoDateTime;
  timeZone: string;

  /** The date that controls status (may come from a rule or the original pack). */
  effective: DeadlineInfo;
  /** A second date kept visible, e.g. the original best-before of an opened pack. */
  secondary?: DeadlineInfo;

  locationId?: string;
  appliedRule?: AppliedRuleSnapshot;
  sourceBatchIds?: string[];
  notes?: string;
  /** Import transfer id "<fingerprint>:<row>" when the batch came from a file. */
  importRef?: string;

  status: 'active' | 'completed' | 'archived';
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  schemaVersion: 1;
}

export type RuleAppliesTo = 'after_opening' | 'after_preparation' | 'manual_review';

export interface ExpiryRule {
  id: string;
  workspaceId: string;
  name: string;
  appliesTo: RuleAppliesTo;
  class: RuleClass;
  durationMinutes?: number;
  /** Where the rule comes from (manufacturer packaging, supplier specification, your procedure). Required. */
  sourceText: string;
  storageInstruction?: string;
  status: 'active' | 'hidden';
  /** Incremented on every edit; batches keep the version they used. */
  version: number;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export type LocationKind = 'shelf' | 'fridge' | 'freezer' | 'cupboard' | 'prep' | 'display' | 'other';
export const LOCATION_KINDS: readonly LocationKind[] = ['shelf', 'fridge', 'freezer', 'cupboard', 'prep', 'display', 'other'] as const;

export interface StorageLocation {
  id: string;
  workspaceId: string;
  name: string;
  kind: LocationKind;
  notes?: string;
  status: 'active' | 'hidden';
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface BusinessListItem {
  id: string;
  workspaceId: string;
  kind: 'category' | 'supplier';
  name: string;
  status: 'active' | 'hidden';
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export type BatchEventType =
  | 'created' | 'opened' | 'prepared' | 'moved' | 'used' | 'sold' | 'wasted' | 'returned'
  | 'quantity_corrected' | 'deadline_corrected' | 'rule_applied' | 'label_printed' | 'archived' | 'restored'
  /** Date-check round "checked, no action" — never changes a deadline. */
  | 'checked';

export type WasteReason = 'past_deadline' | 'quality' | 'damaged' | 'storage_failure' | 'other';
export const WASTE_REASONS: readonly WasteReason[] = ['past_deadline', 'quality', 'damaged', 'storage_failure', 'other'] as const;

export interface BatchEvent {
  id: string;
  workspaceId: string;
  batchId: string;
  type: BatchEventType;
  at: IsoDateTime;
  quantity?: number;
  reason?: string;
  note?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  /** Wasted events: cost of one counted unit at the time of recording (EXP-REV-10). Absent = unknown. */
  unitCost?: MoneyValue;
}

export interface ImportRecord {
  id: string;
  workspaceId: string;
  kind: 'products' | 'batches';
  fileName: string;
  /** SHA-256 of the normalised file content + kind + workspace id: the same file is never imported twice. */
  fingerprint: string;
  createdCount: number;
  skippedCount: number;
  updatedCount?: number;
  errorCount?: number;
  newProductCount?: number;
  newLocationCount?: number;
  requestId?: string;
  at: IsoDateTime;
}

export interface StatusSettings {
  /** Hard dates within this many days are "soon"; quality dates "quality soon". */
  soonDays: number;
  /** An exact-time deadline within this many hours (or a date-only deadline tomorrow) is "urgent". */
  urgentHours: number;
}

export const DEFAULT_STATUS_SETTINGS: StatusSettings = { soonDays: 3, urgentHours: 24 };
