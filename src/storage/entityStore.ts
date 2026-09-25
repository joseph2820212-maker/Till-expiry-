/**
 * Journaled multi-record transactions over AsyncStorage (§24).
 *
 * - Every write path reads STRICTLY: an unreadable record aborts the transaction; it is never treated as "empty" and
 *   overwritten (T26 and the "no silent loss" rule).
 * - All writes of one transaction are applied together. Before applying, the original values of every touched key are
 *   written to a journal; if any write fails the journal restores them. If the app dies mid-write, the journal is rolled
 *   back on the next launch (recoverInterruptedTransaction).
 * - Transactions are serialised with the family per-key lock (utils/storageSafety.ts, from TillCalc), so a double tap
 *   can never interleave two read-modify-write cycles.
 * - Display reads (listRecords) are lenient: an unreadable record is skipped and counted, never rewritten.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { assertWritable } from './writeGate';
import { withStorageKeyLock, StorageCorruptionError } from '../utils/storageSafety';
import { DEVICE_KEYS, K, type EntityNs } from './keys';
import { phys } from './scope';

const TXN_LOCK = 'tillexpiry:txn';

interface Journal { v: 1; snapshot: [string, string | null][] }

export class RecordCorruptError extends StorageCorruptionError {
  constructor(key: string, readonly detail: string) { super(key, null); this.name = 'RecordCorruptError'; }
}

function parseStrict<T>(physKey: string, raw: string | null): T | null {
  if (raw === null) return null;
  try { return JSON.parse(raw) as T; } catch { throw new RecordCorruptError(physKey, 'unparseable'); }
}

export interface Txn {
  /** Strict read of a logical key (sees this transaction's own pending writes). */
  get<T>(key: string): Promise<T | null>;
  /** Strict read of an id index (missing → []; not an array → abort). */
  getIndex(key: string): Promise<string[]>;
  set(key: string, value: unknown): void;
  del(key: string): void;
  /** Append an id to an index once. */
  addToIndex(key: string, id: string): Promise<void>;
  removeFromIndex(key: string, id: string): Promise<void>;
}

class TxnImpl implements Txn {
  readonly pending = new Map<string, string | null>();
  readonly original = new Map<string, string | null>();

  private async raw(physKey: string): Promise<string | null> {
    if (this.pending.has(physKey)) return this.pending.get(physKey) as string | null;
    if (!this.original.has(physKey)) this.original.set(physKey, await AsyncStorage.getItem(physKey));
    return this.original.get(physKey) as string | null;
  }
  async get<T>(key: string): Promise<T | null> {
    const p = phys(key);
    return parseStrict<T>(p, await this.raw(p));
  }
  async getIndex(key: string): Promise<string[]> {
    const v = await this.get<unknown>(key);
    if (v == null) return [];
    if (!Array.isArray(v) || v.some(x => typeof x !== 'string')) throw new RecordCorruptError(phys(key), 'index is not a list of ids');
    return v as string[];
  }
  set(key: string, value: unknown): void { this.pending.set(phys(key), JSON.stringify(value)); }
  del(key: string): void { this.pending.set(phys(key), null); }
  async addToIndex(key: string, id: string): Promise<void> {
    const list = await this.getIndex(key);
    if (!list.includes(id)) this.set(key, [...list, id]);
  }
  async removeFromIndex(key: string, id: string): Promise<void> {
    const list = await this.getIndex(key);
    if (list.includes(id)) this.set(key, list.filter(x => x !== id));
  }
}

async function applyJournaled(tx: TxnImpl): Promise<void> {
  if (!tx.pending.size) return;
  const keys = [...tx.pending.keys()];
  for (const k of keys) if (!tx.original.has(k)) tx.original.set(k, await AsyncStorage.getItem(k));
  const journal: Journal = { v: 1, snapshot: keys.map(k => [k, tx.original.get(k) ?? null]) };
  await AsyncStorage.setItem(DEVICE_KEYS.txnJournal, JSON.stringify(journal));
  try {
    const sets = keys.filter(k => tx.pending.get(k) !== null).map(k => [k, tx.pending.get(k) as string] as [string, string]);
    const dels = keys.filter(k => tx.pending.get(k) === null);
    if (sets.length) await AsyncStorage.multiSet(sets);
    if (dels.length) await AsyncStorage.multiRemove(dels);
  } catch (e) {
    await rollback(journal);
    await AsyncStorage.removeItem(DEVICE_KEYS.txnJournal).catch(() => undefined);
    throw e;
  }
  await AsyncStorage.removeItem(DEVICE_KEYS.txnJournal);
}

async function rollback(j: Journal): Promise<void> {
  const sets = j.snapshot.filter(([, v]) => v !== null) as [string, string][];
  const dels = j.snapshot.filter(([, v]) => v === null).map(([k]) => k);
  if (sets.length) await AsyncStorage.multiSet(sets);
  if (dels.length) await AsyncStorage.multiRemove(dels);
}

/** Run `fn` as one atomic unit. Throws (and changes nothing) if any read is corrupt or any write fails. */
export function runTxn<R>(fn: (tx: Txn) => Promise<R>): Promise<R> {
  return withStorageKeyLock(TXN_LOCK, async () => {
    assertWritable(); // P1-REOPEN-02: no business write while a restore is unsettled
    const tx = new TxnImpl();
    const result = await fn(tx);
    await applyJournaled(tx);
    return result;
  });
}

/** Startup: roll back a transaction that was interrupted after its journal was written. */
export async function recoverInterruptedTransaction(): Promise<boolean> {
  return withStorageKeyLock(TXN_LOCK, async () => {
    const raw = await AsyncStorage.getItem(DEVICE_KEYS.txnJournal);
    if (!raw) return false;
    try {
      const j = JSON.parse(raw) as Journal;
      if (j?.v === 1 && Array.isArray(j.snapshot)) await rollback(j);
    } finally {
      await AsyncStorage.removeItem(DEVICE_KEYS.txnJournal);
    }
    return true;
  });
}

/** Lenient display read of one record. */
export async function readRecord<T>(key: string): Promise<T | null> {
  const raw = await AsyncStorage.getItem(phys(key));
  if (raw === null) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

export interface ListResult<T> { items: T[]; unreadable: number }

/** Lenient display read of every record of a namespace in one workspace (one multiGet, no per-row round trips). */
export async function listRecords<T extends { id: string }>(ns: EntityNs, workspaceId: string): Promise<ListResult<T>> {
  let ids: string[] = [];
  const rawIndex = await AsyncStorage.getItem(phys(K.index(ns, workspaceId)));
  if (rawIndex) {
    try { const v = JSON.parse(rawIndex); if (Array.isArray(v)) ids = v.filter((x): x is string => typeof x === 'string'); } catch { return { items: [], unreadable: 1 }; }
  }
  if (!ids.length) return { items: [], unreadable: 0 };
  const pairs = await AsyncStorage.multiGet(ids.map(id => phys(K.item(ns, id))));
  const items: T[] = [];
  let unreadable = 0;
  for (const [, v] of pairs) {
    if (v == null) { unreadable++; continue; }
    try { const r = JSON.parse(v); if (r && typeof r === 'object' && typeof r.id === 'string') items.push(r as T); else unreadable++; } catch { unreadable++; }
  }
  return { items, unreadable };
}

let seq = 0;
/** Stable, collision-resistant local ids: `<prefix>_<time>_<counter>_<random>`. */
export function newId(prefix: string): string {
  seq = (seq + 1) % 1_000_000;
  return `${prefix}_${Date.now().toString(36)}_${seq.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export const nowIso = (): string => new Date().toISOString();
