/**
 * backupFile.ts — TillExpiry encrypted backup and replace-all restore (§23).
 *
 * Architecture adapted from TillCalc (`e7ea8caa` src/modules/backup/backupFile.ts: allowlisted AsyncStorage keys,
 * passphrase encryption, journaled restore) with Till Note's safety pattern (`6fa6e941`
 * src/modules/settingsBackup/utils/backupFile.ts: verified journal written before any change, prepared/committed
 * states, rollback on failure and on the next launch, reminders reconciled from the restored data).
 *
 * File:  { format: 'tillexpiry', version: 1, createdAt, appVersion, enc }
 *        `enc` = AES-256-GCM + scrypt (src/backup/backupCrypto.ts) of JSON { format, version, createdAt, data }.
 *        The header is repeated inside the ciphertext, so an edited plaintext header is detected.
 *        `data` maps allowlisted LOGICAL keys (backupKeys.ts) to their raw stored JSON strings.
 *
 * Scope: a backup is always built from the REAL data (logical key = physical key; `demo:` keys are never read).
 *        While the isolated demo is active, creating and restoring are refused (`demoActive`): the person is looking
 *        at demo data, so a backup/restore then would be confusing, and the demo must never write real records.
 *
 * Restore (replace-all, atomic):
 *   1. parse + validate the whole file (no writes);
 *   2. snapshot every current allowlisted real key into a verified `backup:restore:*` journal (chunked, sha-256);
 *   3. write the file's keys, remove current keys that are not in the file, read everything back to verify;
 *   4. on any failure restore the snapshot (verified) and mark the journal `rolledBack` — if the rollback fails the
 *      journal stays `prepared` and the next launch rolls back (`recoverInterruptedRestore`, called from App.tsx);
 *   5. COMMIT POINT: mark the journal `committed` and read the marker back. Only a verified marker counts as committed
 *      (EXP-REV-03): if it cannot be written/verified, the meta is put back to `prepared` (verified) and the snapshot is
 *      restored now, so success is never reported and then reverted on the next launch. If even `prepared` cannot be
 *      verified, the data is left wholly new and `restoreUnconfirmed` is reported — the next launch then keeps it
 *      (marker reads `committed`) or rolls it back (marker reads `prepared`): always one whole state, never a mix;
 *   6. clear the journal (a cleanup failure after a verified commit only leaves a `committed` journal, which the next
 *      launch just deletes — it never rolls back), then: cancel every scheduled reminder, reload settings and the
 *      active workspace, reconcile reminders from the restored batches, and announce the data change.
 *
 * Startup recovery (EXP-REV-04): `recoverInterruptedRestore` THROWS `BackupError('recoveryRequired')` when a pending
 * restore cannot be resolved (rollback failed, or the journal cannot be read). App.tsx then shows a blocking
 * RecoveryRequiredScreen (startupRecovery.ts) instead of the business screens; the journal is never discarded in that
 * case. Rule for an unreadable journal: the meta is written only after its chunks are verified and data writes start
 * only after the meta is verified, so a present-but-unreadable meta (or a `prepared` meta whose chunks do not verify)
 * cannot prove that no business key was written — it is kept and blocks startup. A journal whose meta reads
 * `committed` or `rolledBack` needs no chunks (the data is already one whole state), so it is only cleaned up.
 *
 * Backup build (EXP-REV-05) fails closed: if any stored in-scope record is unreadable or inconsistent
 * (backupKeys.validateBackupData), no file is produced and the share sheet is not opened; the error names the
 * categories (`backupBlocked`). Nothing is ever silently dropped from a backup.
 * Device keys (reminder ids/state, snoozes, txn journal, scope, demo meta, language) are never touched.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { encryptString, decryptString, type EncryptedBlob } from '../../backup/backupCrypto';
import { withStorageKeyLock } from '../../utils/storageSafety';
import { getScope } from '../../storage/scope';
import { notifyDataChanged } from '../../storage/changeBus';
import { APP_VERSION } from '../../appMeta';
import { loadSettings } from '../settings/settingsStore';
import { loadActiveWorkspace } from '../workspaces/workspaceStore';
import { cancelAllReminders, reconcileReminders } from '../reminders/reminderService';
import {
  backupKeyInfo, countByWorkspace, isBackupKey, problemCategories, validateBackupData, type BackupCategory, type WorkspaceCounts,
} from './backupKeys';

export const BACKUP_FORMAT = 'tillexpiry';
export const BACKUP_VERSION = 1;
export const BACKUP_EXTENSION = 'tillexpiry';
/** A realistic backup is a few MB; this cap keeps a hostile or wrong file from exhausting memory. */
export const MAX_BACKUP_BYTES = 50 * 1024 * 1024;
/** Legacy key (read as "prepared"): older builds stored the time the file was shared here. */
export const LAST_BACKUP_KEY = 'backup:lastCreatedAt';
/** When a backup file was last PREPARED and handed to the share sheet. The share sheet cannot prove it was saved. */
export const LAST_BACKUP_PREPARED_KEY = 'backup:lastPreparedAt';
export const RESTORE_META_KEY = 'backup:restore:meta';
const RESTORE_CHUNK_PREFIX = 'backup:restore:chunk:';
const CHUNK_CHARS = 400_000; // stays well under Android's per-row AsyncStorage limit
const RESTORE_LOCK = 'backup:restore';
/** Same lock name as storage/entityStore.ts runTxn: no transaction can interleave with a backup read or a restore. */
const TXN_LOCK = 'tillexpiry:txn';

