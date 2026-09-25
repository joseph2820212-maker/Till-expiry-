/** Master handoff §23 / §31 backup tests (T44, T46–T53) against the real storage layer and real encryption. */
import { settleRecovery } from '../startupRecovery';
import { writeBlockReason } from '../../../storage/writeGate';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { encryptString, decryptString, base64ToBytes, bytesToBase64 } from '../../../backup/backupCrypto';
import { createWorkspace, getActiveWorkspace, __resetWorkspaceCache } from '../../workspaces/workspaceStore';
import { saveProduct } from '../../products/productStore';
import { saveRule } from '../../rules/ruleStore';
import { saveLocation } from '../../locations/locationStore';
import { createDatedBatch } from '../../batches/batchStore';
import { saveGeneral, getGeneral, __resetSettingsForTests } from '../../settings/settingsStore';
import { __setScopeForTests } from '../../../storage/scope';
import { DEVICE_KEYS, K } from '../../../storage/keys';
import {
  BackupError, buildBackup, checkBackupHeader, createBackup, parseBackup, previewBackup, recoverInterruptedRestore,
  restoreBackup, loadLastBackupPreparedAt, BACKUP_FORMAT, LAST_BACKUP_KEY, LAST_BACKUP_PREPARED_KEY, MAX_BACKUP_BYTES,
  RESTORE_META_KEY, type BackupErrorCode,
} from '../backupFile';
import { runStartupRecovery } from '../startupRecovery';
import { isBackupKey } from '../backupKeys';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

const mockCancelAll = jest.fn(async () => {});
const mockReconcile = jest.fn(async (_reason?: string) => ({}));
jest.mock('../../reminders/reminderService', () => ({
  cancelAllReminders: () => mockCancelAll(),
  reconcileReminders: (reason?: string) => mockReconcile(reason),
}));

jest.mock('expo-file-system/legacy', () => {
  const files: Record<string, string> = {};
  return {
    cacheDirectory: 'file:///cache/',
    documentDirectory: 'file:///docs/',
    EncodingType: { UTF8: 'utf8', Base64: 'base64' },
    writeAsStringAsync: jest.fn(async (uri: string, text: string) => { files[uri] = text; }),
    readAsStringAsync: jest.fn(async (uri: string) => { if (!(uri in files)) throw new Error('missing'); return files[uri]; }),
    getInfoAsync: jest.fn(async (uri: string) => ({ exists: uri in files, size: files[uri]?.length ?? 0, uri })),
  };
});
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(async () => true), shareAsync: jest.fn(async () => {}) }));

jest.setTimeout(60_000);

const store = AsyncStorage as any;
const PASS = 'correct horse 42';
const FILE = { uri: 'file:///picked/backup.tillexpiry', name: 'backup.tillexpiry' };

async function putFile(text: string) { await FileSystem.writeAsStringAsync(FILE.uri, text); }

/** Every key/value in storage, sorted — the whole phone state. */
async function dump(): Promise<string> {
  const keys = (await AsyncStorage.getAllKeys()) as string[];
  return JSON.stringify([...(await AsyncStorage.multiGet(keys))].sort((a, b) => a[0].localeCompare(b[0])));
}
/** Only the backup-able real keys. */
async function realData(): Promise<string> {
  const keys = ((await AsyncStorage.getAllKeys()) as string[]).filter(k => isBackupKey(k));
  return JSON.stringify([...(await AsyncStorage.multiGet(keys))].sort((a, b) => a[0].localeCompare(b[0])));
}

async function seed() {
  const a = await createWorkspace({ name: 'Corner Shop', mode: 'retail', currency: 'GBP', timeZone: 'Europe/London' });
  const fridge = await saveLocation(a.id, { name: 'Fridge 1', kind: 'fridge' });
  await saveRule(a.id, { name: 'Opened sauce', appliesTo: 'after_opening', class: 'hard_cutoff', durationMinutes: 3 * 1440, sourceText: 'Manufacturer label' });
  await createDatedBatch({ workspaceId: a.id, kind: 'bought_in', newProduct: { name: 'Milk 2L', barcodes: [{ code: '5000157024671' }] }, dateKind: 'use_by', deadline: { precision: 'date', date: '2026-10-01' }, quantity: 6, locationId: fridge.id });
  await createDatedBatch({ workspaceId: a.id, kind: 'bought_in', newProduct: { name: 'Biscuits' }, dateKind: 'best_before', deadline: { precision: 'month', month: '2027-03' } });
  const b = await createWorkspace({ name: 'Kitchen', mode: 'food_prep', currency: '', timeZone: 'Europe/London' }, { makeActive: false });
  await saveProduct(b.id, { name: 'Soup base' });
  await saveGeneral({ soonDays: 5 });
  return { a, b };
}

/** A structurally valid TillExpiry file around arbitrary inner data (to test validation of hostile content). */
function craft(data: Record<string, string>, over: Record<string, unknown> = {}): string {
  const createdAt = '2026-09-24T10:00:00.000Z';
  const enc = encryptString(JSON.stringify({ format: BACKUP_FORMAT, version: 1, createdAt, data }), PASS);
  return JSON.stringify({ format: BACKUP_FORMAT, version: 1, createdAt, appVersion: '0.1.0', enc, ...over });
}

async function expectCode(p: Promise<unknown>, code: BackupErrorCode) {
  await expect(p).rejects.toMatchObject({ name: 'BackupError', code });
}

/** Temporarily replace one AsyncStorage mock; `impl` receives the original implementation first. */
async function withStorageMock<T>(name: 'setItem' | 'removeItem' | 'multiSet' | 'getItem', impl: (orig: any, ...args: any[]) => Promise<unknown>, body: () => Promise<T>): Promise<T> {
  const m = (AsyncStorage as any)[name] as jest.Mock;
  const orig = m.getMockImplementation() as any;
  m.mockImplementation((...args: any[]) => impl(orig, ...args));
  try { return await body(); } finally { m.mockImplementation(orig); }
}

const journalKeys = async () => ((await AsyncStorage.getAllKeys()) as string[]).filter(k => k.startsWith('backup:restore:'));
const metaState = async () => { const raw = await AsyncStorage.getItem(RESTORE_META_KEY); return raw ? JSON.parse(raw).state : null; };

beforeEach(async () => {
  require('../../../storage/writeGate').clearWriteBlock();
  store.clear();
  __resetWorkspaceCache();
  __resetSettingsForTests();
  __setScopeForTests('real');
  mockCancelAll.mockClear();
  mockReconcile.mockClear();
});

