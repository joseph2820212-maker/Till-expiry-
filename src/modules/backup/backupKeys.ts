/**
 * What a TillExpiry backup may contain (§23, §24) and how every entry is validated.
 *
 * Allowlist by exact key SHAPE, not just by namespace: only the logical keys the stores actually write
 * (storage/keys.ts `K`) inside the BACKUP_NAMESPACES are accepted. Device keys (`app:`, `journal:`, `backup:`),
 * demo keys (`demo:`), preserved corrupt copies (`…:corrupt:…`) and any unknown key shape are never exported and
 * make an incoming file invalid.
 *
 * Values are the raw JSON strings exactly as stored, so a round trip is byte-for-byte. Each value is parsed and
 * shape-checked; cross-record checks catch colliding ids (a record stored under another id, an index listing a record
 * of another workspace, duplicate ids in one index) and records that belong to no workspace in the file (T52).
 *
 * Referential rules (EXP-REV-05) — the same rules apply when a backup is BUILT and when a file is RESTORED; a backup is
 * never produced from, and a restore never accepts, data that breaks one of them (fail closed, nothing is dropped):
 *   - every id in an index (`workspaces:index`, `<ns>:index:<ws>`, `events:batch:<batch>`) has its item in the data;
 *   - an indexed item's `id` equals its key id and its `workspaceId` equals the index's workspace;
 *   - every item is listed in its index (an "orphan" item that no index lists is refused, never silently kept);
 *   - `workspaces:active` exists whenever there is a workspace and names a workspace that is present and ACTIVE (no
 *     repair is applied — the stores never write a stale or hidden active id, so one means the data is damaged);
 *   - `events:batch:<id>` belongs to an existing batch and lists only events of that batch and its workspace, and every
 *     event is listed in its batch's list.
 */
import { BACKUP_NAMESPACES, type EntityNs } from '../../storage/keys';
import { DATE_KINDS, type Batch, type DateKind, type DeadlineValue } from '../../domain/expiry/expiryTypes';
import { isLocalDate, isLocalMonth, isOffsetIso, isValidTimeZone } from '../../domain/expiry/datePrecision';
import { validateDeadline } from '../../domain/expiry/expiryValidation';
import { ownDeadline } from '../../domain/expiry/deadlineEngine';

const ID = '[A-Za-z0-9_-]{1,100}';
const ENTITY_NS: readonly EntityNs[] = ['products', 'batches', 'events', 'rules', 'locations', 'lists', 'imports'];
const ENTITY_RE = new RegExp(`^(${ENTITY_NS.join('|')}):(index|item):(${ID})$`);
const WORKSPACE_ITEM_RE = new RegExp(`^workspaces:item:(${ID})$`);
const BATCH_EVENTS_RE = new RegExp(`^events:batch:(${ID})$`);

export type BackupKeyInfo =
  | { kind: 'settings'; name: 'general' | 'reminders' }
  | { kind: 'workspacesIndex' }
  | { kind: 'workspacesActive' }
  | { kind: 'workspace'; id: string }
  | { kind: 'index'; ns: EntityNs; workspaceId: string }
  | { kind: 'item'; ns: EntityNs; id: string }
  | { kind: 'batchEvents'; batchId: string };

/** Classify a LOGICAL key; null = not allowed in a backup. */
export function backupKeyInfo(key: string): BackupKeyInfo | null {
  if (typeof key !== 'string' || key.length > 200) return null;
  const ns = key.slice(0, key.indexOf(':'));
  if (!(BACKUP_NAMESPACES as readonly string[]).includes(ns)) return null;
  if (key === 'settings:general') return { kind: 'settings', name: 'general' };
  if (key === 'settings:reminders') return { kind: 'settings', name: 'reminders' };
  if (key === 'workspaces:index') return { kind: 'workspacesIndex' };
  if (key === 'workspaces:active') return { kind: 'workspacesActive' };
  let m = WORKSPACE_ITEM_RE.exec(key);
  if (m) return { kind: 'workspace', id: m[1] };
  m = BATCH_EVENTS_RE.exec(key);
  if (m) return { kind: 'batchEvents', batchId: m[1] };
  m = ENTITY_RE.exec(key);
  if (m) {
    return m[2] === 'index'
      ? { kind: 'index', ns: m[1] as EntityNs, workspaceId: m[3] }
      : { kind: 'item', ns: m[1] as EntityNs, id: m[3] };
  }
  return null;
}