export type BackupErrorCode =
  | 'demoActive' | 'passphraseRequired' | 'fileUnreadable' | 'tooLarge' | 'invalidJson' | 'notTillExpiry'
  | 'tillCalcBackup' | 'tillNoteBackup' | 'otherAppBackup' | 'unsupportedVersion' | 'invalidContent'
  | 'wrongPassphrase' | 'keyNotAllowed' | 'recordInvalid' | 'emptyBackup' | 'nothingToBackUp' | 'writeFailed'
  | 'snapshotFailed' | 'restoreRolledBack' | 'rollbackFailed' | 'backupBlocked' | 'recoveryRequired' | 'restoreUnconfirmed';

export class BackupError extends Error {
  /** `backupBlocked` only: the business-data categories whose records prevented a complete backup. */
  readonly categories: BackupCategory[];
  constructor(readonly code: BackupErrorCode, readonly detail?: string, categories: BackupCategory[] = []) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'BackupError';
    this.categories = categories;
  }
}

/** A picked file (expo-document-picker asset or any local uri). */
export interface BackupFileRef { uri: string; name?: string; size?: number | null }

export interface BackupHeader { createdAt: string; appVersion: string }

export interface ParsedBackup {
  header: BackupHeader;
  data: Record<string, string>;
  workspaces: WorkspaceCounts[];
  keyCount: number;
}

export type BackupPreview = Omit<ParsedBackup, 'data'>;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

// ─── Building a backup ─────────────────────────────────────────────────────────

/** Every allowlisted key of the REAL scope currently in storage (never `demo:`, device or unknown keys). */
async function realBackupKeys(): Promise<string[]> {
  return ((await AsyncStorage.getAllKeys()) as string[]).filter(k => !k.startsWith('demo:') && isBackupKey(k));
}

export function backupFileName(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `TillExpiry-backup-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}.${BACKUP_EXTENSION}`;
}

export interface BuiltBackup {
  text: string;
  createdAt: string;
  keyCount: number;
  workspaces: WorkspaceCounts[];
}

/**
 * Read the real allowlisted data and produce the encrypted file text. No writes. Fails closed with `backupBlocked`
 * (categories attached) when any stored record is unreadable or inconsistent — nothing is left out silently.
 */
