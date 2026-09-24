/**
 * Dated batches and their history (§7.4, §7.7, §8, §9).
 *
 * - Every mutation runs in one journaled transaction and appends at least one BatchEvent; history is append-only and
 *   corrections are new events with before / after / reason (T23, T25).
 * - Every mutation accepts a `requestId`. It becomes the id of the first event written; repeating the same request
 *   (a double tap, a retried save) returns the first result and writes nothing (T15).
 * - Quantities never go below zero (T22). Opening part of a batch creates a child "opened" batch and reduces only the
 *   amount opened from the parent (T11). Nothing ever expires into "wasted" automatically (T24).
 * - Deadlines come only from domain/expiry (T13, T14, T17–T20). Moving, checking and label printing never change them.
 */
import type {
  AppliedRuleSnapshot, Batch, BatchEvent, BatchEventType, DateKind, DeadlineValue, ExpiryRule, IsoDateTime, Product, Workspace,
} from '../../domain/expiry/expiryTypes';
import { boughtInDeadline, deadlineFields, openedDeadline, preparedDeadline } from '../../domain/expiry/deadlineEngine';
import { isOffsetIso } from '../../domain/expiry/datePrecision';
import { validateDeadline } from '../../domain/expiry/expiryValidation';
import { snapshotRule } from '../../domain/expiry/ruleEngine';
import { isValidQuantity, subtractQuantity } from '../../domain/quantity/quantity';
import { K } from '../../storage/keys';
import { listRecords, newId, nowIso, readRecord, runTxn, type Txn } from '../../storage/entityStore';
import { DomainError, mustGet, optText, putRecord } from '../../storage/repoHelpers';
import { notifyDataChanged } from '../../storage/changeBus';
import { createProductTx, type ProductDraft } from '../products/productStore';

export const BATCH_LIMITS = { lot: 40, notes: 300, reason: 200 } as const;

// ─── helpers ───────────────────────────────────────────────────────────────────

async function workspaceTx(tx: Txn, id: string): Promise<Workspace> {
  const w = await tx.get<Workspace>(K.workspace(id));
  if (!w) throw new DomainError('noWorkspace');
  return w;
}

async function appendEvent(tx: Txn, ev: Omit<BatchEvent, 'id' | 'at'> & { id?: string; at?: IsoDateTime }): Promise<BatchEvent> {
  const e: BatchEvent = { ...ev, id: ev.id ?? newId('ev'), at: ev.at ?? nowIso() } as BatchEvent;
  for (const k of Object.keys(e) as (keyof BatchEvent)[]) if (e[k] === undefined) delete e[k];
  tx.set(K.item('events', e.id), e);
  await tx.addToIndex(K.index('events', e.workspaceId), e.id);
  await tx.addToIndex(K.batchEvents(e.batchId), e.id);
  return e;
}

/** Idempotency: if an event with this request id exists, return it. */
async function priorRequest(tx: Txn, requestId: string | undefined): Promise<BatchEvent | null> {
  if (!requestId) return null;
  return tx.get<BatchEvent>(K.item('events', requestId));
}

function checkQuantity(q: number | undefined, code = 'badQuantity'): void {
  if (q !== undefined && !isValidQuantity(q)) throw new DomainError(code);
}

async function productFor(tx: Txn, workspaceId: string, productId?: string, newProduct?: ProductDraft): Promise<Product> {
  if (productId) {
    const p = await mustGet<Product>(tx, 'products', productId, workspaceId, 'productNotFound');
    if (p.status !== 'active') throw new DomainError('productHidden');
    return p;
  }
  if (newProduct) return createProductTx(tx, workspaceId, newProduct);
  throw new DomainError('productRequired');
}

async function locationCheck(tx: Txn, workspaceId: string, locationId?: string): Promise<void> {
  if (locationId) await mustGet(tx, 'locations', locationId, workspaceId, 'locationNotFound');
}

async function ruleSnapshotTx(tx: Txn, workspaceId: string, ruleId: string | undefined, appliesTo: ExpiryRule['appliesTo']): Promise<AppliedRuleSnapshot | undefined> {
  if (!ruleId) return undefined;
  const r = await mustGet<ExpiryRule>(tx, 'rules', ruleId, workspaceId, 'ruleNotFound');
  if (r.status !== 'active') throw new DomainError('ruleHidden');
  if (r.appliesTo !== appliesTo) throw new DomainError('ruleWrongKind');
  return snapshotRule(r);
}