let goodFile: string;
let goodState: string;
async function makeGood() {
  const { a, b } = await seed();
  const built = await buildBackup(PASS);
  goodFile = built.text;
  goodState = await realData();
  return { a, b, built };
}

describe('create', () => {
  it('writes an encrypted .tillexpiry file, opens the share sheet and records the time it was PREPARED', async () => {
    await seed();
    const r = await createBackup(PASS, new Date(2026, 8, 24, 9, 5));
    expect(r.fileName).toBe('TillExpiry-backup-2026-09-24-0905.tillexpiry');
    expect(r.shared).toBe(true);
    expect(Sharing.shareAsync).toHaveBeenCalledWith(r.uri, expect.objectContaining({ mimeType: 'application/json' }));
    const text = await FileSystem.readAsStringAsync(r.uri);
    const outer = JSON.parse(text);
    expect(Object.keys(outer).sort()).toEqual(['appVersion', 'createdAt', 'enc', 'format', 'version']);
    expect(outer).toMatchObject({ format: 'tillexpiry', version: 1 });
    expect(text).not.toContain('Milk'); // business data only inside the ciphertext
    expect(await AsyncStorage.getItem(LAST_BACKUP_PREPARED_KEY)).toBe(r.createdAt);
    expect(await loadLastBackupPreparedAt()).toBe(r.createdAt);
  });

  it('the legacy "last backup" value is read as the last PREPARED time', async () => {
    expect(await loadLastBackupPreparedAt()).toBeNull();
    await AsyncStorage.setItem(LAST_BACKUP_KEY, '2026-01-02T03:04:05.000Z');
    expect(await loadLastBackupPreparedAt()).toBe('2026-01-02T03:04:05.000Z');
    await AsyncStorage.setItem(LAST_BACKUP_PREPARED_KEY, '2026-05-05T05:05:05.000Z');
    expect(await loadLastBackupPreparedAt()).toBe('2026-05-05T05:05:05.000Z');
  });

  it('device keys, demo keys and unknown / corrupt keys are never exported', async () => {
    await seed();
    const extra: [string, string][] = [
      [DEVICE_KEYS.reminderIds, '["n1"]'], [DEVICE_KEYS.reminderState, '{}'], [DEVICE_KEYS.snoozes, '{}'],
      [DEVICE_KEYS.txnJournal, '{"v":1,"snapshot":[]}'], [DEVICE_KEYS.scope, 'real'], [DEVICE_KEYS.demoMeta, '{}'],
      ['app:language', 'fr'], ['demo:workspaces:index', '["ws_demo"]'], ['demo:products:item:p_demo', '{"id":"p_demo"}'],
      ['backup:lastCreatedAt', '2026-01-01'], ['settings:currency', 'GBP'], ['products:item:p1:corrupt:123:abc', '{'],
      ['billing:last_verified_entitlement', '{"isPremium":true}'],
    ];
    await AsyncStorage.multiSet(extra);
    const built = await buildBackup(PASS);
    const inner = JSON.parse(decryptString(JSON.parse(built.text).enc, PASS));
    const keys = Object.keys(inner.data);
    expect(keys.length).toBeGreaterThan(10);
    for (const k of keys) expect(isBackupKey(k)).toBe(true);
    for (const [k] of extra) expect(keys).not.toContain(k);
    expect(keys.some(k => k.startsWith('demo:'))).toBe(false);
  });

  it('REV-05 a corrupt stored product blocks the backup: no file, no share sheet, no "prepared" time', async () => {
    const { a } = await seed();
    const p = await saveProduct(a.id, { name: 'Tea' });
    await AsyncStorage.setItem(K.item('products', p.id), '{not json');
    (FileSystem.writeAsStringAsync as jest.Mock).mockClear();
    (Sharing.shareAsync as jest.Mock).mockClear();
    const err = await createBackup(PASS).catch(e => e);
    expect(err).toMatchObject({ name: 'BackupError', code: 'backupBlocked', categories: ['products'] });
    expect(FileSystem.writeAsStringAsync).not.toHaveBeenCalled();
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
    expect(await loadLastBackupPreparedAt()).toBeNull();
    // The stored data is untouched (nothing is "repaired" or dropped).
    expect(await AsyncStorage.getItem(K.item('products', p.id))).toBe('{not json');
  });

  it('REV-05 an index listing a missing item blocks the backup (category reported)', async () => {
    const { a } = await seed();
    const ids = JSON.parse((await AsyncStorage.getItem(K.index('products', a.id)))!);
    await AsyncStorage.setItem(K.index('products', a.id), JSON.stringify([...ids, 'p_missing']));
    await expect(buildBackup(PASS)).rejects.toMatchObject({ code: 'backupBlocked', categories: ['products'] });
  });

  it('REV-05 an orphan item (listed in no index) blocks the backup', async () => {
    const { a } = await seed();
    const ids: string[] = JSON.parse((await AsyncStorage.getItem(K.index('locations', a.id)))!);
    await AsyncStorage.setItem(K.index('locations', a.id), JSON.stringify(ids.slice(1)));
    await expect(buildBackup(PASS)).rejects.toMatchObject({ code: 'backupBlocked', categories: ['locations'] });
  });

  it('REV-05 a broken per-batch event list or active workspace blocks the backup', async () => {
    const { a, b } = await seed();
    const batchIds: string[] = JSON.parse((await AsyncStorage.getItem(K.index('batches', a.id)))!);
    const listKey = K.batchEvents(batchIds[0]);
    const list = await AsyncStorage.getItem(listKey);
    await AsyncStorage.setItem(listKey, '[]'); // its events are now listed nowhere for that batch
    await expect(buildBackup(PASS)).rejects.toMatchObject({ code: 'backupBlocked', categories: ['events'] });
    await AsyncStorage.setItem(listKey, list!);
    await buildBackup(PASS); // repaired → allowed again
    await AsyncStorage.setItem(K.workspace(b.id), JSON.stringify({ ...JSON.parse((await AsyncStorage.getItem(K.workspace(b.id)))!), status: 'hidden' }));
    await AsyncStorage.setItem(K.workspacesActive, JSON.stringify(b.id)); // active points at a hidden workspace
    await expect(buildBackup(PASS)).rejects.toMatchObject({ code: 'backupBlocked', categories: ['workspaces'] });
  });

  it('REV-05 no valid record disappears from a normal backup (file data = every real business key)', async () => {
    await seed();
    const built = await buildBackup(PASS);
    const inner = JSON.parse(decryptString(JSON.parse(built.text).enc, PASS));
    expect(JSON.stringify(Object.entries(inner.data).sort((x, y) => x[0].localeCompare(y[0])))).toBe(await realData());
    expect(built.keyCount).toBe(Object.keys(inner.data).length);
  });

  it('refuses in the demo and with no passphrase', async () => {
    await seed();
    await expectCode(buildBackup(''), 'passphraseRequired');
    __setScopeForTests('demo');
    await expectCode(createBackup(PASS), 'demoActive');
  });
});