export async function buildBackup(passphrase: string, now: Date = new Date()): Promise<BuiltBackup> {
  if (getScope() === 'demo') throw new BackupError('demoActive');
  if (!passphrase) throw new BackupError('passphraseRequired');
  const raw = await withStorageKeyLock([RESTORE_LOCK, TXN_LOCK], async () => {
    const keys = await realBackupKeys();
    return keys.length ? ((await AsyncStorage.multiGet(keys)) as [string, string | null][]) : [];
  });
  const all: Record<string, string> = {};
  for (const [k, v] of raw) if (v !== null) all[k] = v;
  const problems = validateBackupData(all);
  if (problems.length) {
    throw new BackupError('backupBlocked', problems.slice(0, 20).map(p => `${p.key} (${p.reason})`).join(', '), problemCategories(problems));
  }
  const data = all;
  const workspaces = countByWorkspace(data);
  if (!workspaces.length) throw new BackupError('nothingToBackUp');
  const createdAt = now.toISOString();
  const inner = JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt, data });
  const enc = encryptString(inner, passphrase);
  const text = JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt, appVersion: APP_VERSION, enc });
  return { text, createdAt, keyCount: Object.keys(data).length, workspaces };
}

export interface CreatedBackup extends BuiltBackup {
  fileName: string;
  uri: string;
  /** The share sheet was opened. It does NOT prove the file was saved anywhere (expo-sharing cannot tell). */
  shared: boolean;
}

/**
 * Build the backup, write it to the cache directory and open the share sheet. Records the time the file was PREPARED
 * (`LAST_BACKUP_PREPARED_KEY`); a resolved share sheet is not treated as a completed/saved backup.
 */
export async function createBackup(passphrase: string, now: Date = new Date()): Promise<CreatedBackup> {
  const built = await buildBackup(passphrase, now);
  const fileName = backupFileName(now);
  const dir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!dir) throw new BackupError('writeFailed', 'no writable directory');
  const uri = `${dir}${fileName}`;
  try {
    await FileSystem.writeAsStringAsync(uri, built.text, { encoding: FileSystem.EncodingType.UTF8 });
  } catch (e) {
    throw new BackupError('writeFailed', e instanceof Error ? e.message : undefined);
  }
  let shared = false;
  if (await Sharing.isAvailableAsync().catch(() => false)) {
    await Sharing.shareAsync(uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: fileName });
    shared = true;
  }
  await AsyncStorage.setItem(LAST_BACKUP_PREPARED_KEY, built.createdAt).catch(() => undefined);
  return { ...built, fileName, uri, shared };
}

/** When a backup file was last prepared on this device (the legacy "last backup" value is read as prepared). */
export async function loadLastBackupPreparedAt(): Promise<string | null> {
  try {
    const v = await AsyncStorage.getItem(LAST_BACKUP_PREPARED_KEY);
    return v ?? (await AsyncStorage.getItem(LAST_BACKUP_KEY));
  } catch { return null; }
}

/** @deprecated name kept for existing callers — same value as loadLastBackupPreparedAt. */
export const loadLastBackupAt = loadLastBackupPreparedAt;

// ─── Reading and validating a file ─────────────────────────────────────────────

export async function readBackupFile(file: BackupFileRef): Promise<string> {
  if (typeof file.size === 'number' && file.size > MAX_BACKUP_BYTES) throw new BackupError('tooLarge');
  try {
    const info = await FileSystem.getInfoAsync(file.uri);
    const size = (info as { size?: number }).size;
    if (info.exists && typeof size === 'number' && size > MAX_BACKUP_BYTES) throw new BackupError('tooLarge');
  } catch (e) { if (e instanceof BackupError) throw e; /* size unknown: the length check below still applies */ }
  let text: string;
  try { text = String(await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.UTF8 })); } catch { throw new BackupError('fileUnreadable'); }
  if (text.length > MAX_BACKUP_BYTES) throw new BackupError('tooLarge');
  return text;
}

/**
 * Till Note backups (`6fa6e941` settingsBackup/utils/backupFile.ts) carry no `format` field: they are
 * `{ version: 1|2, createdAt, entityCounts, totalRecords, checksum?, fileAssets?, data? | enc? }`.
 */