function checkDirect(direct?: { kind: DateKind; deadline: DeadlineValue }): void {
  if (!direct) return;
  const err = validateDeadline(direct.kind, direct.deadline);
  if (err) throw new DomainError(`deadline_${err}`);
  if (direct.kind === 'none') throw new DomainError('deadline_dateRequired');
}

function checkInstant(at: IsoDateTime | undefined, code: string): void {
  if (at !== undefined && !isOffsetIso(at)) throw new DomainError(code);
}

function clean<T extends object>(o: T): T {
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] === undefined) delete o[k];
  return o;
}

async function commit<R>(fn: (tx: Txn) => Promise<R>): Promise<R> {
  const r = await runTxn(fn);
  notifyDataChanged();
  return r;
}

// ─── create: bought in / other dated item ────────────────────────────────────

export interface DatedInput {
  workspaceId: string;
  kind: 'bought_in' | 'other';
  productId?: string;
  newProduct?: ProductDraft;
  lotNumber?: string;
  quantity?: number;
  quantityUnit?: string;
  dateKind: DateKind;
  deadline?: DeadlineValue;
  locationId?: string;
  receivedAt?: IsoDateTime;
  notes?: string;
  importRef?: string;
  requestId?: string;
}

export async function createDatedBatchTx(tx: Txn, input: DatedInput): Promise<Batch> {
  const err = validateDeadline(input.dateKind, input.deadline);
  if (err) throw new DomainError(`deadline_${err}`);
  checkQuantity(input.quantity);
  checkInstant(input.receivedAt, 'badTime');
  const ws = await workspaceTx(tx, input.workspaceId);
  const product = await productFor(tx, ws.id, input.productId, input.newProduct);
  await locationCheck(tx, ws.id, input.locationId);
  const now = nowIso();
  const b: Batch = clean({
    id: newId('bat'), workspaceId: ws.id, productId: product.id, productName: product.name, kind: input.kind,
    lotNumber: optText(input.lotNumber, BATCH_LIMITS.lot), receivedAt: input.receivedAt,
    quantityInitial: input.quantity, quantityRemaining: input.quantity, quantityUnit: optText(input.quantityUnit, 20),
    ...deadlineFields(input.dateKind, input.deadline), timeZone: ws.timeZone,
    effective: boughtInDeadline(input.dateKind, input.deadline),
    locationId: input.locationId ?? product.defaultLocationId, notes: optText(input.notes, BATCH_LIMITS.notes), importRef: input.importRef,
    status: 'active', createdAt: now, updatedAt: now, schemaVersion: 1,
  } as Batch);
  await putRecord(tx, 'batches', b);
  await appendEvent(tx, { id: input.requestId, workspaceId: ws.id, batchId: b.id, type: 'created', quantity: input.quantity, after: { batchId: b.id } });
  return b;
}

export async function createDatedBatch(input: DatedInput): Promise<Batch> {
  return commit(async tx => {
    const prior = await priorRequest(tx, input.requestId);
    if (prior) return mustGet<Batch>(tx, 'batches', prior.batchId, input.workspaceId);
    return createDatedBatchTx(tx, input);
  });
}

// ─── open part of a batch ─────────────────────────────────────────────────────

export interface OpenInput {
  workspaceId: string;
  /** Preferred: the unopened batch being opened. */
  parentBatchId?: string;
  /** Without a parent: the product opened (no original pack date is known). */
  productId?: string;
  quantity?: number;
  openedAt: IsoDateTime;
  ruleId?: string;
  direct?: { kind: DateKind; deadline: DeadlineValue };
  locationId?: string;
  notes?: string;
  requestId?: string;
}

export interface OpenResult { child: Batch; parent?: Batch }