describe('T46 round trip and preview', () => {
  it('restores exactly the data that was backed up, replacing everything added since', async () => {
    const { a } = await makeGood();
    // Change the phone after the backup: new product, edited settings, a deleted record.
    await saveProduct(a.id, { name: 'Added later' });
    await saveGeneral({ soonDays: 9 });
    const c = await createWorkspace({ name: 'Third shop', mode: 'mixed', timeZone: 'Europe/London' });
    expect(await realData()).not.toBe(goodState);
    await putFile(goodFile);

    const preview = await previewBackup(FILE, PASS);
    const corner = preview.workspaces.find(w => w.name === 'Corner Shop')!;
    expect(corner).toMatchObject({ products: 2, batches: 2, rules: 1, locations: 1 });
    expect(corner.events).toBeGreaterThanOrEqual(2);
    expect(preview.workspaces.find(w => w.name === 'Kitchen')).toMatchObject({ products: 1, batches: 0 });
    expect(preview.workspaces.map(w => w.id)).not.toContain(c.id);

    const r = await restoreBackup(FILE, PASS);
    expect(r.remindersOk).toBe(true);
    expect(await realData()).toBe(goodState);
    expect(getGeneral().soonDays).toBe(5); // settings cache reloaded
    expect(getActiveWorkspace()?.id).toBe(a.id); // active workspace reloaded (the third shop is gone)
    expect(await AsyncStorage.getItem(RESTORE_META_KEY)).toBeNull();
    expect(((await AsyncStorage.getAllKeys()) as string[]).some(k => k.startsWith('backup:restore:'))).toBe(false);
  });

  it('T44 reminders: every old notification is cancelled, then reconciled from the restored data', async () => {
    await makeGood();
    await putFile(goodFile);
    await restoreBackup(FILE, PASS);
    expect(mockCancelAll).toHaveBeenCalledTimes(1);
    expect(mockReconcile).toHaveBeenCalledWith('restore');
    expect(mockCancelAll.mock.invocationCallOrder[0]).toBeLessThan(mockReconcile.mock.invocationCallOrder[0]);
  });

  it('a reminder failure after a good restore keeps the data and is reported', async () => {
    await makeGood();
    await putFile(goodFile);
    mockReconcile.mockRejectedValueOnce(new Error('no permission'));
    const r = await restoreBackup(FILE, PASS);
    expect(r.remindersOk).toBe(false);
    expect(await realData()).toBe(goodState);
  });

  it('device and demo keys on the phone are not touched by a restore', async () => {
    await makeGood();
    await AsyncStorage.multiSet([[DEVICE_KEYS.reminderIds, '["n1"]'], ['demo:products:item:p_demo', '{"id":"p_demo"}'], ['app:language', 'ar'], ['settings:currency', 'EUR']]);
    await putFile(goodFile);
    await restoreBackup(FILE, PASS);
    expect(await AsyncStorage.getItem(DEVICE_KEYS.reminderIds)).toBe('["n1"]');
    expect(await AsyncStorage.getItem('demo:products:item:p_demo')).toBe('{"id":"p_demo"}');
    expect(await AsyncStorage.getItem('app:language')).toBe('ar');
    expect(await AsyncStorage.getItem('settings:currency')).toBe('EUR');
  });

  it('restore is refused while the demo is active', async () => {
    await makeGood();
    await putFile(goodFile);
    __setScopeForTests('demo');
    await expectCode(restoreBackup(FILE, PASS), 'demoActive');
  });
});

describe('T47 wrong passphrase and tampering', () => {
  it('a wrong passphrase fails without changing anything', async () => {
    await makeGood();
    const before = await dump();
    await putFile(goodFile);
    (AsyncStorage.multiSet as jest.Mock).mockClear();
    await expectCode(restoreBackup(FILE, 'wrong passphrase'), 'wrongPassphrase');
    await expectCode(previewBackup(FILE, 'wrong passphrase'), 'wrongPassphrase');
    await expectCode(restoreBackup(FILE, ''), 'passphraseRequired');
    expect(AsyncStorage.multiSet).not.toHaveBeenCalled();
    expect(await dump()).toBe(before);
    expect(mockCancelAll).not.toHaveBeenCalled();
  });

  it('a tampered ciphertext or an edited header is rejected', async () => {
    await makeGood();
    const outer = JSON.parse(goodFile);
    const ct = base64ToBytes(outer.enc.ciphertext);
    ct[10] ^= 0x01;
    await putFile(JSON.stringify({ ...outer, enc: { ...outer.enc, ciphertext: bytesToBase64(ct) } }));
    await expectCode(restoreBackup(FILE, PASS), 'wrongPassphrase');
    await putFile(JSON.stringify({ ...outer, createdAt: '2020-01-01T00:00:00.000Z' }));
    await expectCode(restoreBackup(FILE, PASS), 'invalidContent');
    await putFile(JSON.stringify({ ...outer, enc: { ...outer.enc, N: 1 << 20 } }));
    await expectCode(restoreBackup(FILE, PASS), 'invalidContent');
    expect(await realData()).toBe(goodState);
  });
});

describe('T48 malformed and T49 oversized files', () => {
  it.each([
    ['not json', 'invalidJson'],
    ['[]', 'notTillExpiry'],
    ['{}', 'notTillExpiry'],
    ['{"format":"somethingelse","version":1}', 'notTillExpiry'],
    ['{"format":"tillexpiry","version":2,"createdAt":"x","appVersion":"1","enc":{}}', 'unsupportedVersion'],
    ['{"format":"tillexpiry","version":1,"createdAt":"x","appVersion":"1"}', 'invalidContent'],
    ['{"format":"tillexpiry","version":1,"createdAt":"x","appVersion":"1","enc":{"kdf":"none"}}', 'invalidContent'],
    ['{"format":"tillexpiry","version":1,"createdAt":"x","appVersion":"1","enc":{},"data":{}}', 'invalidContent'],
  ])('%s → %s', async (text, code) => {
    await putFile(text);
    await expectCode(restoreBackup(FILE, PASS), code as BackupErrorCode);
  });

  it('an unreadable file is reported', async () => {
    await expectCode(restoreBackup({ uri: 'file:///missing' }, PASS), 'fileUnreadable');
  });

  it('an oversized file is refused before it is read', async () => {
    const read = FileSystem.readAsStringAsync as jest.Mock;
    read.mockClear();
    await expectCode(previewBackup({ ...FILE, size: MAX_BACKUP_BYTES + 1 }, PASS), 'tooLarge');
    (FileSystem.getInfoAsync as jest.Mock).mockResolvedValueOnce({ exists: true, size: 300 * 1024 * 1024 });
    await expectCode(restoreBackup(FILE, PASS), 'tooLarge');
    expect(read).not.toHaveBeenCalled();
    expect(() => checkBackupHeader(' '.repeat(MAX_BACKUP_BYTES + 1))).toThrow(BackupError);
  });
});

