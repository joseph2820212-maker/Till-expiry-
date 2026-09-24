/**
 * backupFile.ts — TillExpiry backup & restore (carried over from TillLabel / TillCalc, which ported it from
 * Till Note). AsyncStorage only: TillExpiry keeps no file assets. Reminders are device-only and are
 * rescheduled from the restored dates, never restored themselves.
 *
 * Backup : reads the restorable keys, encrypts { data } under a passphrase
 *          (AES-256-GCM + scrypt, see backupCrypto), writes the file to the
 *          cache directory and opens the share sheet.
 * Restore: validates the file (size cap, JSON, version, KDF caps, allowlist),
 *          journals a snapshot of the current store, replaces the store in two
 *          phases (write, then remove stale keys) and clears the journal. An
 *          interrupted restore is rolled back on the next launch from the
 *          journal, so the store is always wholly old or wholly new.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { withStorageKeyLock } from '../../utils/storageSafety';
import { writeAndShare } from '../../storage/fileUtils';
import { encryptString, decryptString, type EncryptedBlob } from '../../backup/backupCrypto';
import { TE_KEYS, BACKUP_NAMESPACES } from '../../storage/keys';

export const BACKUP_FORMAT = 'tillexpiry';
export const RESTORE_JOURNAL_KEY = 'backup:restoreJournal';
export const LAST_BACKUP_KEY = 'backup:lastCreatedAt';
const RESTORE_LOCK = 'backup:restore';
const MAX_BACKUP_BYTES = 200 * 1024 * 1024;

interface BackupPayload {
  format?: string;
  version?: number;
  createdAt?: string;
  appVersion?: string;
  entityCounts?: Record<string, number>;
  checksum?: number;
  data?: Record<string, string>;
  enc?: EncryptedBlob;
}

// ─── What a backup contains ───────────────────────────────────────────────────
// Allowlist by namespace: a hostile file can only ever write keys the app owns.
const RESTORABLE_NAMESPACES = new Set<string>(BACKUP_NAMESPACES);
// Device-local / transient keys never leave the device and are never restored.
const EXCLUDED_PREFIXES = ['drafts:', 'billing:', 'tillexpiry:', 'backup:', 'app:', 'journal:'];
const EXCLUDED_KEYS = new Set<string>();

function isSafeKeyShape(k: string): boolean {
  return /^[A-Za-z][A-Za-z0-9]*:[A-Za-z0-9_.:-]+$/.test(k);
}
export function isBackupKey(k: string): boolean {
  if (!isSafeKeyShape(k)) return false;
  if (EXCLUDED_KEYS.has(k)) return false;
  if (EXCLUDED_PREFIXES.some(p => k.startsWith(p))) return false;
  if (/:corrupt:\d+/.test(k)) return false;
  return RESTORABLE_NAMESPACES.has(k.slice(0, k.indexOf(':')));
}

function djb2(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) hash = (((hash << 5) + hash) ^ str.charCodeAt(i)) >>> 0;
  return hash;
}

export function getBackupFileName(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `TillExpiry_Backup_${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}_${p(now.getHours())}${p(now.getMinutes())}.json`;
}

function countList(raw: string | undefined): number {
  if (!raw) return 0;
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v.length : 0; } catch { return 0; }
}

function countBatches(raw: string | undefined, status: 'open' | 'closed'): number {
  if (!raw) return 0;
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v.filter(b => b && b.status === status).length : 0; } catch { return 0; }
}

export function entityCountsFor(data: Record<string, string>): Record<string, number> {
  return {
    products: countList(data[TE_KEYS.products]),
    openDates: countBatches(data[TE_KEYS.batches], 'open'),
    history: countBatches(data[TE_KEYS.batches], 'closed'),
  };
}

export interface BackupSummary { dateLabel: string; fileName: string; uri: string; entityCounts: Record<string, number> }

/** Snapshot the restorable keys and share an encrypted file. Passphrase is mandatory. */
export async function createBackup(passphrase: string, appVersion: string): Promise<BackupSummary> {
  if (!passphrase) throw new Error('A passphrase is required.');
  const pairs = await withStorageKeyLock(RESTORE_LOCK, async () => AsyncStorage.multiGet((await AsyncStorage.getAllKeys()) as string[]));
  const data: Record<string, string> = {};
  for (const [k, v] of pairs) if (v !== null && isBackupKey(k)) data[k] = v;
  const createdAt = new Date().toISOString();
  const entityCounts = entityCountsFor(data);
  const enc = encryptString(JSON.stringify({ data }), passphrase);
  const payload = JSON.stringify({ format: BACKUP_FORMAT, version: 2, createdAt, appVersion, entityCounts, enc }, null, 2);
  const fileName = getBackupFileName();
  const uri = await writeAndShare(fileName, payload);
  await AsyncStorage.setItem(LAST_BACKUP_KEY, createdAt).catch(() => {});
  return { dateLabel: new Date(createdAt).toLocaleString(), fileName, uri, entityCounts };
}

