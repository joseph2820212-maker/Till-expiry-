/**
 * Pure logic behind the Add screens (E14–E19): form → store input mapping and validation, the GS1 suggestion, the
 * reminder preview and the double-tap guard. Screens only render; they never calculate a deadline themselves — every
 * deadline comes from domain/expiry (openedDeadline / preparedDeadline / boughtInDeadline).
 */
import type {
  Batch, DateKind, DeadlineInfo, DeadlineValue, ExpiryRule, MoneyValue, Product, TrackingUnit, WorkspaceMode,
} from '../../domain/expiry/expiryTypes';
import { TRACKING_UNITS } from '../../domain/expiry/expiryTypes';
import { allowsMonth, validateDeadline } from '../../domain/expiry/expiryValidation';
import { addDays, deadlineDate, deadlineInstant, isLocalDate, isTime, localDateOf, localTimeOf, todayIn, zonedIso } from '../../domain/expiry/datePrecision';
import { boughtInDeadline, openedDeadline, preparedDeadline, type DerivedDeadline } from '../../domain/expiry/deadlineEngine';
import { snapshotRule } from '../../domain/expiry/ruleEngine';
import { parseQuantity } from '../../domain/quantity/quantity';
import { parseTypedPrice } from '../../domain/typedPrice';
import { normalizeArabicNumerals } from '../../utils/locale';
import type { DatedInput, OpenInput, PrepareInput } from '../batches/batchStore';
import type { ProductDraft } from '../products/productStore';
import type { ReminderSettings } from '../settings/settingsStore';
import type { Gs1Result } from './gs1';

export type FormErrors = Partial<Record<string, string>>;
export type FormResult<T> = { ok: true; input: T } | { ok: false; errors: FormErrors };

// ─── Add choice order (E14) ───────────────────────────────────────────────────

export type AddChoice = 'scan' | 'bought_in' | 'opened' | 'prepared' | 'other';

/** Same five choices in every mode; the mode only changes order and which one is emphasised. */
export function choiceOrder(mode: WorkspaceMode | undefined): AddChoice[] {
  switch (mode) {
    case 'retail': return ['scan', 'bought_in', 'opened', 'other', 'prepared'];
    case 'food_prep': return ['prepared', 'opened', 'scan', 'bought_in', 'other'];
    case 'home_other': return ['scan', 'other', 'bought_in', 'opened', 'prepared'];
    default: return ['scan', 'bought_in', 'prepared', 'opened', 'other'];
  }
}

// ─── double-tap guard ──────────────────────────────────────────────────────────

export interface SaveGuard {
  /** Runs `fn` unless a save is already in flight; the same requestId is reused until a save succeeds. */
  run<R>(fn: (requestId: string) => Promise<R>): Promise<R | undefined>;
  readonly busy: boolean;
  readonly requestId: string;
}

export function createSaveGuard(makeId: () => string): SaveGuard {
  let inFlight = false;
  let requestId = makeId();
  return {
    async run<R>(fn: (requestId: string) => Promise<R>): Promise<R | undefined> {
      if (inFlight) return undefined;
      inFlight = true;
      try {
        const r = await fn(requestId);
        requestId = makeId();
        return r;
      } finally {
        inFlight = false;
      }
    },
    get busy() { return inFlight; },
    get requestId() { return requestId; },
  };
}

// ─── small parsers ─────────────────────────────────────────────────────────────

/** Optional quantity: '' → undefined; otherwise a valid positive quantity or an error. */
export function optionalQuantity(text: string): { ok: true; value?: number } | { ok: false } {
  const s = normalizeArabicNumerals(String(text ?? '')).trim();
  if (!s) return { ok: true };
  const n = parseQuantity(s);
  return n == null ? { ok: false } : { ok: true, value: n };
}

/** Optional exact money: '' → undefined; never a float, never a default currency. */
export function optionalMoney(text: string, currency: string): { ok: true; value?: MoneyValue } | { ok: false; error: string } {
  if (!String(text ?? '').trim()) return { ok: true };
  const r = parseTypedPrice(text, currency);
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, value: { minor: r.money.minor, currency: r.money.currency } };
}

/** The quantity unit stored on a batch: the unit code (the display translates it), the custom label, or none for "each". */
export function quantityUnitFor(unit: TrackingUnit | undefined, customLabel?: string): string | undefined {
  if (!unit || unit === 'each') return undefined;
  if (unit === 'custom') return customLabel?.trim() || undefined;
  return TRACKING_UNITS.includes(unit) ? unit : undefined;
}

