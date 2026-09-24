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
 *   4. on any failure restore the snapshot (verified) — if that also fails the journal stays and the next launch
 *      rolls back (`recoverInterruptedRestore`, called from App.tsx);
 *   5. mark committed, clear the journal, then: cancel every scheduled reminder, reload settings and the active
 *      workspace, reconcile reminders from the restored batches, and announce the data change.
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
import { backupKeyInfo, countByWorkspace, isBackupKey, validateBackupData, type EntryProblem, type WorkspaceCounts } from './backupKeys';

export const BACKUP_FORMAT = 'tillexpiry';
export const BACKUP_VERSION = 1;
export const BACKUP_EXTENSION = 'tillexpiry';
/** A realistic backup is a few MB; this cap keeps a hostile or wrong file from exhausting memory. */
export const MAX_BACKUP_BYTES = 50 * 1024 * 1024;
export const LAST_BACKUP_KEY = 'backup:lastCreatedAt';
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
  | 'snapshotFailed' | 'restoreRolledBack' | 'rollbackFailed';

export class BackupError extends Error {
  constructor(readonly code: BackupErrorCode, readonly detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'BackupError';
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

/** Drop entries that would make the file unrestorable (a corrupt record, an orphan of a broken workspace…). */
function dropInvalid(data: Record<string, string>): { data: Record<string, string>; skipped: EntryProblem[] } {
  const out = { ...data };
  const skipped: EntryProblem[] = [];
  for (let i = 0; i < 5; i++) {
    const problems = validateBackupData(out);
    if (!problems.length) break;
    for (const p of problems) { if (p.key in out) { delete out[p.key]; skipped.push(p); } }
  }
  return { data: out, skipped };
}

export function backupFileName(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `TillExpiry-backup-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}.${BACKUP_EXTENSION}`;
}

export interface BuiltBackup {
  text: string;
  createdAt: string;
  keyCount: number;
  /** Stored entries left out because they were unreadable or inconsistent (shown to the user, never hidden). */
  skipped: EntryProblem[];
  workspaces: WorkspaceCounts[];
}

/** Read the real allowlisted data and produce the encrypted file text. No writes. */
export async function buildBackup(passphrase: string, now: Date = new Date()): Promise<BuiltBackup> {
  if (getScope() === 'demo') throw new BackupError('demoActive');
  if (!passphrase) throw new BackupError('passphraseRequired');
  const raw = await withStorageKeyLock([RESTORE_LOCK, TXN_LOCK], async () => {
    const keys = await realBackupKeys();
    return keys.length ? ((await AsyncStorage.multiGet(keys)) as [string, string | null][]) : [];
  });
  const all: Record<string, string> = {};
  for (const [k, v] of raw) if (v !== null) all[k] = v;
  const { data, skipped } = dropInvalid(all);
  const workspaces = countByWorkspace(data);
  if (!workspaces.length) throw new BackupError('nothingToBackUp');
  const createdAt = now.toISOString();
  const inner = JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt, data });
  const enc = encryptString(inner, passphrase);
  const text = JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt, appVersion: APP_VERSION, enc });
  return { text, createdAt, keyCount: Object.keys(data).length, skipped, workspaces };
}

export interface CreatedBackup extends BuiltBackup { fileName: string; uri: string; shared: boolean }

/** Build the backup, write it to the cache directory and open the share sheet. */
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
  await AsyncStorage.setItem(LAST_BACKUP_KEY, built.createdAt).catch(() => undefined);
  return { ...built, fileName, uri, shared };
}

export async function loadLastBackupAt(): Promise<string | null> {
  try { return await AsyncStorage.getItem(LAST_BACKUP_KEY); } catch { return null; }
}

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

interface JournalMeta { v: 1; state: 'prepared' | 'committed'; chunks: number; sha256: string; keyCount: number; startedAt: string }

const hash = (s: string) => bytesToHex(sha256(utf8ToBytes(s)));

async function journalChunkKeys(): Promise<string[]> {
  return ((await AsyncStorage.getAllKeys()) as string[]).filter(k => k.startsWith(RESTORE_CHUNK_PREFIX));
}