export type RestoreErrorCode = 'too-large' | 'invalid-json' | 'invalid-format' | 'wrong-format' | 'unsupported-version' | 'passphrase-required' | 'wrong-passphrase' | 'checksum-mismatch' | 'empty-backup' | 'rolled-back' | 'rollback-failed';
export class RestoreError extends Error {
  readonly code: RestoreErrorCode;
  constructor(code: RestoreErrorCode, message: string) { super(message); this.code = code; this.name = 'RestoreError'; }
}

async function assertSizeOk(fileUri: string): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(fileUri);
    if (info.exists && typeof (info as { size?: number }).size === 'number' && (info as { size?: number }).size! > MAX_BACKUP_BYTES) throw new RestoreError('too-large', 'Backup file is too large to restore.');
  } catch (e) { if (e instanceof RestoreError) throw e; }
}

export interface BackupInspection { encrypted: boolean; version: number; createdAt?: string; appVersion?: string; entityCounts: Record<string, number> }

/** Header only, so the screen can preview counts and decide whether to ask for the passphrase. */
export async function inspectBackup(fileUri: string): Promise<BackupInspection> {
  await assertSizeOk(fileUri);
  const raw = await FileSystem.readAsStringAsync(fileUri, { encoding: 'utf8' as FileSystem.EncodingType });
  let parsed: BackupPayload;
  try { parsed = JSON.parse(String(raw)); } catch { throw new RestoreError('invalid-json', 'Backup file contains invalid JSON.'); }
  if (!parsed || typeof parsed !== 'object') throw new RestoreError('invalid-format', 'Backup file is not an object.');
  if (parsed.format && parsed.format !== BACKUP_FORMAT) throw new RestoreError('wrong-format', 'This file is not a TillExpiry backup.');
  return { encrypted: parsed.version === 2 && !!parsed.enc, version: typeof parsed.version === 'number' ? parsed.version : 0, createdAt: parsed.createdAt, appVersion: parsed.appVersion, entityCounts: parsed.entityCounts ?? {} };
}

interface RestoreJournal { version: 1; state: 'prepared' | 'committed'; snapshot: [string, string][]; checksum: number }

async function readJournal(): Promise<RestoreJournal | null> {
  const raw = await AsyncStorage.getItem(RESTORE_JOURNAL_KEY);
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as RestoreJournal;
    if (j.version !== 1 || !Array.isArray(j.snapshot) || j.checksum !== djb2(JSON.stringify(j.snapshot))) return null;
    return j;
  } catch { return null; }
}

async function rollbackFromJournal(j: RestoreJournal): Promise<void> {
  const keys = ((await AsyncStorage.getAllKeys()) as string[]).filter(k => k !== RESTORE_JOURNAL_KEY);
  if (keys.length) await AsyncStorage.multiRemove(keys);
  if (j.snapshot.length) await AsyncStorage.multiSet(j.snapshot);
}

async function recoverInner(): Promise<'none' | 'rolledBack' | 'completed'> {
  const raw = await AsyncStorage.getItem(RESTORE_JOURNAL_KEY);
  if (!raw) return 'none';
  const j = await readJournal();
  if (!j) { await AsyncStorage.removeItem(RESTORE_JOURNAL_KEY); return 'none'; }
  if (j.state === 'committed') { await AsyncStorage.removeItem(RESTORE_JOURNAL_KEY); return 'completed'; }
  await rollbackFromJournal(j);
  await AsyncStorage.removeItem(RESTORE_JOURNAL_KEY);
  return 'rolledBack';
}

/** Called at app bootstrap: a restore interrupted before commit is rolled back to the snapshot. */
export async function recoverInterruptedRestore(): Promise<'none' | 'rolledBack' | 'completed'> {
  return withStorageKeyLock(RESTORE_LOCK, recoverInner);
}

export async function restoreBackup(fileUri: string, passphrase?: string): Promise<{ restoredKeys: number; entityCounts: Record<string, number> }> {
  return withStorageKeyLock(RESTORE_LOCK, async () => {
    await recoverInner();
    return restoreInner(fileUri, passphrase);
  });
}