export async function openBatch(input: OpenInput): Promise<OpenResult> {
  checkDirect(input.direct);
  checkQuantity(input.quantity);
  if (!isOffsetIso(input.openedAt)) throw new DomainError('badTime');
  return commit(async tx => {
    const prior = await priorRequest(tx, input.requestId);
    if (prior) {
      const childId = (prior.after as { childId?: string } | undefined)?.childId ?? prior.batchId;
      return { child: await mustGet<Batch>(tx, 'batches', childId, input.workspaceId), parent: prior.batchId !== childId ? await tx.get<Batch>(K.item('batches', prior.batchId)) ?? undefined : undefined };
    }
    const ws = await workspaceTx(tx, input.workspaceId);
    let parent: Batch | undefined;
    let product: Product;
    if (input.parentBatchId) {
      parent = await mustGet<Batch>(tx, 'batches', input.parentBatchId, ws.id, 'batchNotFound');
      if (parent.status !== 'active') throw new DomainError('batchNotActive');
      product = await mustGet<Product>(tx, 'products', parent.productId, ws.id, 'productNotFound');
      if (parent.quantityRemaining !== undefined) {
        if (input.quantity === undefined) throw new DomainError('quantityRequired');
        if (input.quantity > parent.quantityRemaining) throw new DomainError('quantityTooHigh');
      }
    } else {
      product = await productFor(tx, ws.id, input.productId);
    }
    await locationCheck(tx, ws.id, input.locationId);
    const rule = await ruleSnapshotTx(tx, ws.id, input.ruleId, 'after_opening');
    const derived = openedDeadline({ parent, openedAt: input.openedAt, rule, direct: input.direct, tz: ws.timeZone });
    const now = nowIso();
    const child: Batch = clean({
      id: newId('bat'), workspaceId: ws.id, productId: product.id, productName: product.name, parentBatchId: parent?.id, kind: 'opened',
      lotNumber: parent?.lotNumber, openedAt: input.openedAt,
      quantityInitial: input.quantity, quantityRemaining: input.quantity, quantityUnit: parent?.quantityUnit,
      ...deadlineFields(derived.own.kind, derived.own.deadline), timeZone: ws.timeZone,
      effective: derived.effective, secondary: derived.secondary,
      locationId: input.locationId ?? parent?.locationId ?? product.defaultLocationId, appliedRule: rule, notes: optText(input.notes, BATCH_LIMITS.notes),
      status: 'active', createdAt: now, updatedAt: now, schemaVersion: 1,
    } as Batch);
    await putRecord(tx, 'batches', child);
    let nextParent: Batch | undefined;
    if (parent) {
      const remaining = parent.quantityRemaining !== undefined && input.quantity !== undefined ? subtractQuantity(parent.quantityRemaining, input.quantity) : parent.quantityRemaining;
      nextParent = { ...parent, quantityRemaining: remaining, status: remaining === 0 ? 'completed' : parent.status, updatedAt: now };
      tx.set(K.item('batches', parent.id), nextParent);
      await appendEvent(tx, { id: input.requestId, workspaceId: ws.id, batchId: parent.id, type: 'opened', quantity: input.quantity, before: { quantityRemaining: parent.quantityRemaining }, after: { quantityRemaining: remaining, childId: child.id } });
      await appendEvent(tx, { workspaceId: ws.id, batchId: child.id, type: 'created', quantity: input.quantity, after: { parentBatchId: parent.id } });
    } else {
      await appendEvent(tx, { id: input.requestId, workspaceId: ws.id, batchId: child.id, type: 'created', quantity: input.quantity, after: { childId: child.id } });
    }
    if (rule) await appendEvent(tx, { workspaceId: ws.id, batchId: child.id, type: 'rule_applied', after: { ruleId: rule.ruleId, ruleVersion: rule.ruleVersion } });
    return { child, parent: nextParent };
  });
}

// ─── prepare ─────────────────────────────────────────────────────────────────

export interface PrepareInput {
  workspaceId: string;
  productId?: string;
  newProduct?: ProductDraft;
  preparedAt: IsoDateTime;
  quantity?: number;
  quantityUnit?: string;
  locationId?: string;
  ruleId?: string;
  direct?: { kind: DateKind; deadline: DeadlineValue };
  sourceBatchIds?: string[];
  lotNumber?: string;
  notes?: string;
  requestId?: string;
}