/** "Now" in the workspace zone, as the date and time fields of a form. */
export function nowFields(tz: string, now: number = Date.now()): { date: string; time: string } {
  return { date: localDateOf(now, tz), time: localTimeOf(now, tz) };
}

/** Date + HH:MM in the workspace zone → an offset-aware instant, or null. */
export function instantFromFields(date: string, time: string, tz: string): string | null {
  const tm = normalizeArabicNumerals(String(time ?? '')).trim();
  if (!isLocalDate(date) || !isTime(tm)) return null;
  try { return zonedIso(date, tm, tz); } catch { return null; }
}

// ─── GS1 suggestion ───────────────────────────────────────────────────────────

export interface Gs1Suggestion {
  dateKind?: DateKind;
  deadline?: DeadlineValue;
  lot?: string;
  /** Which AI the date came from (shown to the user). */
  source?: '15' | '17';
  /** The other date also present in the code, shown for information only. */
  otherBestBefore?: DeadlineValue;
}

/**
 * What the form prefills from GS1 data. It is a suggestion: the user still confirms the date and its kind.
 * AI 17 is an expiration date: in a food workspace it is suggested as a use-by (a day-precision date only — use-by
 * never takes a month), otherwise as a manufacturer expiry. AI 15 is a best-before.
 */
export function gs1Suggestion(r: Gs1Result | null | undefined, mode: WorkspaceMode | undefined): Gs1Suggestion {
  if (!r) return {};
  const out: Gs1Suggestion = { lot: r.lot };
  if (r.expiry) {
    const food = mode !== 'home_other';
    out.dateKind = food && r.expiry.precision === 'date' ? 'use_by' : 'manufacturer_expiry';
    out.deadline = r.expiry;
    out.source = '17';
    if (r.bestBefore) out.otherBestBefore = r.bestBefore;
  } else if (r.bestBefore) {
    out.dateKind = 'best_before';
    out.deadline = r.bestBefore;
    out.source = '15';
  }
  return out;
}

// ─── bought in / other dated (E16 / E19) ─────────────────────────────────────

export interface DatedForm {
  kind: 'bought_in' | 'other';
  productId?: string;
  /** New product created inline (when no productId). */
  newName: string;
  newBarcode?: string;
  newSymbology?: string;
  dateKind?: DateKind;
  deadline?: DeadlineValue;
  quantityText: string;
  unit?: TrackingUnit;
  customUnit?: string;
  lot: string;
  locationId?: string;
  costText: string;
  priceText: string;
  notes: string;
  /** Set when the date was prefilled from a GS1 code; the user must tick "I checked the pack" before saving. */
  gs1Prefilled?: boolean;
  gs1Confirmed?: boolean;
}

export interface DatedContext {
  workspaceId: string;
  /** '' when the workspace has no currency: money fields are then not offered and ignored. */
  currency: string;
  product?: Product | null;
  requestId?: string;
}

export interface DatedPlan {
  input: DatedInput;
  /** Cost / price change for an existing product (saved on the product, not the batch). */
  productUpdate?: { id: string; draft: ProductDraft };
}

function productDraftFromExisting(p: Product): ProductDraft {
  return {
    name: p.name, sku: p.sku, barcodes: p.barcodes.map(b => ({ code: b.code, symbology: b.symbology, role: b.role, unitCount: b.unitCount })),
    categoryId: p.categoryId, supplierId: p.supplierId, trackingUnit: p.trackingUnit, customUnitLabel: p.customUnitLabel,
    costPerTrackingUnit: p.costPerTrackingUnit, sellingPrice: p.sellingPrice, defaultLocationId: p.defaultLocationId,
    defaultRuleId: p.defaultRuleId, defaultDateKind: p.defaultDateKind, isPrepared: p.isPrepared, notes: p.notes,
  };
}

export { productDraftFromExisting };

const sameMoney = (a?: MoneyValue, b?: MoneyValue) => (a?.minor ?? null) === (b?.minor ?? null) && (a?.currency ?? null) === (b?.currency ?? null);