describe('T50 other apps', () => {
  it('TillCalc, Till Note and TillLabel backups are refused with their own message', async () => {
    const enc = encryptString('{"data":{}}', PASS);
    // TillCalc (`e7ea8caa` src/modules/backup/backupFile.ts): format 'tillcalc', version 2.
    await putFile(JSON.stringify({ format: 'tillcalc', version: 2, createdAt: 'x', appVersion: '1.0.0', entityCounts: {}, enc }));
    await expectCode(restoreBackup(FILE, PASS), 'tillCalcBackup');
    // Till Note (`6fa6e941` settingsBackup/utils/backupFile.ts): no format field; v2 encrypted and v1 plaintext.
    await putFile(JSON.stringify({ version: 2, createdAt: 'x', entityCounts: { sales: 1 }, totalRecords: 1, enc }));
    await expectCode(restoreBackup(FILE, PASS), 'tillNoteBackup');
    await putFile(JSON.stringify({ version: 1, createdAt: 'x', entityCounts: {}, totalRecords: 1, checksum: 1, fileAssets: [], data: { 'settings:shop': '{}' } }));
    await expectCode(restoreBackup(FILE, PASS), 'tillNoteBackup');
    await putFile('{"format":"tillnote","version":1,"data":{"settings:x":"1"}}');
    await expectCode(restoreBackup(FILE, PASS), 'tillNoteBackup');
    await putFile(JSON.stringify({ format: 'tilllabel', version: 2, createdAt: 'x', appVersion: '0.1.0', enc }));
    await expectCode(restoreBackup(FILE, PASS), 'otherAppBackup');
  });
});