async function restoreInner(fileUri: string, passphrase?: string): Promise<{ restoredKeys: number; entityCounts: Record<string, number> }> {
  await assertSizeOk(fileUri);
  const raw = await FileSystem.readAsStringAsync(fileUri, { encoding: 'utf8' as FileSystem.EncodingType });
  let parsed: BackupPayload;
  try { parsed = JSON.parse(String(raw)); } catch { throw new RestoreError('invalid-json', 'Backup file contains invalid JSON.'); }
  if (!parsed || typeof parsed !== 'object') throw new RestoreError('invalid-format', 'Backup file is not an object.');
  if (parsed.format && parsed.format !== BACKUP_FORMAT) throw new RestoreError('wrong-format', 'This file is not a TillExpiry backup.');
  if (parsed.version !== 1 && parsed.version !== 2) throw new RestoreError('unsupported-version', `Unsupported backup version: ${parsed.version ?? 'unknown'}.`);

  if (parsed.version === 2) {
    if (!parsed.enc) throw new RestoreError('invalid-format', 'Missing encryption header.');
    if (!passphrase) throw new RestoreError('passphrase-required', 'This backup is encrypted.');
    let decrypted: string;
    try { decrypted = decryptString(parsed.enc, passphrase); } catch { throw new RestoreError('wrong-passphrase', 'Incorrect passphrase, or the file was altered.'); }
    try { parsed.data = (JSON.parse(decrypted) as { data?: Record<string, string> }).data; } catch { throw new RestoreError('invalid-format', 'Decrypted content is malformed.'); }
  } else if (parsed.checksum !== undefined && parsed.checksum !== djb2(JSON.stringify(parsed.data))) {
    throw new RestoreError('checksum-mismatch', 'Backup file is corrupted.');
  }

  if (!parsed.data || typeof parsed.data !== 'object' || Array.isArray(parsed.data)) throw new RestoreError('invalid-format', 'Missing data object.');
  const data: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed.data)) {
    if (typeof v !== 'string') throw new RestoreError('invalid-format', `Value for "${k}" is not a string.`);
    if (isBackupKey(k)) data[k] = v; // allowlist: drop everything else silently
  }
  const pairs = Object.entries(data) as [string, string][];
  if (pairs.length === 0) throw new RestoreError('empty-backup', 'Backup file contains no restorable data.');

  // Journal the current store so an interruption anywhere below rolls back cleanly.
  const existingKeys = ((await AsyncStorage.getAllKeys()) as string[]).filter(k => k !== RESTORE_JOURNAL_KEY);
  const snapshot = ((await AsyncStorage.multiGet(existingKeys)) as [string, string | null][]).filter((p): p is [string, string] => p[1] !== null);
  const journal: RestoreJournal = { version: 1, state: 'prepared', snapshot, checksum: djb2(JSON.stringify(snapshot)) };
  await AsyncStorage.setItem(RESTORE_JOURNAL_KEY, JSON.stringify(journal));

  const incoming = new Set(pairs.map(([k]) => k));
  // Stale keys: restorable namespaces present now but absent from the file. Device-local keys are kept.
  const stale = existingKeys.filter(k => !incoming.has(k) && isBackupKey(k));
  try {
    await AsyncStorage.multiSet(pairs);
    if (stale.length) await AsyncStorage.multiRemove(stale);
    await AsyncStorage.setItem(RESTORE_JOURNAL_KEY, JSON.stringify({ ...journal, state: 'committed' }));
  } catch {
    try {
      await rollbackFromJournal(journal);
      await AsyncStorage.removeItem(RESTORE_JOURNAL_KEY);
      throw new RestoreError('rolled-back', 'Restore failed. Your previous data has been recovered.');
    } catch (e) {
      if (e instanceof RestoreError) throw e;
      throw new RestoreError('rollback-failed', 'Restore failed and rollback also failed. Restart the app and try again.');
    }
  }
  await AsyncStorage.removeItem(RESTORE_JOURNAL_KEY).catch(() => {});
  return { restoredKeys: pairs.length, entityCounts: entityCountsFor(data) };
}

/** Counts JSON arrays across the store and reports unparsable ones (Check data). */
export async function checkStorageIntegrity(): Promise<{ ok: boolean; totalRecords: number; parseErrors: number }> {
  const pairs = await AsyncStorage.multiGet((await AsyncStorage.getAllKeys()) as string[]);
  let parseErrors = 0, totalRecords = 0;
  for (const [, v] of pairs) {
    if (!v || !v.trimStart().startsWith('[')) continue;
    try { const a = JSON.parse(v); if (Array.isArray(a)) totalRecords += a.length; else parseErrors++; } catch { parseErrors++; }
  }
  return { ok: parseErrors === 0, totalRecords, parseErrors };
}

export async function loadLastBackupAt(): Promise<string | null> {
  try { return await AsyncStorage.getItem(LAST_BACKUP_KEY); } catch { return null; }
}