export function buildDatedPlan(f: DatedForm, ctx: DatedContext): FormResult<DatedPlan> {
  const errors: FormErrors = {};
  const name = f.newName.trim();
  if (!f.productId && !name) errors.product = 'productRequired';
  if (!f.dateKind) errors.dateKind = 'dateKindRequired';
  else {
    const err = validateDeadline(f.dateKind, f.dateKind === 'none' ? undefined : f.deadline);
    if (err) errors.deadline = err;
  }
  if (f.gs1Prefilled && !f.gs1Confirmed && f.dateKind !== 'none') errors.gs1 = 'gs1Confirm';
  const q = optionalQuantity(f.quantityText);
  if (!q.ok) errors.quantity = 'badQuantity';
  if (f.unit === 'custom' && !f.customUnit?.trim()) errors.unit = 'customUnitRequired';
  let cost: MoneyValue | undefined;
  let price: MoneyValue | undefined;
  if (ctx.currency) {
    const c = optionalMoney(f.costText, ctx.currency);
    if (!c.ok) errors.cost = `money_${c.error}`; else cost = c.value;
    const p = optionalMoney(f.priceText, ctx.currency);
    if (!p.ok) errors.price = `money_${p.error}`; else price = p.value;
  }
  if (Object.keys(errors).length) return { ok: false, errors };

  const dateKind = f.dateKind as DateKind;
  const input: DatedInput = {
    workspaceId: ctx.workspaceId,
    kind: f.kind,
    dateKind,
    deadline: dateKind === 'none' ? undefined : f.deadline,
    quantity: q.ok ? q.value : undefined,
    quantityUnit: quantityUnitFor(f.unit, f.customUnit),
    lotNumber: f.lot.trim() || undefined,
    locationId: f.locationId || undefined,
    notes: f.notes.trim() || undefined,
    requestId: ctx.requestId,
  };
  let productUpdate: DatedPlan['productUpdate'];
  if (f.productId) {
    input.productId = f.productId;
    const p = ctx.product;
    if (p && ctx.currency && (!sameMoney(cost, p.costPerTrackingUnit) || !sameMoney(price, p.sellingPrice))) {
      // Only change what was typed; an emptied field clears the value (unknown stays unknown, never 0).
      productUpdate = { id: p.id, draft: { ...productDraftFromExisting(p), costPerTrackingUnit: cost, sellingPrice: price } };
    }
  } else {
    input.newProduct = {
      name,
      barcodes: f.newBarcode?.trim() ? [{ code: f.newBarcode.trim(), symbology: f.newSymbology }] : [],
      trackingUnit: f.unit ?? 'each',
      customUnitLabel: f.unit === 'custom' ? f.customUnit?.trim() : undefined,
      defaultDateKind: dateKind === 'none' ? undefined : dateKind,
      defaultLocationId: f.locationId || undefined,
      costPerTrackingUnit: cost,
      sellingPrice: price,
    };
  }
  for (const k of Object.keys(input) as (keyof DatedInput)[]) if (input[k] === undefined) delete input[k];
  return { ok: true, input: { input, productUpdate } };
}

/** Date kinds offered in each flow (the bought-in list follows §12.1; "other" is expiry or review date). */
export const BOUGHT_IN_KINDS: readonly DateKind[] = ['use_by', 'best_before', 'manufacturer_expiry', 'quality_review', 'none'];
export const OTHER_KINDS: readonly DateKind[] = ['manufacturer_expiry', 'quality_review', 'none'];

/** The deadline shown in the bought-in preview. */
export function datedPreview(kind: DateKind | undefined, d: DeadlineValue | undefined): DeadlineInfo {
  if (!kind) return { dateKind: 'none', reason: 'none' };
  if (validateDeadline(kind, kind === 'none' ? undefined : d)) return { dateKind: 'none', reason: 'none' };
  return boughtInDeadline(kind, d);
}

export { allowsMonth };

// ─── opened (E17) ─────────────────────────────────────────────────────────────

export type DeadlineSource = 'rule' | 'direct' | 'original';

export interface OpenedForm {
  parentBatchId?: string;
  productId?: string;
  amountText: string;
  openedDate: string;
  openedTime: string;
  source: DeadlineSource;
  ruleId?: string;
  directKind: DateKind;
  directDeadline?: DeadlineValue;
  locationId?: string;
  notes: string;
}

export interface OpenedContext {
  workspaceId: string;
  tz: string;
  parent?: Batch | null;
  rule?: ExpiryRule | null;
  requestId?: string;
}

export const OPENED_DIRECT_KINDS: readonly DateKind[] = ['internal_cutoff', 'use_by', 'quality_review'];
export const PREPARED_DIRECT_KINDS: readonly DateKind[] = ['internal_cutoff', 'quality_review'];