export const isBackupKey = (key: string): boolean => backupKeyInfo(key) !== null;

// ─── Record shape checks ───────────────────────────────────────────────────────
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): v is string => typeof v === 'string';
const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const oneOf = (v: unknown, list: readonly string[]) => typeof v === 'string' && list.includes(v);
const optStr = (v: unknown) => v === undefined || typeof v === 'string';

/** Optional exact money (`MoneyValue`): absent = unknown (allowed); present = integer minor units + ISO currency. */
const optMoney = (v: unknown) => v === undefined
  || (isObj(v) && Number.isSafeInteger(v.minor) && (v.minor as number) >= 0 && typeof v.currency === 'string' && /^[A-Z]{3}$/.test(v.currency));
const optCount = (v: unknown) => v === undefined || (Number.isSafeInteger(v) && (v as number) >= 0);

const DEADLINE_REASONS = ['printed', 'direct', 'rule', 'original_hard', 'original_quality', 'corrected', 'none'];

/** A stored DeadlineValue: a real calendar date, a real month, or an offset ISO instant. */
function validDeadlineValue(v: unknown): v is DeadlineValue {
  if (!isObj(v)) return false;
  if (v.precision === 'date') return typeof v.date === 'string' && isLocalDate(v.date);
  if (v.precision === 'month') return typeof v.month === 'string' && isLocalMonth(v.month);
  if (v.precision === 'datetime') return typeof v.at === 'string' && isOffsetIso(v.at);
  return false;
}

/** A DeadlineInfo (effective / secondary): kind, reason, and a deadline that fits the kind (use-by never month-only). */
function validDeadlineInfo(v: unknown): boolean {
  if (!isObj(v) || !oneOf(v.dateKind, DATE_KINDS) || !oneOf(v.reason, DEADLINE_REASONS)) return false;
  if (v.dateKind === 'none') return v.deadline === undefined;
  return validDeadlineValue(v.deadline) && validateDeadline(v.dateKind as DateKind, v.deadline) === null;
}

/** A batch's own stored date fields, its effective / secondary dates and its time zone (P1-REOPEN audit). */
function validBatchDates(r: Obj): boolean {
  if (!nonEmpty(r.timeZone) || !isValidTimeZone(r.timeZone)) return false;
  if (!oneOf(r.datePrecision, ['date', 'month', 'datetime'])) return false;
  if (r.printedDate !== undefined && !(typeof r.printedDate === 'string' && isLocalDate(r.printedDate))) return false;
  if (r.printedMonth !== undefined && !(typeof r.printedMonth === 'string' && isLocalMonth(r.printedMonth))) return false;
  if (r.exactDeadlineAt !== undefined && !(typeof r.exactDeadlineAt === 'string' && isOffsetIso(r.exactDeadlineAt))) return false;
  const own = ownDeadline(r as unknown as Batch);
  if (validateDeadline(r.dateKind as DateKind, r.dateKind === 'none' ? undefined : own) !== null) return false;
  if (!validDeadlineInfo(r.effective)) return false;
  if (r.secondary !== undefined && !validDeadlineInfo(r.secondary)) return false;
  for (const t of [r.openedAt, r.preparedAt, r.receivedAt]) if (t !== undefined && !(typeof t === 'string' && isOffsetIso(t))) return false;
  if (r.sourceBatchIds !== undefined && !isIdList(r.sourceBatchIds)) return false;
  if (r.parentBatchId !== undefined && !nonEmpty(r.parentBatchId)) return false;
  return true;
}