describe('allowlist and record validation', () => {
  const ws = (id: string, name = 'Shop') => JSON.stringify({ id, name, mode: 'retail', currency: '', timeZone: 'Europe/London', status: 'active', isDefault: true, createdAt: 'x', updatedAt: 'x' });
  const product = (id: string, workspaceId: string) => JSON.stringify({ id, workspaceId, name: 'Tea', barcodes: [], trackingUnit: 'each', status: 'active', createdAt: 'x', updatedAt: 'x', schemaVersion: 1 });
  const base = () => ({ 'workspaces:index': '["ws_a"]', 'workspaces:active': '"ws_a"', 'workspaces:item:ws_a': ws('ws_a') });
  const validBatch = (id: string, workspaceId: string) => ({
    id, workspaceId, productId: 'p1', productName: 'Tea', kind: 'bought_in', status: 'active', timeZone: 'Europe/London',
    dateKind: 'use_by', datePrecision: 'date', printedDate: '2026-10-01',
    effective: { dateKind: 'use_by', deadline: { precision: 'date', date: '2026-10-01' }, reason: 'printed' },
    createdAt: 'x', updatedAt: 'x', schemaVersion: 1,
  });

  it('REV-05 referential rules are enforced on restore (index ↔ item, orphans, active, per-batch events)', () => {
    const batch = (id: string, workspaceId: string, extra: Record<string, unknown> = {}) => JSON.stringify({ ...validBatch(id, workspaceId), ...extra });
    const event = (id: string, batchId: string, workspaceId = 'ws_a') => JSON.stringify({ id, workspaceId, batchId, type: 'created', at: 'x' });
    const good = () => ({
      ...base(), 'products:index:ws_a': '["p1"]', 'products:item:p1': product('p1', 'ws_a'),
      'batches:index:ws_a': '["b1"]', 'batches:item:b1': batch('b1', 'ws_a'),
      'events:index:ws_a': '["e1"]', 'events:item:e1': event('e1', 'b1'), 'events:batch:b1': '["e1"]',
    });
    expect(() => parseBackup(craft(good()), PASS)).not.toThrow();
    const bad = (over: Record<string, string | undefined>) => () => {
      const d: Record<string, string> = { ...good() };
      for (const [k, v] of Object.entries(over)) { if (v === undefined) delete d[k]; else d[k] = v; }
      return parseBackup(craft(d), PASS);
    };
    const invalid = expect.objectContaining({ code: 'recordInvalid' });
    expect(bad({ 'products:index:ws_a': '["p1","p2"]' })).toThrow(invalid); // index → missing item
    expect(bad({ 'products:index:ws_a': '[]' })).toThrow(invalid); // orphan item
    expect(bad({ 'workspaces:index': '[]' })).toThrow(invalid); // orphan workspace
    expect(bad({ 'workspaces:index': '["ws_a","ws_x"]' })).toThrow(invalid); // index → missing workspace
    expect(bad({ 'workspaces:active': undefined })).toThrow(invalid); // no active workspace
    expect(bad({ 'workspaces:active': '"ws_x"' })).toThrow(invalid); // active not present
    expect(bad({ 'workspaces:item:ws_a': JSON.stringify({ ...JSON.parse(ws('ws_a')), status: 'hidden' }) })).toThrow(invalid); // active hidden
    expect(bad({ 'events:batch:b1': undefined })).toThrow(invalid); // event listed in no batch list
    expect(bad({ 'events:batch:b9': '["e1"]' })).toThrow(invalid); // list of a batch that does not exist
    expect(bad({ 'events:item:e1': event('e1', 'b9'), 'events:batch:b1': '["e1"]' })).toThrow(invalid); // event of another batch
    expect(bad({ 'events:batch:b1': '["e1","e2"]' })).toThrow(invalid); // list → missing event
    // P1-REOPEN audit: same-workspace references and real deadline structures / time zones.
    expect(bad({ 'batches:item:b1': batch('b1', 'ws_a', { productId: 'p9' }) })).toThrow(invalid); // unknown product
    expect(bad({ 'batches:item:b1': batch('b1', 'ws_a', { parentBatchId: 'b9' }) })).toThrow(invalid); // missing original pack
    expect(bad({ 'batches:item:b1': batch('b1', 'ws_a', { sourceBatchIds: ['b9'] }) })).toThrow(invalid); // missing source batch
    expect(bad({ 'batches:item:b1': batch('b1', 'ws_a', { timeZone: 'Mars/Olympus' }) })).toThrow(invalid); // bad zone
    expect(bad({ 'batches:item:b1': batch('b1', 'ws_a', { effective: { dateKind: 'use_by', reason: 'printed' } }) })).toThrow(invalid); // use-by without a date
    expect(bad({ 'batches:item:b1': batch('b1', 'ws_a', { effective: { dateKind: 'use_by', deadline: { precision: 'month', month: '2026-10' }, reason: 'printed' } }) })).toThrow(invalid); // month-only use-by
    expect(bad({ 'batches:item:b1': batch('b1', 'ws_a', { effective: { dateKind: 'use_by', deadline: { precision: 'date', date: '2026-02-30' }, reason: 'printed' } }) })).toThrow(invalid); // not a real day
    expect(bad({ 'batches:item:b1': batch('b1', 'ws_a', { printedDate: '31/10/2026' }) })).toThrow(invalid); // own date malformed
    expect(bad({ 'workspaces:item:ws_a': JSON.stringify({ ...JSON.parse(ws('ws_a')), timeZone: 'Nowhere/Land' }) })).toThrow(invalid); // workspace zone
  });

  it('optional money and import fields: accepted when absent or well-formed, refused when malformed', () => {
    const batch = JSON.stringify(validBatch('b1', 'ws_a'));
    const ev = (extra: Record<string, unknown>) => JSON.stringify({ id: 'e1', workspaceId: 'ws_a', batchId: 'b1', type: 'wasted', at: 'x', ...extra });
    const imp = (extra: Record<string, unknown>) => JSON.stringify({ id: 'i1', workspaceId: 'ws_a', kind: 'products', fileName: 'a.csv', fingerprint: 'f', createdCount: 1, skippedCount: 0, at: 'x', ...extra });
    const file = (e: string, i: string) => craft({
      ...base(), 'products:index:ws_a': '["p1"]', 'products:item:p1': product('p1', 'ws_a'),
      'batches:index:ws_a': '["b1"]', 'batches:item:b1': batch, 'events:index:ws_a': '["e1"]', 'events:item:e1': e, 'events:batch:b1': '["e1"]',
      'imports:index:ws_a': '["i1"]', 'imports:item:i1': i,
    });
    expect(() => parseBackup(file(ev({}), imp({})), PASS)).not.toThrow(); // older records without the new fields
    expect(() => parseBackup(file(ev({ unitCost: { minor: 125, currency: 'GBP' } }), imp({ updatedCount: 2, errorCount: 0, newProductCount: 1, newLocationCount: 0, requestId: 'req_1' })), PASS)).not.toThrow();
    const invalid = expect.objectContaining({ code: 'recordInvalid' });
    expect(() => parseBackup(file(ev({ unitCost: { minor: 1.25, currency: 'GBP' } }), imp({})), PASS)).toThrow(invalid);
    expect(() => parseBackup(file(ev({ unitCost: { minor: 125 } }), imp({})), PASS)).toThrow(invalid);
    expect(() => parseBackup(file(ev({ unitCost: 1.25 }), imp({})), PASS)).toThrow(invalid);
    expect(() => parseBackup(file(ev({}), imp({ errorCount: -1 })), PASS)).toThrow(invalid);
    expect(() => parseBackup(file(ev({}), imp({ requestId: 7 })), PASS)).toThrow(invalid);
  });

  it('a minimal hand-made valid file parses', () => {
    const p = parseBackup(craft({ ...base(), 'products:index:ws_a': '["p1"]', 'products:item:p1': product('p1', 'ws_a') }), PASS);
    expect(p.workspaces).toEqual([expect.objectContaining({ id: 'ws_a', products: 1 })]);
  });

  it.each([
    ['app:reminderIds', '["n1"]'],
    ['journal:txn', '{}'],
    ['demo:products:item:p1', '{}'],
    ['backup:restore:meta', '{}'],
    ['billing:last_verified_entitlement', '{"isPremium":true}'],
    ['products:item:p1:corrupt:1:abc', '{}'],
    ['settings:currency', '"GBP"'],
    ['__proto__', '{}'],
  ])('unknown key %s rejects the whole file', async (key, value) => {
    const data: Record<string, string> = base();
    Object.defineProperty(data, key, { value, enumerable: true }); // an own key even for "__proto__"
    await putFile(craft(data));
    expect(await FileSystem.readAsStringAsync(FILE.uri)).toBeTruthy();
    await expectCode(restoreBackup(FILE, PASS), 'keyNotAllowed');
  });

  it('records failing shape validation reject the file', () => {
    const bad = (extra: Record<string, string>) => () => parseBackup(craft({ ...base(), ...extra }), PASS);
    expect(bad({ 'products:item:p1': '{"id":"p1","workspaceId":"ws_a"}' })).toThrow(expect.objectContaining({ code: 'recordInvalid' }));
    expect(bad({ 'products:item:p1': 'not json' })).toThrow(expect.objectContaining({ code: 'recordInvalid' }));
    expect(bad({ 'settings:general': '[1,2]' })).toThrow(expect.objectContaining({ code: 'recordInvalid' }));
    expect(bad({ 'products:index:ws_a': '{"a":1}' })).toThrow(expect.objectContaining({ code: 'recordInvalid' }));
    expect(bad({ 'workspaces:item:ws_a': '{"id":"ws_a"}' })).toThrow(expect.objectContaining({ code: 'recordInvalid' }));
    expect(() => parseBackup(craft({ 'settings:general': '{}' }), PASS)).toThrow(expect.objectContaining({ code: 'emptyBackup' }));
  });

  it('T52 duplicate and colliding ids are refused', () => {
    const bad = (extra: Record<string, string>) => () => parseBackup(craft({ ...base(), 'workspaces:item:ws_b': ws('ws_b', 'Other'), ...extra }), PASS);
    // A record stored under another record's id.
    expect(bad({ 'products:item:p1': product('p2', 'ws_a') })).toThrow(expect.objectContaining({ code: 'recordInvalid' }));
    // The same id twice in one index.
    expect(bad({ 'products:index:ws_a': '["p1","p1"]', 'products:item:p1': product('p1', 'ws_a') })).toThrow(expect.objectContaining({ code: 'recordInvalid' }));
    // One workspace's index listing another workspace's record.
    expect(bad({ 'products:index:ws_a': '["p1"]', 'products:item:p1': product('p1', 'ws_b') })).toThrow(expect.objectContaining({ code: 'recordInvalid' }));
    // A record of a workspace that is not in the file.
    expect(bad({ 'products:item:p1': product('p1', 'ws_zzz') })).toThrow(expect.objectContaining({ code: 'recordInvalid' }));
    expect(bad({ 'products:index:ws_zzz': '[]' })).toThrow(expect.objectContaining({ code: 'recordInvalid' }));
  });
});