function directCheck(source: DeadlineSource, kind: DateKind, d: DeadlineValue | undefined, rule: ExpiryRule | null | undefined, ruleId: string | undefined, errors: FormErrors) {
  if (source === 'rule') {
    if (!ruleId || !rule) errors.rule = 'ruleRequired';
  } else if (source === 'direct') {
    const err = validateDeadline(kind, d);
    if (kind === 'none') errors.deadline = 'dateRequired';
    else if (err) errors.deadline = err;
  }
}

export function buildOpenInput(f: OpenedForm, ctx: OpenedContext): FormResult<OpenInput> {
  const errors: FormErrors = {};
  if (!f.parentBatchId && !f.productId) errors.product = 'productRequired';
  const q = optionalQuantity(f.amountText);
  if (!q.ok) errors.amount = 'badQuantity';
  else if (ctx.parent && ctx.parent.quantityRemaining !== undefined) {
    if (q.value === undefined) errors.amount = 'amountRequired';
    else if (q.value > ctx.parent.quantityRemaining) errors.amount = 'amountTooHigh';
  }
  const openedAt = instantFromFields(f.openedDate, f.openedTime, ctx.tz);
  if (!openedAt) errors.openedAt = 'badTime';
  directCheck(f.source, f.directKind, f.directDeadline, ctx.rule, f.ruleId, errors);
  if (Object.keys(errors).length) return { ok: false, errors };
  const input: OpenInput = {
    workspaceId: ctx.workspaceId,
    openedAt: openedAt as string,
    quantity: q.ok ? q.value : undefined,
    parentBatchId: f.parentBatchId || undefined,
    productId: f.parentBatchId ? undefined : f.productId,
    ruleId: f.source === 'rule' ? f.ruleId : undefined,
    direct: f.source === 'direct' && f.directDeadline ? { kind: f.directKind, deadline: f.directDeadline } : undefined,
    locationId: f.locationId || undefined,
    notes: f.notes.trim() || undefined,
    requestId: ctx.requestId,
  };
  for (const k of Object.keys(input) as (keyof OpenInput)[]) if (input[k] === undefined) delete input[k];
  return { ok: true, input };
}

/** Preview of an opened batch, from the same engine the store uses. Null while the form is incomplete. */
export function openPreview(f: Pick<OpenedForm, 'openedDate' | 'openedTime' | 'source' | 'directKind' | 'directDeadline'>, ctx: Pick<OpenedContext, 'tz' | 'parent' | 'rule'>): DerivedDeadline | null {
  const openedAt = instantFromFields(f.openedDate, f.openedTime, ctx.tz);
  if (!openedAt) return null;
  const rule = f.source === 'rule' && ctx.rule ? snapshotRule(ctx.rule) : undefined;
  const direct = f.source === 'direct' && f.directDeadline && !validateDeadline(f.directKind, f.directDeadline) && f.directKind !== 'none'
    ? { kind: f.directKind, deadline: f.directDeadline } : undefined;
  if (f.source === 'rule' && !rule) return null;
  if (f.source === 'direct' && !direct) return null;
  return openedDeadline({ parent: ctx.parent ?? undefined, openedAt, rule, direct, tz: ctx.tz });
}

// ─── prepared (E18) ───────────────────────────────────────────────────────────

export interface PreparedForm {
  productId?: string;
  newName: string;
  preparedDate: string;
  preparedTime: string;
  quantityText: string;
  unit?: TrackingUnit;
  customUnit?: string;
  locationId?: string;
  source: Exclude<DeadlineSource, 'original'>;
  ruleId?: string;
  directKind: DateKind;
  directDeadline?: DeadlineValue;
  sourceBatchIds: string[];
  lot: string;
  notes: string;
}

export interface PreparedContext { workspaceId: string; tz: string; rule?: ExpiryRule | null; requestId?: string }