const ITEM_CHECKS: Record<EntityNs, (r: Obj) => boolean> = {
  products: r => nonEmpty(r.name) && Array.isArray(r.barcodes) && oneOf(r.status, ['active', 'hidden'])
    && optMoney(r.costPerTrackingUnit) && optMoney(r.sellingPrice),
  batches: r => nonEmpty(r.productId) && str(r.productName) && oneOf(r.status, ['active', 'completed', 'archived'])
    && oneOf(r.dateKind, DATE_KINDS) && validBatchDates(r),
  // `unitCost` (wasted events, EXP-REV-10) is optional: older events without it stay valid.
  events: r => nonEmpty(r.batchId) && nonEmpty(r.type) && nonEmpty(r.at) && optMoney(r.unitCost),
  rules: r => nonEmpty(r.name) && oneOf(r.appliesTo, ['after_opening', 'after_preparation', 'manual_review'])
    && oneOf(r.class, ['hard_cutoff', 'quality_review']) && typeof r.version === 'number' && str(r.sourceText),
  locations: r => nonEmpty(r.name) && nonEmpty(r.kind) && oneOf(r.status, ['active', 'hidden']),
  lists: r => oneOf(r.kind, ['category', 'supplier']) && nonEmpty(r.name) && oneOf(r.status, ['active', 'hidden']),
  // Counts added later (updated/error/newProduct/newLocation) and requestId are optional for older records.
  imports: r => nonEmpty(r.fingerprint) && optStr(r.fileName) && optCount(r.updatedCount) && optCount(r.errorCount)
    && optCount(r.newProductCount) && optCount(r.newLocationCount) && optStr(r.requestId),
};

function isIdList(v: unknown): v is string[] {
  return Array.isArray(v) && v.every(x => typeof x === 'string' && x.length > 0 && x.length <= 100);
}

export interface EntryProblem { key: string; reason: string }

interface Parsed { key: string; info: BackupKeyInfo; value: unknown }

/**
 * Validate a whole key→raw-JSON map. Returns every problem found (empty = valid). Pure; never touches storage.
 * `data` must already contain only string values.
 */