describe('T51 / T53 rollback and interrupted restore', () => {
  it('T53 an injected write failure rolls every key back to the current real data', async () => {
    await makeGood();
    const { a } = { a: getActiveWorkspace()! };
    await saveProduct(a.id, { name: 'Current only' });
    const before = await dump();
    await putFile(goodFile);
    const multiSet = AsyncStorage.multiSet as jest.Mock;
    const original = multiSet.getMockImplementation() as any;
    let call = 0;
    multiSet.mockImplementation(async (pairs: [string, string][]) => {
      call += 1;
      if (call === 2) { await original(pairs.slice(0, 3)); throw new Error('disk full'); } // call 1 = journal
      return original(pairs);
    });
    try {
      await expectCode(restoreBackup(FILE, PASS), 'restoreRolledBack');
    } finally { multiSet.mockImplementation(original); }
    expect(await dump()).toBe(before);
    expect(mockCancelAll).not.toHaveBeenCalled();
    expect(mockReconcile).not.toHaveBeenCalled();
  });

  it('T51 a restore interrupted mid-write is rolled back on the next launch', async () => {
    await makeGood();
    const { a } = { a: getActiveWorkspace()! };
    await saveProduct(a.id, { name: 'Current only' });
    const before = await realData();
    await putFile(goodFile);
    const multiSet = AsyncStorage.multiSet as jest.Mock;
    const original = multiSet.getMockImplementation() as any;
    let call = 0;
    // Write half of the file's data, then fail; the in-process rollback fails too (as if the app died).
    multiSet.mockImplementation(async (pairs: [string, string][]) => {
      call += 1;
      if (call === 2) { await original(pairs.slice(0, Math.ceil(pairs.length / 2))); throw new Error('killed'); }
      if (call === 3) throw new Error('killed');
      return original(pairs);
    });
    try {
      await expectCode(restoreBackup(FILE, PASS), 'rollbackFailed');
    } finally { multiSet.mockImplementation(original); }
    expect(await realData()).not.toBe(before); // half-written
    expect(await AsyncStorage.getItem(RESTORE_META_KEY)).not.toBeNull();
    expect(await recoverInterruptedRestore()).toBe('rolledBack');
    expect(await realData()).toBe(before);
    expect(await AsyncStorage.getItem(RESTORE_META_KEY)).toBeNull();
    expect(await recoverInterruptedRestore()).toBe('none');
  });

  it('a committed journal is only cleaned up (no chunks needed); a damaged prepared journal is KEPT and blocks', async () => {
    await makeGood();
    const state = await realData();
    const raw = JSON.stringify([[K.workspacesIndex, '[]']]);
    const meta = (m: Record<string, unknown>) => JSON.stringify({ v: 1, state: 'committed', chunks: 1, sha256: bytesToHex(sha256(utf8ToBytes(raw))), keyCount: 1, startedAt: 'x', ...m });
    await AsyncStorage.multiSet([['backup:restore:chunk:0', 'damaged'], [RESTORE_META_KEY, meta({})]]);
    expect(await recoverInterruptedRestore()).toBe('completed');
    expect(await realData()).toBe(state);
    expect(await journalKeys()).toEqual([]);
    // A damaged prepared journal (hash mismatch) is never used to overwrite data, and never discarded either.
    await AsyncStorage.multiSet([['backup:restore:chunk:0', raw], [RESTORE_META_KEY, meta({ state: 'prepared', sha256: 'bad' })]]);
    await expectCode(recoverInterruptedRestore(), 'recoveryRequired');
    expect(await runStartupRecovery()).toEqual({ status: 'recoveryRequired', reason: 'journalUnreadable' });
    expect(await realData()).toBe(state);
    expect((await journalKeys()).sort()).toEqual(['backup:restore:chunk:0', RESTORE_META_KEY].sort());
    // An unparseable meta is kept and blocks too; a new restore refuses to overwrite it.
    await AsyncStorage.setItem(RESTORE_META_KEY, '{oops');
    await putFile(goodFile);
    await expectCode(restoreBackup(FILE, PASS), 'recoveryRequired');
    expect(await AsyncStorage.getItem(RESTORE_META_KEY)).toBe('{oops');
    expect(await realData()).toBe(state);
  });

  it('after an unsettled restore the app is blocked; Retry settles (rolls back) and only then a new restore runs cleanly', async () => {
    await makeGood();
    await putFile(goodFile);
    const multiSet = AsyncStorage.multiSet as jest.Mock;
    const original = multiSet.getMockImplementation() as any;
    let call = 0;
    multiSet.mockImplementation(async (pairs: [string, string][]) => {
      call += 1;
      if (call === 2) { await original(pairs.slice(0, 2)); throw new Error('killed'); }
      if (call === 3) throw new Error('killed');
      return original(pairs);
    });
    try { await expectCode(restoreBackup(FILE, PASS), 'rollbackFailed'); } finally { multiSet.mockImplementation(original); }
    // P1-REOPEN-02: unsettled → gate closed: no restore and no business write until Retry settles the journal.
    expect(writeBlockReason()).toBe('rollbackFailed');
    await expect(restoreBackup(FILE, PASS)).rejects.toMatchObject({ code: 'recoveryRequired' });
    expect((await settleRecovery(async () => undefined)).status).toBe('ready');
    expect(writeBlockReason()).toBeNull();
    await restoreBackup(FILE, PASS);
    expect(await realData()).toBe(goodState);
    expect(await AsyncStorage.getItem(RESTORE_META_KEY)).toBeNull();
  });
});

/** removeItem of the journal meta fails once the journal is committed (cleanup after a verified commit). */
async function failCleanupAfterCommit(orig: any, k: string) {
  if (k === RESTORE_META_KEY && (await metaState()) === 'committed') throw new Error('io');
  return orig(k);
}