export async function prepareBatch(input: PrepareInput): Promise<Batch> {
  checkDirect(input.direct);
  checkQuantity(input.quantity);
  if (!isOffsetIso(input.preparedAt)) throw new DomainError('badTime');
  return commit(async tx => {
    const prior = await priorRequest(tx, input.requestId);
    if (prior) return mustGet<Batch>(tx, 'batches', prior.batchId, input.workspaceId);
    const ws = await workspaceTx(tx, input.workspaceId);
    const product = await productFor(tx, ws.id, input.productId, input.newProduct ? { ...input.newProduct, isPrepared: true } : undefined);
    await locationCheck(tx, ws.id, input.locationId);
    for (const sid of input.sourceBatchIds ?? []) await mustGet(tx, 'batches', sid, ws.id, 'batchNotFound');
    const rule = await ruleSnapshotTx(tx, ws.id, input.ruleId, 'after_preparation');
    const derived = preparedDeadline({ preparedAt: input.preparedAt, rule, direct: input.direct, tz: ws.timeZone });
    const now = nowIso();
    const b: Batch = clean({
      id: newId('bat'), workspaceId: ws.id, productId: product.id, productName: product.name, kind: 'prepared',
      lotNumber: optText(input.lotNumber, BATCH_LIMITS.lot), preparedAt: input.preparedAt,
      quantityInitial: input.quantity, quantityRemaining: input.quantity, quantityUnit: optText(input.quantityUnit, 20),
      ...deadlineFields(derived.own.kind, derived.own.deadline), timeZone: ws.timeZone,
      effective: derived.effective, locationId: input.locationId ?? product.defaultLocationId, appliedRule: rule,
      sourceBatchIds: input.sourceBatchIds?.length ? [...new Set(input.sourceBatchIds)] : undefined, notes: optText(input.notes, BATCH_LIMITS.notes),
      status: 'active', createdAt: now, updatedAt: now, schemaVersion: 1,
    } as Batch);
    await putRecord(tx, 'batches', b);
    await appendEvent(tx, { id: input.requestId, workspaceId: ws.id, batchId: b.id, type: 'prepared', quantity: input.quantity, at: now });
    if (rule) await appendEvent(tx, { workspaceId: ws.id, batchId: b.id, type: 'rule_applied', after: { ruleId: rule.ruleId, ruleVersion: rule.ruleVersion } });
    return b;
  });
}

// ─── actions ─────────────────────────────────────────────────────────────────

export type RemovalType = 'used' | 'sold' | 'wasted' | 'returned';
export const REMOVAL_TYPES: readonly RemovalType[] = ['used', 'sold', 'wasted', 'returned'] as const;

export interface ActionInput { quantity?: number; reason?: string; note?: string; requestId?: string }

/**
 * Used / sold / wasted / returned. With a counted batch, no quantity means "all that is left" and the batch completes
 * when nothing remains; with an uncounted batch, no quantity closes it.
 */
export async function recordRemoval(workspaceId: string, batchId: string, type: RemovalType, input: ActionInput = {}): Promise<Batch> {
  if (!REMOVAL_TYPES.includes(type)) throw new DomainError('badAction');
  checkQuantity(input.quantity);
  if (type === 'wasted' && !input.reason) throw new DomainError('reasonRequired');
  return commit(async tx => {
    const prior = await priorRequest(tx, input.requestId);
    if (prior) return mustGet<Batch>(tx, 'batches', prior.batchId, workspaceId);
    const b = await mustGet<Batch>(tx, 'batches', batchId, workspaceId, 'batchNotFound');
    if (b.status !== 'active') throw new DomainError('batchNotActive');
    let qty = input.quantity;
    let remaining = b.quantityRemaining;
    let complete: boolean;
    if (b.quantityRemaining !== undefined) {
      if (qty === undefined) qty = b.quantityRemaining;
      if (qty > b.quantityRemaining) throw new DomainError('quantityTooHigh');
      remaining = subtractQuantity(b.quantityRemaining, qty);
      complete = remaining === 0;
    } else {
      complete = qty === undefined;
    }
    const now = nowIso();
    const next: Batch = { ...b, quantityRemaining: remaining, status: complete ? 'completed' : 'active', updatedAt: now };
    tx.set(K.item('batches', b.id), next);
    await appendEvent(tx, { id: input.requestId, workspaceId, batchId: b.id, type, quantity: qty, reason: optText(input.reason, BATCH_LIMITS.reason), note: optText(input.note, BATCH_LIMITS.notes), before: { quantityRemaining: b.quantityRemaining }, after: { quantityRemaining: remaining, status: next.status } });
    return next;
  });
}

