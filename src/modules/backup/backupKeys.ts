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
 */
import { BACKUP_NAMESPACES, type EntityNs } from '../../storage/keys';
import { DATE_KINDS } from '../../domain/expiry/expiryTypes';

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

const ITEM_CHECKS: Record<EntityNs, (r: Obj) => boolean> = {
  products: r => nonEmpty(r.name) && Array.isArray(r.barcodes) && oneOf(r.status, ['active', 'hidden']),
  batches: r => nonEmpty(r.productId) && str(r.productName) && oneOf(r.status, ['active', 'completed', 'archived'])
    && oneOf(r.dateKind, DATE_KINDS) && isObj(r.effective) && oneOf((r.effective as Obj).dateKind, DATE_KINDS),
  events: r => nonEmpty(r.batchId) && nonEmpty(r.type) && nonEmpty(r.at),
  rules: r => nonEmpty(r.name) && oneOf(r.appliesTo, ['after_opening', 'after_preparation', 'manual_review'])
    && oneOf(r.class, ['hard_cutoff', 'quality_review']) && typeof r.version === 'number' && str(r.sourceText),
  locations: r => nonEmpty(r.name) && nonEmpty(r.kind) && oneOf(r.status, ['active', 'hidden']),
  lists: r => oneOf(r.kind, ['category', 'supplier']) && nonEmpty(r.name) && oneOf(r.status, ['active', 'hidden']),
  imports: r => nonEmpty(r.fingerprint) && optStr(r.fileName),
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
  for (const p of parsed) {
    if (p.info.kind !== 'workspace') continue;
    const w = p.value;
    if (!isObj(w) || w.id !== p.info.id || !nonEmpty(w.name) || !oneOf(w.status, ['active', 'hidden']) || !nonEmpty(w.timeZone) || !str(w.mode)) {
      problems.push({ key: p.key, reason: 'badWorkspace' });
      continue;
    }
    workspaceIds.add(p.info.id);
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

  // An index may only list records of its own workspace (colliding ids across workspaces are refused).
  for (const p of parsed) {
    if (p.info.kind !== 'index' || !isIdList(p.value)) continue;
    const { ns, workspaceId } = p.info;
    for (const id of p.value) {
      const rec = items.get(`${ns}:item:${id}`);
      if (rec && rec.workspaceId !== workspaceId) { problems.push({ key: p.key, reason: 'crossWorkspaceId' }); break; }
    }
  }
  return problems;
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