function looksLikeTillNote(o: Record<string, unknown>): boolean {
  return 'totalRecords' in o || 'fileAssets' in o || ('entityCounts' in o && ('enc' in o || 'data' in o));
}

const HEADER_FIELDS = ['format', 'version', 'createdAt', 'appVersion', 'enc'];

/** Header checks only (no passphrase): wrong app, wrong version, malformed. Cheap; used right after picking a file. */
export function checkBackupHeader(text: string): BackupHeader & { enc: EncryptedBlob } {
  if (text.length > MAX_BACKUP_BYTES) throw new BackupError('tooLarge');
  let o: unknown;
  try { o = JSON.parse(text); } catch { throw new BackupError('invalidJson'); }
  if (!isObj(o)) throw new BackupError('notTillExpiry');
  const format = o.format;
  if (format !== BACKUP_FORMAT) {
    if (format === 'tillcalc') throw new BackupError('tillCalcBackup');
    if (format === 'tillnote' || (format === undefined && looksLikeTillNote(o))) throw new BackupError('tillNoteBackup');
    if (typeof format === 'string' && /^till/i.test(format)) throw new BackupError('otherAppBackup', format);
    throw new BackupError('notTillExpiry');
  }
  if (o.version !== BACKUP_VERSION) throw new BackupError('unsupportedVersion', String(o.version));
  const keys = Object.keys(o);
  if (keys.length !== HEADER_FIELDS.length || !HEADER_FIELDS.every(f => keys.includes(f))) throw new BackupError('invalidContent', 'header fields');
  if (typeof o.createdAt !== 'string' || typeof o.appVersion !== 'string' || !isObj(o.enc)) throw new BackupError('invalidContent', 'header types');
  const enc = o.enc as unknown as EncryptedBlob;
  if (enc.kdf !== 'scrypt' || typeof enc.salt !== 'string' || typeof enc.nonce !== 'string' || typeof enc.ciphertext !== 'string') throw new BackupError('invalidContent', 'encryption header');
  return { createdAt: o.createdAt, appVersion: o.appVersion, enc };
}

/** Full parse: header, decryption, inner header match, allowlist, record shapes. Pure — never writes. */
export function parseBackup(text: string, passphrase: string): ParsedBackup {
  const header = checkBackupHeader(text);
  if (!passphrase) throw new BackupError('passphraseRequired');
  let plain: string;
  try { plain = decryptString(header.enc, passphrase); } catch (e) {
    if (e instanceof Error && /Unsupported/.test(e.message)) throw new BackupError('invalidContent', e.message);
    throw new BackupError('wrongPassphrase');
  }
  let inner: unknown;
  try { inner = JSON.parse(plain); } catch { throw new BackupError('invalidContent', 'inner json'); }
  if (!isObj(inner) || inner.format !== BACKUP_FORMAT || inner.version !== BACKUP_VERSION || inner.createdAt !== header.createdAt) {
    throw new BackupError('invalidContent', 'header does not match the encrypted content');
  }
  const rawData = inner.data;
  if (!isObj(rawData)) throw new BackupError('invalidContent', 'data');
  const data: Record<string, string> = Object.create(null);
  for (const key of Object.keys(rawData)) {
    if (!backupKeyInfo(key)) throw new BackupError('keyNotAllowed', key);
    const v = rawData[key];
    if (typeof v !== 'string') throw new BackupError('recordInvalid', key);
    data[key] = v;
  }
  const problems = validateBackupData(data);
  if (problems.length) {
    const p = problems[0];
    throw new BackupError(p.reason === 'keyNotAllowed' ? 'keyNotAllowed' : 'recordInvalid', `${p.key} (${p.reason})`);
  }
  const workspaces = countByWorkspace(data);
  if (!workspaces.length) throw new BackupError('emptyBackup');
  return { header: { createdAt: header.createdAt, appVersion: header.appVersion }, data: { ...data }, workspaces, keyCount: Object.keys(data).length };
}