/** Date-check "checked / no action". Never changes the deadline (T10). */
export async function checkBatch(workspaceId: string, batchId: string, requestId?: string): Promise<BatchEvent> {
  return commit(async tx => {
    const prior = await priorRequest(tx, requestId);
    if (prior) return prior;
    const b = await mustGet<Batch>(tx, 'batches', batchId, workspaceId, 'batchNotFound');
    if (b.status !== 'active') throw new DomainError('batchNotActive');
    return appendEvent(tx, { id: requestId, workspaceId, batchId, type: 'checked' });
  });
}

/** Move to another location. The deadline is kept (T20); a different documented deadline needs an explicit correction. */
export async function moveBatch(workspaceId: string, batchId: string, locationId: string, reason?: string, requestId?: string): Promise<Batch> {
  return commit(async tx => {
    const prior = await priorRequest(tx, requestId);
    if (prior) return mustGet<Batch>(tx, 'batches', prior.batchId, workspaceId);
    const b = await mustGet<Batch>(tx, 'batches', batchId, workspaceId, 'batchNotFound');
    if (b.status !== 'active') throw new DomainError('batchNotActive');
    await locationCheck(tx, workspaceId, locationId);
    const next = { ...b, locationId, updatedAt: nowIso() };
    tx.set(K.item('batches', b.id), next);
    await appendEvent(tx, { id: requestId, workspaceId, batchId, type: 'moved', reason: optText(reason, BATCH_LIMITS.reason), before: { locationId: b.locationId ?? null }, after: { locationId } });
    return next;
  });
}

/** An explicit deadline correction with a recorded reason (T25). The old value stays in history. */
export async function correctDeadline(workspaceId: string, batchId: string, kind: DateKind, deadline: DeadlineValue | undefined, reason: string, requestId?: string): Promise<Batch> {
  const err = validateDeadline(kind, deadline);
  if (err) throw new DomainError(`deadline_${err}`);
  const why = optText(reason, BATCH_LIMITS.reason);
  if (!why) throw new DomainError('reasonRequired');
  return commit(async tx => {
    const prior = await priorRequest(tx, requestId);
    if (prior) return mustGet<Batch>(tx, 'batches', prior.batchId, workspaceId);
    const b = await mustGet<Batch>(tx, 'batches', batchId, workspaceId, 'batchNotFound');
    if (b.status === 'archived') throw new DomainError('batchNotActive');
    const fields = deadlineFields(kind, deadline);
    const next: Batch = clean({ ...b, printedDate: undefined, printedMonth: undefined, exactDeadlineAt: undefined, ...fields, effective: kind === 'none' || !deadline ? { dateKind: 'none', reason: 'none' } : { dateKind: kind, deadline, reason: 'corrected' }, updatedAt: nowIso() } as Batch);
    tx.set(K.item('batches', b.id), next);
    await appendEvent(tx, { id: requestId, workspaceId, batchId, type: 'deadline_corrected', reason: why, before: { effective: b.effective }, after: { effective: next.effective } });
    return next;
  });
}

/** Correct what is left (e.g. after a count). Never below zero; recorded with before / after / reason. */
export async function correctQuantity(workspaceId: string, batchId: string, quantityRemaining: number, reason: string, requestId?: string): Promise<Batch> {
  if (!(quantityRemaining === 0 || isValidQuantity(quantityRemaining))) throw new DomainError('badQuantity');
  const why = optText(reason, BATCH_LIMITS.reason);
  if (!why) throw new DomainError('reasonRequired');
  return commit(async tx => {
    const prior = await priorRequest(tx, requestId);
    if (prior) return mustGet<Batch>(tx, 'batches', prior.batchId, workspaceId);
    const b = await mustGet<Batch>(tx, 'batches', batchId, workspaceId, 'batchNotFound');
    if (b.status === 'archived') throw new DomainError('batchNotActive');
    const next: Batch = { ...b, quantityRemaining, quantityInitial: b.quantityInitial ?? quantityRemaining, status: quantityRemaining === 0 ? 'completed' : 'active', updatedAt: nowIso() };
    tx.set(K.item('batches', b.id), next);
    await appendEvent(tx, { id: requestId, workspaceId, batchId, type: 'quantity_corrected', quantity: quantityRemaining, reason: why, before: { quantityRemaining: b.quantityRemaining ?? null, status: b.status }, after: { quantityRemaining, status: next.status } });
    return next;
  });
}