export function buildPrepareInput(f: PreparedForm, ctx: PreparedContext): FormResult<PrepareInput> {
  const errors: FormErrors = {};
  const name = f.newName.trim();
  if (!f.productId && !name) errors.product = 'productRequired';
  const q = optionalQuantity(f.quantityText);
  if (!q.ok) errors.quantity = 'badQuantity';
  if (f.unit === 'custom' && !f.customUnit?.trim()) errors.unit = 'customUnitRequired';
  const preparedAt = instantFromFields(f.preparedDate, f.preparedTime, ctx.tz);
  if (!preparedAt) errors.preparedAt = 'badTime';
  directCheck(f.source, f.directKind, f.directDeadline, ctx.rule, f.ruleId, errors);
  if (Object.keys(errors).length) return { ok: false, errors };
  const input: PrepareInput = {
    workspaceId: ctx.workspaceId,
    preparedAt: preparedAt as string,
    productId: f.productId || undefined,
    newProduct: f.productId ? undefined : { name, isPrepared: true, trackingUnit: f.unit ?? 'each', customUnitLabel: f.unit === 'custom' ? f.customUnit?.trim() : undefined, defaultLocationId: f.locationId || undefined, defaultRuleId: f.source === 'rule' ? f.ruleId : undefined },
    quantity: q.ok ? q.value : undefined,
    quantityUnit: quantityUnitFor(f.unit, f.customUnit),
    locationId: f.locationId || undefined,
    ruleId: f.source === 'rule' ? f.ruleId : undefined,
    direct: f.source === 'direct' && f.directDeadline ? { kind: f.directKind, deadline: f.directDeadline } : undefined,
    sourceBatchIds: f.sourceBatchIds.length ? [...new Set(f.sourceBatchIds)] : undefined,
    lotNumber: f.lot.trim() || undefined,
    notes: f.notes.trim() || undefined,
    requestId: ctx.requestId,
  };
  for (const k of Object.keys(input) as (keyof PrepareInput)[]) if (input[k] === undefined) delete input[k];
  return { ok: true, input };
}

export function preparePreview(f: Pick<PreparedForm, 'preparedDate' | 'preparedTime' | 'source' | 'directKind' | 'directDeadline'>, ctx: Pick<PreparedContext, 'tz' | 'rule'>): DerivedDeadline | null {
  const preparedAt = instantFromFields(f.preparedDate, f.preparedTime, ctx.tz);
  if (!preparedAt) return null;
  if (f.source === 'rule') {
    if (!ctx.rule) return null;
    return preparedDeadline({ preparedAt, rule: snapshotRule(ctx.rule), tz: ctx.tz });
  }
  if (!f.directDeadline || f.directKind === 'none' || validateDeadline(f.directKind, f.directDeadline)) return null;
  return preparedDeadline({ preparedAt, direct: { kind: f.directKind, deadline: f.directDeadline }, tz: ctx.tz });
}

// ─── reminder preview ─────────────────────────────────────────────────────────

export type ReminderLine =
  | { kind: 'none' }                              // no date: listed under Needs checking, no date reminder
  | { kind: 'past' }                              // the date has already passed
  | { kind: 'advance'; date: string; days: number }
  | { kind: 'sameDay'; date: string }
  | { kind: 'exact'; at: number; minutes: number }
  | { kind: 'off' }                               // every per-date reminder is switched off in settings
  | { kind: 'summary'; hour: number; minute: number };

/**
 * Which reminders the current reminder settings would give for a deadline — plain facts for a one-line preview.
 * Reminder lead times are settings, never shelf-life rules; the deadline itself is not changed.
 */
export function reminderPreview(info: DeadlineInfo, tz: string, settings: ReminderSettings, now: number = Date.now()): ReminderLine[] {
  const out: ReminderLine[] = [];
  if (info.dateKind === 'none' || !info.deadline) {
    out.push({ kind: 'none' });
  } else if (deadlineInstant(info.deadline, tz) <= now) {
    out.push({ kind: 'past' });
  } else if (info.deadline.precision === 'datetime') {
    const at = Date.parse(info.deadline.at) - settings.exactTime.leadMinutes * 60000;
    if (settings.exactTime.enabled && at > now) out.push({ kind: 'exact', at, minutes: settings.exactTime.leadMinutes });
    else if (settings.sameDay) out.push({ kind: 'sameDay', date: deadlineDate(info.deadline, tz) });
  } else {
    const day = deadlineDate(info.deadline, tz);
    const today = todayIn(tz, now);
    if (settings.advanceDays > 0) {
      const d = addDays(day, -settings.advanceDays);
      if (d >= today) out.push({ kind: 'advance', date: d, days: settings.advanceDays });
    }
    if (settings.sameDay) out.push({ kind: 'sameDay', date: day });
  }
  if (!out.length) out.push({ kind: 'off' });
  if (settings.dailySummary.enabled) out.push({ kind: 'summary', hour: settings.dailySummary.hour, minute: settings.dailySummary.minute });
  return out;
}

/** Which of an opened batch's dates controls, for the preview: 'rule' / 'direct' result or the original pack date. */
export function controllingLabelKey(d: DerivedDeadline): string {
  return `add.controls.${d.effective.reason}`;
}
