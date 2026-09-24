/** Master handoff §23 / §31 backup tests (T44, T46–T53) against the real storage layer and real encryption. */
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
  restoreBackup, BACKUP_FORMAT, MAX_BACKUP_BYTES, RESTORE_META_KEY, type BackupErrorCode,
} from '../backupFile';
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

beforeEach(async () => {
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
  it('writes an encrypted .tillexpiry file, shares it and records the time', async () => {
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
    expect(await AsyncStorage.getItem('backup:lastCreatedAt')).toBe(r.createdAt);
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

  it('a corrupt stored record is left out and reported instead of producing an unrestorable file', async () => {
    const { a } = await seed();
    const p = await saveProduct(a.id, { name: 'Tea' });
    await AsyncStorage.setItem(K.item('products', p.id), '{not json');
    const built = await buildBackup(PASS);
    expect(built.skipped).toEqual([{ key: K.item('products', p.id), reason: 'unparseable' }]);
    expect(() => parseBackup(built.text, PASS)).not.toThrow();
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

  it('a committed journal is only cleaned up; an unreadable journal never changes data', async () => {
    await makeGood();
    const state = await realData();
    const raw = JSON.stringify([[K.workspacesIndex, '[]']]);
    const meta = (m: Record<string, unknown>) => JSON.stringify({ v: 1, state: 'committed', chunks: 1, sha256: bytesToHex(sha256(utf8ToBytes(raw))), keyCount: 1, startedAt: 'x', ...m });
    await AsyncStorage.multiSet([['backup:restore:chunk:0', raw], [RESTORE_META_KEY, meta({})]]);
    expect(await recoverInterruptedRestore()).toBe('completed');
    expect(await realData()).toBe(state);
    // A damaged journal (hash mismatch) is discarded; it can never be used to overwrite data.
    await AsyncStorage.multiSet([['backup:restore:chunk:0', raw], [RESTORE_META_KEY, meta({ state: 'prepared', sha256: 'bad' })]]);
    expect(await recoverInterruptedRestore()).toBe('unreadable');
    expect(await realData()).toBe(state);
    expect(((await AsyncStorage.getAllKeys()) as string[]).some(k => k.startsWith('backup:restore:'))).toBe(false);
  });

  it('a later restore first rolls back a pending interrupted one, then restores cleanly', async () => {
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
    await restoreBackup(FILE, PASS);
    expect(await realData()).toBe(goodState);
    expect(await AsyncStorage.getItem(RESTORE_META_KEY)).toBeNull();
  });
});