/** Apply an approved rule to an existing opened / prepared batch, from its opened / prepared time. */
export async function applyRule(workspaceId: string, batchId: string, ruleId: string, reason: string, requestId?: string): Promise<Batch> {
  const why = optText(reason, BATCH_LIMITS.reason);
  if (!why) throw new DomainError('reasonRequired');
  return commit(async tx => {
    const prior = await priorRequest(tx, requestId);
    if (prior) return mustGet<Batch>(tx, 'batches', prior.batchId, workspaceId);
    const b = await mustGet<Batch>(tx, 'batches', batchId, workspaceId, 'batchNotFound');
    if (b.status !== 'active') throw new DomainError('batchNotActive');
    if (b.kind !== 'opened' && b.kind !== 'prepared') throw new DomainError('ruleWrongKind');
    const rule = await ruleSnapshotTx(tx, workspaceId, ruleId, b.kind === 'opened' ? 'after_opening' : 'after_preparation');
    const parent = b.parentBatchId ? await tx.get<Batch>(K.item('batches', b.parentBatchId)) ?? undefined : undefined;
    const derived = b.kind === 'opened'
      ? openedDeadline({ parent, openedAt: b.openedAt as string, rule, tz: b.timeZone })
      : preparedDeadline({ preparedAt: b.preparedAt as string, rule, tz: b.timeZone });
    const next: Batch = clean({ ...b, printedDate: undefined, printedMonth: undefined, exactDeadlineAt: undefined, ...deadlineFields(derived.own.kind, derived.own.deadline), effective: derived.effective, secondary: derived.secondary, appliedRule: rule, updatedAt: nowIso() } as Batch);
    tx.set(K.item('batches', b.id), next);
    await appendEvent(tx, { id: requestId, workspaceId, batchId, type: 'rule_applied', reason: why, before: { effective: b.effective, appliedRule: b.appliedRule ?? null }, after: { effective: next.effective, ruleId: rule?.ruleId, ruleVersion: rule?.ruleVersion } });
    return next;
  });
}

export async function markLabelPrinted(workspaceId: string, batchId: string): Promise<void> {
  await commit(async tx => {
    await mustGet<Batch>(tx, 'batches', batchId, workspaceId, 'batchNotFound');
    await appendEvent(tx, { workspaceId, batchId, type: 'label_printed' });
  });
}

export async function setBatchArchived(workspaceId: string, batchId: string, archived: boolean, requestId?: string): Promise<Batch> {
  return commit(async tx => {
    const prior = await priorRequest(tx, requestId);
    if (prior) return mustGet<Batch>(tx, 'batches', prior.batchId, workspaceId);
    const b = await mustGet<Batch>(tx, 'batches', batchId, workspaceId, 'batchNotFound');
    const status: Batch['status'] = archived ? 'archived' : (b.quantityRemaining === 0 ? 'completed' : 'active');
    const next = { ...b, status, updatedAt: nowIso() };
    tx.set(K.item('batches', b.id), next);
    await appendEvent(tx, { id: requestId, workspaceId, batchId, type: archived ? 'archived' : 'restored', before: { status: b.status }, after: { status } });
    return next;
  });
}

// ─── reads ─────────────────────────────────────────────────────────────────────

export async function listBatches(workspaceId: string, opts: { status?: Batch['status'] | 'any' } = {}): Promise<Batch[]> {
  const { items } = await listRecords<Batch>('batches', workspaceId);
  const status = opts.status ?? 'active';
  return items.filter(b => b.workspaceId === workspaceId && (status === 'any' || b.status === status));
}

export async function getBatch(workspaceId: string, id: string): Promise<Batch | null> {
  const b = await readRecord<Batch>(K.item('batches', id));
  return b && b.workspaceId === workspaceId ? b : null;
}

export async function listBatchEvents(workspaceId: string, batchId: string): Promise<BatchEvent[]> {
  const ids = (await readRecord<string[]>(K.batchEvents(batchId))) ?? [];
  const out: BatchEvent[] = [];
  for (const id of ids) {
    const e = await readRecord<BatchEvent>(K.item('events', id));
    if (e && e.workspaceId === workspaceId) out.push(e);
  }
  return out.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

export async function listEvents(workspaceId: string): Promise<BatchEvent[]> {
  const { items } = await listRecords<BatchEvent>('events', workspaceId);
  return items.filter(e => e.workspaceId === workspaceId);
}

export function eventTypeIsRemoval(t: BatchEventType): t is RemovalType {
  return (REMOVAL_TYPES as readonly string[]).includes(t);
}