/** Restore the good file on top of a changed phone: `before` is the phone state the restore must replace. */
async function preparedPhone() {
  await makeGood();
  const a = getActiveWorkspace()!;
  await saveProduct(a.id, { name: 'Current only' });
  const before = await realData();
  await putFile(goodFile);
  return before;
}

describe('REV-03 durable commit point', () => {
  it('data written and verified but the commit marker write FAILS → no success, old data restored now', async () => {
    const before = await preparedPhone();
    await withStorageMock('setItem', (orig, k: string, v: string) => (k === RESTORE_META_KEY && v.includes('"committed"') ? Promise.reject(new Error('disk full')) : orig(k, v)),
      () => expectCode(restoreBackup(FILE, PASS), 'restoreRolledBack'));
    expect(await realData()).toBe(before);
    expect(await journalKeys()).toEqual([]);
    expect(mockCancelAll).not.toHaveBeenCalled();
    // Next launch: nothing to do, the phone keeps the old data (never "success then revert", never "revert then success").
    expect(await recoverInterruptedRestore()).toBe('none');
    expect(await realData()).toBe(before);
  });

  it('a commit marker that is silently NOT persisted (read-back differs) is treated as not committed', async () => {
    const before = await preparedPhone();
    await withStorageMock('setItem', (orig, k: string, v: string) => (k === RESTORE_META_KEY && v.includes('"committed"') ? Promise.resolve() : orig(k, v)),
      () => expectCode(restoreBackup(FILE, PASS), 'restoreRolledBack'));
    expect(await realData()).toBe(before);
    expect(await recoverInterruptedRestore()).toBe('none');
    expect(await realData()).toBe(before);
  });

  it('commit marker fails AND the rollback fails → no success; the prepared journal rolls back on the next launch', async () => {
    const before = await preparedPhone();
    let multiSetCalls = 0;
    await withStorageMock('multiSet', (orig, pairs) => { multiSetCalls += 1; return multiSetCalls === 3 ? Promise.reject(new Error('killed')) : orig(pairs); }, () =>
      withStorageMock('setItem', (orig, k: string, v: string) => (k === RESTORE_META_KEY && v.includes('"committed"') ? Promise.reject(new Error('disk full')) : orig(k, v)),
        () => expectCode(restoreBackup(FILE, PASS), 'rollbackFailed')));
    expect(await realData()).toBe(goodState); // wholly new, never a mix
    expect(await metaState()).toBe('prepared');
    expect(await recoverInterruptedRestore()).toBe('rolledBack');
    expect(await realData()).toBe(before);
    expect(await journalKeys()).toEqual([]);
  });

  it('when even the "prepared" marker cannot be verified the data stays wholly new and the result is unconfirmed', async () => {
    const before = await preparedPhone();
    let metaWrites = 0;
    await withStorageMock('setItem', (orig, k: string, v: string) => {
      if (k !== RESTORE_META_KEY) return orig(k, v);
      metaWrites += 1;
      return metaWrites === 1 ? orig(k, v) : Promise.reject(new Error('disk full'));
    }, () => expectCode(restoreBackup(FILE, PASS), 'restoreUnconfirmed'));
    expect(await realData()).toBe(goodState);
    expect(mockCancelAll).not.toHaveBeenCalled();
    // The marker on disk still reads prepared → the next launch deterministically picks the OLD whole state.
    expect(await metaState()).toBe('prepared');
    expect(await recoverInterruptedRestore()).toBe('rolledBack');
    expect(await realData()).toBe(before);
  });

  it('restart recovery: prepared journal → old data; committed journal → new data kept', async () => {
    // prepared: the new data is fully written and verified but the commit marker never landed (and the in-process
    // rollback died too) → the next launch picks the OLD whole state.
    const before = await preparedPhone();
    let multiSetCalls = 0;
    await withStorageMock('multiSet', (orig, pairs) => { multiSetCalls += 1; return multiSetCalls === 3 ? Promise.reject(new Error('killed')) : orig(pairs); }, () =>
      withStorageMock('setItem', (orig, k: string, v: string) => (k === RESTORE_META_KEY && v.includes('"committed"') ? Promise.reject(new Error('killed')) : orig(k, v)),
        () => expectCode(restoreBackup(FILE, PASS), 'rollbackFailed')));
    expect(await metaState()).toBe('prepared');
    expect(await realData()).toBe(goodState);
    expect(writeBlockReason()).toBe('rollbackFailed');
    expect(await settleRecovery(async () => undefined)).toEqual({ status: 'ready', outcome: 'rolledBack' });
    expect(await realData()).toBe(before);

    // committed: the commit is verified, then the journal cleanup fails.
    await withStorageMock('removeItem', failCleanupAfterCommit, async () => {
      const r = await restoreBackup(FILE, PASS);
      expect(r.keyCount).toBeGreaterThan(0);
    });
    expect(await metaState()).toBe('committed');
    expect(await realData()).toBe(goodState);
    expect(await recoverInterruptedRestore()).toBe('completed');
    expect(await realData()).toBe(goodState);
    expect(await journalKeys()).toEqual([]);
  });

  it('cleanup failure after a verified commit → success, and the next launch KEEPS the new data', async () => {
    await preparedPhone();
    await withStorageMock('removeItem', failCleanupAfterCommit, async () => {
      await restoreBackup(FILE, PASS);
    });
    expect(await realData()).toBe(goodState);
    expect(await metaState()).toBe('committed');
    expect(await runStartupRecovery()).toEqual({ status: 'ready', outcome: 'completed' });
    expect(await realData()).toBe(goodState);
    expect(await journalKeys()).toEqual([]);
  });
});