/** Read, decrypt and validate a file; returns what a restore would put on the phone. Writes nothing. */
export async function previewBackup(file: BackupFileRef, passphrase: string): Promise<BackupPreview> {
  const p = parseBackup(await readBackupFile(file), passphrase);
  return { header: p.header, workspaces: p.workspaces, keyCount: p.keyCount };
}

// ─── Restore journal ───────────────────────────────────────────────────────────

type JournalState = 'prepared' | 'committed' | 'rolledBack';
interface JournalMeta { v: 1; state: JournalState; chunks: number; sha256: string; keyCount: number; startedAt: string }

const hash = (s: string) => bytesToHex(sha256(utf8ToBytes(s)));
const msg = (e: unknown) => (e instanceof Error ? e.message : undefined);

async function journalChunkKeys(): Promise<string[]> {
  return ((await AsyncStorage.getAllKeys()) as string[]).filter(k => k.startsWith(RESTORE_CHUNK_PREFIX));
}

async function clearJournal(): Promise<void> {
  // Meta first: a journal without its meta is ignored, so a crash here can never trigger a rollback from partial chunks.
  await AsyncStorage.removeItem(RESTORE_META_KEY);
  const chunks = await journalChunkKeys();
  if (chunks.length) await AsyncStorage.multiRemove(chunks);
}

/** Write the meta with a new state and read it back. Throws unless the stored marker is exactly what was written. */
async function setMetaState(meta: JournalMeta, state: JournalState): Promise<void> {
  const metaRaw = JSON.stringify({ ...meta, state });
  await AsyncStorage.setItem(RESTORE_META_KEY, metaRaw);
  if ((await AsyncStorage.getItem(RESTORE_META_KEY)) !== metaRaw) throw new Error(`restore journal state ${state} could not be verified`);
}

async function writeJournal(snapshot: [string, string][]): Promise<JournalMeta> {
  await clearJournal();
  const raw = JSON.stringify(snapshot);
  const parts: [string, string][] = [];
  for (let i = 0; i * CHUNK_CHARS < raw.length || i === 0; i++) parts.push([`${RESTORE_CHUNK_PREFIX}${i}`, raw.slice(i * CHUNK_CHARS, (i + 1) * CHUNK_CHARS)]);
  await AsyncStorage.multiSet(parts);
  const back = (await AsyncStorage.multiGet(parts.map(([k]) => k))) as [string, string | null][];
  if (back.map(([, v]) => v ?? '').join('') !== raw) throw new Error('restore journal could not be verified');
  const meta: JournalMeta = { v: 1, state: 'prepared', chunks: parts.length, sha256: hash(raw), keyCount: snapshot.length, startedAt: new Date().toISOString() };
  await setMetaState(meta, 'prepared');
  return meta;
}

type JournalRead =
  | { meta: JournalMeta; state: 'prepared'; snapshot: [string, string][] }
  | { meta: JournalMeta; state: 'committed' | 'rolledBack' }
  | 'none' | 'unreadable';

/** Storage read errors propagate (the caller treats them as "recovery required"). */
async function readJournal(): Promise<JournalRead> {
  const metaRaw = await AsyncStorage.getItem(RESTORE_META_KEY);
  if (metaRaw === null) return 'none';
  let meta: JournalMeta;
  try { meta = JSON.parse(metaRaw) as JournalMeta; } catch { return 'unreadable'; }
  if (!isObj(meta) || meta.v !== 1) return 'unreadable';
  // The data is already one whole state: no chunks are needed to finish.
  if (meta.state === 'committed' || meta.state === 'rolledBack') return { meta, state: meta.state };
  if (meta.state !== 'prepared' || !Number.isInteger(meta.chunks) || meta.chunks < 1) return 'unreadable';
  const keys = Array.from({ length: meta.chunks }, (_, i) => `${RESTORE_CHUNK_PREFIX}${i}`);
  const parts = (await AsyncStorage.multiGet(keys)) as [string, string | null][];
  if (parts.some(([, v]) => v === null)) return 'unreadable';
  const raw = parts.map(([, v]) => v as string).join('');
  if (hash(raw) !== meta.sha256) return 'unreadable';
  let snapshot: unknown;
  try { snapshot = JSON.parse(raw); } catch { return 'unreadable'; }
  if (!Array.isArray(snapshot) || !snapshot.every(p => Array.isArray(p) && p.length === 2 && typeof p[0] === 'string' && typeof p[1] === 'string' && isBackupKey(p[0]))) return 'unreadable';
  return { meta, state: 'prepared', snapshot: snapshot as [string, string][] };
}