export function validateBackupData(data: Record<string, string>): EntryProblem[] {
  const problems: EntryProblem[] = [];
  const parsed: Parsed[] = [];
  for (const key of Object.keys(data)) {
    const info = backupKeyInfo(key);
    if (!info) { problems.push({ key, reason: 'keyNotAllowed' }); continue; }
    try { parsed.push({ key, info, value: JSON.parse(data[key]) }); } catch { problems.push({ key, reason: 'unparseable' }); }
  }

  // Workspaces present in the file (every other record must belong to one of them).
  const workspaceIds = new Set<string>();
  const workspaceStatus = new Map<string, string>();
  for (const p of parsed) {
    if (p.info.kind !== 'workspace') continue;
    const w = p.value;
    if (!isObj(w) || w.id !== p.info.id || !nonEmpty(w.name) || !oneOf(w.status, ['active', 'hidden']) || !nonEmpty(w.timeZone) || !isValidTimeZone(w.timeZone) || !str(w.mode)) {
      problems.push({ key: p.key, reason: 'badWorkspace' });
      continue;
    }
    workspaceIds.add(p.info.id);
    workspaceStatus.set(p.info.id, w.status as string);
  }

  const items = new Map<string, Obj>(); // key → record, for the index cross-checks
  for (const p of parsed) {
    const { info, value: v, key } = p;
    switch (info.kind) {
      case 'workspace':
        break;
      case 'settings':
        if (!isObj(v)) problems.push({ key, reason: 'badSettings' });
        break;
      case 'workspacesIndex':
        if (!isIdList(v)) problems.push({ key, reason: 'badIndex' });
        else if (new Set(v).size !== v.length) problems.push({ key, reason: 'duplicateId' });
        break;
      case 'workspacesActive':
        if (!nonEmpty(v)) problems.push({ key, reason: 'badActive' });
        break;
      case 'batchEvents':
        if (!isIdList(v)) problems.push({ key, reason: 'badIndex' });
        else if (new Set(v).size !== v.length) problems.push({ key, reason: 'duplicateId' });
        break;
      case 'index':
        if (!workspaceIds.has(info.workspaceId)) problems.push({ key, reason: 'unknownWorkspace' });
        else if (!isIdList(v)) problems.push({ key, reason: 'badIndex' });
        else if (new Set(v).size !== v.length) problems.push({ key, reason: 'duplicateId' });
        break;
      case 'item':
        if (!isObj(v) || v.id !== info.id || !nonEmpty(v.workspaceId)) { problems.push({ key, reason: 'idMismatch' }); break; }
        if (!workspaceIds.has(v.workspaceId as string)) { problems.push({ key, reason: 'unknownWorkspace' }); break; }
        if (!ITEM_CHECKS[info.ns](v)) { problems.push({ key, reason: 'badRecord' }); break; }
        items.set(key, v);
        break;
    }
  }

  // ─── Referential checks (see the header) ────────────────────────────────────
  const has = (k: string) => Object.prototype.hasOwnProperty.call(data, k);
  const listed = new Map<EntityNs, Set<string>>(ENTITY_NS.map(ns => [ns, new Set<string>()]));
  for (const p of parsed) {
    if (p.info.kind !== 'index' || !isIdList(p.value)) continue;
    const { ns, workspaceId } = p.info;
    for (const id of p.value) {
      listed.get(ns)!.add(id);
      const itemKey = `${ns}:item:${id}`;
      if (!has(itemKey)) { problems.push({ key: p.key, reason: 'missingItem' }); break; }
      const rec = items.get(itemKey);
      if (rec && rec.workspaceId !== workspaceId) { problems.push({ key: p.key, reason: 'crossWorkspaceId' }); break; }
    }
  }
  for (const [key] of items) {
    const info = backupKeyInfo(key);
    if (info?.kind === 'item' && !listed.get(info.ns)!.has(info.id)) problems.push({ key, reason: 'orphanItem' });
  }

  // Workspaces: index ↔ items, and the active workspace.
  const wsIndexEntry = parsed.find(p => p.info.kind === 'workspacesIndex');
  const wsIndex = wsIndexEntry && isIdList(wsIndexEntry.value) ? wsIndexEntry.value : null;
  const workspaceItemKeys = parsed.filter(p => p.info.kind === 'workspace');
  if (wsIndex) {
    const missing = wsIndex.find(id => !has(`workspaces:item:${id}`));
    if (missing !== undefined) problems.push({ key: 'workspaces:index', reason: 'missingItem' });
  }
  for (const p of workspaceItemKeys) {
    const id = (p.info as { id: string }).id;
    if (!wsIndex || !wsIndex.includes(id)) problems.push({ key: p.key, reason: 'orphanItem' });
  }
  if (workspaceItemKeys.length || (wsIndex && wsIndex.length)) {
    const activeEntry = parsed.find(p => p.info.kind === 'workspacesActive');
    if (!has('workspaces:active')) problems.push({ key: 'workspaces:active', reason: 'missingActive' });
    else if (activeEntry && nonEmpty(activeEntry.value)) {
      const w = workspaceStatus.get(activeEntry.value);
      if (!w || !(wsIndex ?? []).includes(activeEntry.value)) problems.push({ key: activeEntry.key, reason: 'unknownWorkspace' });
      else if (w !== 'active') problems.push({ key: activeEntry.key, reason: 'hiddenActive' });
    }
  }

  // Per-batch event lists.
  const inBatchList = new Set<string>();
  for (const p of parsed) {
    if (p.info.kind !== 'batchEvents' || !isIdList(p.value)) continue;
    const batchKey = `batches:item:${p.info.batchId}`;
    if (!has(batchKey)) { problems.push({ key: p.key, reason: 'unknownBatch' }); continue; }
    const batch = items.get(batchKey);
    for (const id of p.value) {
      const evKey = `events:item:${id}`;
      if (!has(evKey)) { problems.push({ key: p.key, reason: 'missingItem' }); break; }
      const ev = items.get(evKey);
      if (ev && batch && (ev.batchId !== p.info.batchId || ev.workspaceId !== batch.workspaceId)) { problems.push({ key: p.key, reason: 'eventMismatch' }); break; }
      inBatchList.add(id);
    }
  }
  for (const [key, ev] of items) {
    const info = backupKeyInfo(key);
    if (info?.kind !== 'item' || info.ns !== 'events') continue;
    const batch = items.get(`batches:item:${String(ev.batchId)}`);
    if (!has(`batches:item:${String(ev.batchId)}`)) problems.push({ key, reason: 'unknownBatch' });
    else if (batch && batch.workspaceId !== ev.workspaceId) problems.push({ key, reason: 'eventMismatch' });
    else if (!inBatchList.has(info.id)) problems.push({ key, reason: 'orphanItem' });
  }
  // Batch references stay inside their own workspace (P1-REOPEN audit): product, original pack, source batches.
  for (const [key, b] of items) {
    const info = backupKeyInfo(key);
    if (info?.kind !== 'item' || info.ns !== 'batches') continue;
    const sameWs = (k: string) => has(k) && items.get(k)?.workspaceId === b.workspaceId;
    if (!sameWs(`products:item:${String(b.productId)}`)) problems.push({ key, reason: 'unknownProduct' });
    if (b.parentBatchId !== undefined && !sameWs(`batches:item:${String(b.parentBatchId)}`)) problems.push({ key, reason: 'unknownParent' });
    if (Array.isArray(b.sourceBatchIds) && b.sourceBatchIds.some(id => !sameWs(`batches:item:${String(id)}`))) problems.push({ key, reason: 'unknownSource' });
  }
  return problems;
}