describe('REV-04 startup recovery gate', () => {
  /** A restore that died mid-write with its in-process rollback failing: journal `prepared`, data half-written. */
  async function interrupted() {
    const before = await preparedPhone();
    let call = 0;
    await withStorageMock('multiSet', (orig, pairs: [string, string][]) => {
      call += 1;
      if (call === 2) return orig(pairs.slice(0, Math.ceil(pairs.length / 2))).then(() => { throw new Error('killed'); });
      if (call === 3) return Promise.reject(new Error('killed'));
      return orig(pairs);
    }, () => expectCode(restoreBackup(FILE, PASS), 'rollbackFailed'));
    const half = await realData();
    expect(half).not.toBe(before);
    return { before, half };
  }

  it('rollback storage failure at launch → startup blocked, journal kept, data untouched; Retry then restores the old data', async () => {
    const { before, half } = await interrupted();
    const journal = await journalKeys();
    expect(journal).toContain(RESTORE_META_KEY);
    const blocked = await withStorageMock('multiSet', () => Promise.reject(new Error('disk full')), () => runStartupRecovery());
    expect(blocked).toEqual({ status: 'recoveryRequired', reason: 'rollbackFailed' });
    expect(await journalKeys()).toEqual(journal); // the only way back is kept
    expect(await metaState()).toBe('prepared');
    expect(await realData()).toBe(half);
    // A storage read failure is blocking too (never "continue on a partially replaced dataset").
    const unreadable = await withStorageMock('getItem', (orig, k: string) => (k === RESTORE_META_KEY ? Promise.reject(new Error('io')) : orig(k)), () => runStartupRecovery());
    expect(unreadable).toEqual({ status: 'recoveryRequired', reason: 'storageUnavailable' });
    expect(await journalKeys()).toEqual(journal);
    // Retry with storage working: rolled back to the old data, journal resolved, app may continue.
    expect(await runStartupRecovery()).toEqual({ status: 'ready', outcome: 'rolledBack' });
    expect(await realData()).toBe(before);
    expect(await journalKeys()).toEqual([]);
    expect(await runStartupRecovery()).toEqual({ status: 'ready', outcome: 'none' });
  });

  it('a rollback that succeeds but cannot settle its journal still blocks (a later launch would undo newer work)', async () => {
    const { before } = await interrupted();
    const blocked = await withStorageMock('setItem', (orig, k: string, v: string) => (k === RESTORE_META_KEY ? Promise.reject(new Error('io')) : orig(k, v)), () =>
      withStorageMock('removeItem', (orig, k: string) => (k === RESTORE_META_KEY ? Promise.reject(new Error('io')) : orig(k)), () => runStartupRecovery()));
    expect(blocked).toEqual({ status: 'recoveryRequired', reason: 'rollbackFailed' });
    expect(await realData()).toBe(before);
    expect(await runStartupRecovery()).toEqual({ status: 'ready', outcome: 'rolledBack' });
    expect(await journalKeys()).toEqual([]);
  });

  it('a new restore is refused while an unresolved journal is pending (it is never overwritten)', async () => {
    const { half } = await interrupted();
    const metaBefore = await AsyncStorage.getItem(RESTORE_META_KEY);
    await withStorageMock('multiSet', () => Promise.reject(new Error('disk full')), () => expect(restoreBackup(FILE, PASS)).rejects.toMatchObject({ code: 'recoveryRequired' }));
    expect(writeBlockReason()).not.toBeNull(); // P1-REOPEN-02: the app is blocked until the journal is settled
    expect(await AsyncStorage.getItem(RESTORE_META_KEY)).toBe(metaBefore);
    expect(await realData()).toBe(half);
  });
});

describe('P1-REOPEN-02 an unsettled restore blocks the whole app until Retry settles it', () => {
  async function unconfirmedRestore() {
    const before = await preparedPhone();
    let metaWrites = 0;
    await withStorageMock('setItem', (orig, k: string, v: string) => {
      if (k !== RESTORE_META_KEY) return orig(k, v);
      metaWrites += 1;
      return metaWrites === 1 ? orig(k, v) : Promise.reject(new Error('disk full'));
    }, () => expectCode(restoreBackup(FILE, PASS), 'restoreUnconfirmed'));
    return before;
  }

  it('restoreUnconfirmed closes the global gate at once (App shows only the recovery screen, no Back path)', async () => {
    await unconfirmedRestore();
    expect(writeBlockReason()).toBe('restoreUnconfirmed');
    // App.tsx renders RecoveryRequiredScreen from this gate BEFORE the navigator, and that screen has no Back button.
    const app = require('fs').readFileSync(require('path').join(__dirname, '../../../App.tsx'), 'utf8');
    expect(app.indexOf('if (recoveryBlocked)')).toBeGreaterThan(-1);
    expect(app.indexOf('if (recoveryBlocked)')).toBeLessThan(app.indexOf('<AppNavigator />'));
    const screen = require('fs').readFileSync(require('path').join(__dirname, '../RecoveryRequiredScreen.tsx'), 'utf8');
    expect(screen).not.toMatch(/ScreenHeader|goBack|onBack/);
  });

  it('no business write is possible while the restore is unsettled, and nothing changes on disk', async () => {
    await unconfirmedRestore();
    const snap = await realData();
    const a = getActiveWorkspace()!;
    await expect(saveProduct(a.id, { name: 'Typed during limbo' })).rejects.toMatchObject({ code: 'recoveryRequired' });
    await expect(createWorkspace({ name: 'X', mode: 'retail', timeZone: 'Europe/London' })).rejects.toMatchObject({ code: 'recoveryRequired' });
    await expect(require('../../settings/settingsStore').saveGeneral({ soonDays: 5 })).rejects.toMatchObject({ code: 'recoveryRequired' });
    expect(await realData()).toBe(snap);
  });

  it('Retry with a prepared journal → the old dataset, then the app opens again', async () => {
    const before = await unconfirmedRestore();
    expect(await metaState()).toBe('prepared');
    const onReady = jest.fn(async () => undefined);
    expect(await settleRecovery(onReady)).toEqual({ status: 'ready', outcome: 'rolledBack' });
    expect(await realData()).toBe(before);
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(writeBlockReason()).toBeNull();
    await saveProduct(getActiveWorkspace()!.id, { name: 'Now allowed' });
  });

  it('Retry with a committed journal → the new dataset is kept, then the app opens again', async () => {
    await unconfirmedRestore();
    const raw = await AsyncStorage.getItem(RESTORE_META_KEY);
    await AsyncStorage.setItem(RESTORE_META_KEY, String(raw).replace('"prepared"', '"committed"')); // the marker did land
    expect(await metaState()).toBe('committed');
    expect(await settleRecovery(async () => undefined)).toEqual({ status: 'ready', outcome: 'completed' });
    expect(await realData()).toBe(goodState);
    expect(writeBlockReason()).toBeNull();
  });

  it('Retry that still cannot settle keeps the app blocked and the journal in place', async () => {
    await unconfirmedRestore();
    const metaBefore = await AsyncStorage.getItem(RESTORE_META_KEY);
    await withStorageMock('multiSet', () => Promise.reject(new Error('disk full')), async () => {
      const onReady = jest.fn(async () => undefined);
      expect((await settleRecovery(onReady)).status).toBe('recoveryRequired');
      expect(onReady).not.toHaveBeenCalled();
    });
    expect(writeBlockReason()).not.toBeNull();
    expect(await AsyncStorage.getItem(RESTORE_META_KEY)).toBe(metaBefore);
  });
});