/** Make the real allowlisted keys exactly `target` (write, remove extras, read back). Throws if not verified. */
async function applyExactly(target: [string, string][]): Promise<void> {
  const targetKeys = new Set(target.map(([k]) => k));
  const extras = (await realBackupKeys()).filter(k => !targetKeys.has(k));
  if (target.length) await AsyncStorage.multiSet(target);
  if (extras.length) await AsyncStorage.multiRemove(extras);
  const now = await realBackupKeys();
  if (now.length !== targetKeys.size || now.some(k => !targetKeys.has(k))) throw new Error('restore verification failed: key set differs');
  if (target.length) {
    const back = new Map((await AsyncStorage.multiGet(target.map(([k]) => k))) as [string, string | null][]);
    if (target.some(([k, v]) => back.get(k) !== v)) throw new Error('restore verification failed: value differs');
  }
}

/** True when no `prepared` journal is left (gone, or marked committed / rolledBack). Never throws. */
async function journalSettled(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(RESTORE_META_KEY);
    if (raw === null) return true;
    const m = JSON.parse(raw) as Partial<JournalMeta>;
    return m.state === 'committed' || m.state === 'rolledBack';
  } catch { return false; }
}

/**
 * After the snapshot was put back: mark the journal rolledBack and clear it. Returns false when a `prepared` journal
 * is still on disk — a later launch would then re-apply the snapshot over newer work, so the caller must not report
 * the rollback as finished.
 */
async function settleRolledBack(meta: JournalMeta): Promise<boolean> {
  await setMetaState(meta, 'rolledBack').catch(() => undefined);
  await clearJournal().catch(() => undefined);
  return journalSettled();
}

/** Put the snapshot back now. Always throws: `restoreRolledBack` when verified and settled, else `rollbackFailed`. */
async function rollBackNow(meta: JournalMeta, snapshot: [string, string][], cause: unknown): Promise<never> {
  try {
    await applyExactly(snapshot);
  } catch {
    throw new BackupError('rollbackFailed', msg(cause)); // journal stays `prepared` → the next launch rolls back
  }
  if (!(await settleRolledBack(meta))) throw new BackupError('rollbackFailed', 'rollback done but the journal could not be settled');
  throw new BackupError('restoreRolledBack', msg(cause));
}

export type RecoveryOutcome = 'none' | 'rolledBack' | 'completed';

async function recoverInner(): Promise<RecoveryOutcome> {
  let j: JournalRead;
  try { j = await readJournal(); } catch (e) { throw new BackupError('recoveryRequired', `storageUnavailable: ${msg(e) ?? ''}`); }
  if (j === 'none') return 'none';
  if (j === 'unreadable') {
    // Kept on purpose: it cannot be proven that no business key was written (see the header). Startup is blocked.
    throw new BackupError('recoveryRequired', 'journalUnreadable');
  }
  if (j.state !== 'prepared') {
    // Final data state is already durable; a cleanup failure is retried next launch and can never roll back.
    await clearJournal().catch(() => undefined);
    return j.state === 'committed' ? 'completed' : 'rolledBack';
  }
  try { await applyExactly(j.snapshot); } catch (e) { throw new BackupError('recoveryRequired', `rollbackFailed: ${msg(e) ?? ''}`); }
  if (!(await settleRolledBack(j.meta))) throw new BackupError('recoveryRequired', 'rollbackFailed: journal could not be settled');
  return 'rolledBack';
}