/** Business-data categories a problem can be reported under (i18n `backup.category.<category>`). */
export type BackupCategory = 'settings' | 'workspaces' | EntityNs;

export function categoryOfKey(key: string): BackupCategory | null {
  const info = backupKeyInfo(key);
  if (!info) return null;
  switch (info.kind) {
    case 'settings': return 'settings';
    case 'workspacesIndex': case 'workspacesActive': case 'workspace': return 'workspaces';
    case 'batchEvents': return 'events';
    default: return info.ns;
  }
}

/** Distinct categories of a list of problems, in a stable order (keys outside the allowlist have no category). */
export function problemCategories(problems: EntryProblem[]): BackupCategory[] {
  const order: BackupCategory[] = ['workspaces', 'settings', ...ENTITY_NS];
  const found = new Set(problems.map(p => categoryOfKey(p.key)).filter((c): c is BackupCategory => c !== null));
  return order.filter(c => found.has(c));
}

/** Counts per workspace for the restore preview (E36). */
export interface WorkspaceCounts {
  id: string;
  name: string;
  hidden: boolean;
  products: number;
  batches: number;
  events: number;
  rules: number;
  locations: number;
  lists: number;
  imports: number;
}

export function countByWorkspace(data: Record<string, string>): WorkspaceCounts[] {
  const out = new Map<string, WorkspaceCounts>();
  for (const key of Object.keys(data)) {
    const info = backupKeyInfo(key);
    if (info?.kind !== 'workspace') continue;
    try {
      const w = JSON.parse(data[key]) as { name: string; status: string };
      out.set(info.id, { id: info.id, name: w.name, hidden: w.status === 'hidden', products: 0, batches: 0, events: 0, rules: 0, locations: 0, lists: 0, imports: 0 });
    } catch { /* validated earlier */ }
  }
  for (const key of Object.keys(data)) {
    const info = backupKeyInfo(key);
    if (info?.kind !== 'item') continue;
    try {
      const r = JSON.parse(data[key]) as { workspaceId: string };
      const c = out.get(r.workspaceId);
      if (c) c[info.ns] += 1;
    } catch { /* validated earlier */ }
  }
  return [...out.values()].sort((a, b) => Number(a.hidden) - Number(b.hidden) || a.name.localeCompare(b.name));
}