async function clearJournal(): Promise<void> {
  // Meta first: a journal without its meta is ignored, so a crash here can never trigger a rollback from partial chunks.
  await AsyncStorage.removeItem(RESTORE_META_KEY);
  const chunks = await journalChunkKeys();
  if (chunks.length) await AsyncStorage.multiRemove(chunks);
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
  const metaRaw = JSON.stringify(meta);
  await AsyncStorage.setItem(RESTORE_META_KEY, metaRaw);
  if ((await AsyncStorage.getItem(RESTORE_META_KEY)) !== metaRaw) throw new Error('restore journal header could not be verified');
  return meta;
}

type JournalRead = { meta: JournalMeta; snapshot: [string, string][] } | 'none' | 'unreadable';

async function readJournal(): Promise<JournalRead> {
  const metaRaw = await AsyncStorage.getItem(RESTORE_META_KEY);
  if (metaRaw === null) return 'none';
  let meta: JournalMeta;
  try { meta = JSON.parse(metaRaw) as JournalMeta; } catch { return 'unreadable'; }
  if (!meta || meta.v !== 1 || (meta.state !== 'prepared' && meta.state !== 'committed') || !Number.isInteger(meta.chunks) || meta.chunks < 1) return 'unreadable';
  const keys = Array.from({ length: meta.chunks }, (_, i) => `${RESTORE_CHUNK_PREFIX}${i}`);
  const parts = (await AsyncStorage.multiGet(keys)) as [string, string | null][];
  if (parts.some(([, v]) => v === null)) return 'unreadable';
  const raw = parts.map(([, v]) => v as string).join('');
  if (hash(raw) !== meta.sha256) return 'unreadable';
  let snapshot: unknown;
  try { snapshot = JSON.parse(raw); } catch { return 'unreadable'; }
  if (!Array.isArray(snapshot) || !snapshot.every(p => Array.isArray(p) && p.length === 2 && typeof p[0] === 'string' && typeof p[1] === 'string' && isBackupKey(p[0]))) return 'unreadable';
  return { meta, snapshot: snapshot as [string, string][] };
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

export type RecoveryOutcome = 'none' | 'rolledBack' | 'completed' | 'unreadable';

async function recoverInner(): Promise<RecoveryOutcome> {
  const j = await readJournal();
  if (j === 'none') return 'none';
  if (j === 'unreadable') {
    // Cannot be used for a rollback. The meta is only written after its chunks were verified, so this means the
    // journal itself was damaged; the current data is left exactly as it is.
    await clearJournal();
    return 'unreadable';
  }
  if (j.meta.state === 'committed') { await clearJournal(); return 'completed'; }
  await applyExactly(j.snapshot); // throws → journal kept, retried on the next launch
  await clearJournal();
  return 'rolledBack';
}

/**
 * App start (App.tsx): a restore that was interrupted before it committed is rolled back to the data the phone had
 * before it. A committed restore only has its journal cleaned up.
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
    await recoverInner();
    let snapshot: [string, string][];
    try {
      const keys = await realBackupKeys();
      const pairs = keys.length ? ((await AsyncStorage.multiGet(keys)) as [string, string | null][]) : [];
      snapshot = pairs.filter((p): p is [string, string] => p[1] !== null);
      await writeJournal(snapshot);
    } catch (e) {
      await clearJournal().catch(() => undefined);
      throw new BackupError('snapshotFailed', e instanceof Error ? e.message : undefined);
    }
    try {
      await applyExactly(incoming);
    } catch (writeErr) {
      try {
        await applyExactly(snapshot);
        await clearJournal().catch(() => undefined);
      } catch {
        throw new BackupError('rollbackFailed', writeErr instanceof Error ? writeErr.message : undefined);
      }
      throw new BackupError('restoreRolledBack', writeErr instanceof Error ? writeErr.message : undefined);
    }
    // Commit point. If marking fails the new data is already verified; a later rollback on launch would still be
    // consistent (wholly old), so a failure here is not reported as a failed restore.
    try {
      const metaRaw = await AsyncStorage.getItem(RESTORE_META_KEY);
      if (metaRaw) await AsyncStorage.setItem(RESTORE_META_KEY, JSON.stringify({ ...(JSON.parse(metaRaw) as JournalMeta), state: 'committed' }));
      await clearJournal();
    } catch { /* recoverInterruptedRestore finishes the cleanup */ }
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