/**
 * App start (App.tsx via startupRecovery.ts): a restore that was interrupted before it committed is rolled back to the
 * data the phone had before it; a committed (or already rolled-back) one only has its journal cleaned up.
 * Throws `BackupError('recoveryRequired')` when that cannot be done — the journal is then kept and the app must not
 * show business data.
 */
export async function recoverInterruptedRestore(): Promise<RecoveryOutcome> {
  return withStorageKeyLock([RESTORE_LOCK, TXN_LOCK], recoverInner);
}

// ─── Restore ───────────────────────────────────────────────────────────────────

export interface RestoreResult {
  workspaces: WorkspaceCounts[];
  keyCount: number;
  /** False when the data was restored but reminders could not be cancelled / planned again (shown to the user). */
  remindersOk: boolean;
}

/** Replace all real business data with a parsed, validated backup. Atomic: wholly old or wholly new. */
export async function restoreParsed(parsed: ParsedBackup): Promise<RestoreResult> {
  if (getScope() === 'demo') throw new BackupError('demoActive');
  const incoming = Object.entries(parsed.data) as [string, string][];
  if (!incoming.length) throw new BackupError('emptyBackup');
  if (incoming.some(([k]) => !isBackupKey(k))) throw new BackupError('keyNotAllowed');

  await withStorageKeyLock([RESTORE_LOCK, TXN_LOCK], async () => {
    // A pending unresolved journal must never be overwritten by a new one (it is the only way back).
    try { await recoverInner(); } catch (e) {
      throw e instanceof BackupError ? e : new BackupError('recoveryRequired', msg(e));
    }
    let snapshot: [string, string][];
    let meta: JournalMeta;
    try {
      const keys = await realBackupKeys();
      const pairs = keys.length ? ((await AsyncStorage.multiGet(keys)) as [string, string | null][]) : [];
      snapshot = pairs.filter((p): p is [string, string] => p[1] !== null);
      meta = await writeJournal(snapshot);
    } catch (e) {
      await clearJournal().catch(() => undefined);
      throw new BackupError('snapshotFailed', msg(e));
    }
    try {
      await applyExactly(incoming);
    } catch (writeErr) {
      await rollBackNow(meta, snapshot, writeErr);
    }
    // Commit point: only a written AND read-back marker counts. Otherwise the restore is not reported as done.
    try {
      await setMetaState(meta, 'committed');
    } catch (commitErr) {
      let backToPrepared = false;
      try { await setMetaState(meta, 'prepared'); backToPrepared = true; } catch { /* marker state unknown */ }
      // Unknown marker: rolling back could leave a mix under a `committed` marker, so the data stays wholly new and
      // the next launch settles it to exactly one whole state (committed → new, prepared → old).
      if (!backToPrepared) throw new BackupError('restoreUnconfirmed', msg(commitErr));
      await rollBackNow(meta, snapshot, commitErr);
    }
    // Verified commit: a cleanup failure here leaves a `committed` journal, which the next launch only deletes.
    await clearJournal().catch(() => undefined);
  });

  // Reminders are device-only: every notification scheduled for the old data is cancelled, then planned again from
  // the restored batches. Settings and the active workspace are reloaded first so the reconcile reads the restored
  // reminder settings and workspace (the reconcile itself reads canonical batch data).
  let remindersOk = true;
  try { await cancelAllReminders(); } catch { remindersOk = false; }
  await loadSettings().catch(() => undefined);
  await loadActiveWorkspace().catch(() => undefined);
  try { await reconcileReminders('restore'); } catch { remindersOk = false; }
  notifyDataChanged();
  return { workspaces: parsed.workspaces, keyCount: parsed.keyCount, remindersOk };
}

/** Read, decrypt, validate and restore a file in one call. */
export async function restoreBackup(file: BackupFileRef, passphrase: string): Promise<RestoreResult> {
  if (getScope() === 'demo') throw new BackupError('demoActive');
  return restoreParsed(parseBackup(await readBackupFile(file), passphrase));
}
