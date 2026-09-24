import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { createBackup, restoreBackup, inspectBackup, recoverInterruptedRestore, isBackupKey, RestoreError, RESTORE_JOURNAL_KEY, entityCountsFor, checkStorageIntegrity } from '../backupFile';
import { TE_KEYS } from '../../../storage/keys';

const product = (i: number) => ({ id: `P${i}`, name: `Item ${i}`, price: { minor: 100 + i, currency: 'GBP', exponent: 2 } });

jest.mock('../../../storage/fileUtils', () => ({ writeAndShare: jest.fn(async (name: string, content: string) => { (global as any).__lastBackup = { name, content }; return `file:///cache/${name}`; }) }));

const mockStorage = AsyncStorage as unknown as { clear: jest.Mock; multiSet: jest.Mock; multiRemove: jest.Mock };
const readMock = FileSystem.readAsStringAsync as unknown as jest.Mock;
const infoMock = FileSystem.getInfoAsync as unknown as jest.Mock;
const lastBackup = () => (global as any).__lastBackup as { name: string; content: string };

async function seed(itemCount = 3) {
  mockStorage.clear();
  await AsyncStorage.setItem(TE_KEYS.products, JSON.stringify(Array.from({ length: itemCount }, (_, i) => product(i))));
  await AsyncStorage.setItem(TE_KEYS.batches, JSON.stringify([{ id: 'd1', status: 'open' }, { id: 'd2', status: 'open' }, { id: 'd3', status: 'closed' }]));
  await AsyncStorage.setItem(TE_KEYS.settings, JSON.stringify({ alertDays: 5 }));
  await AsyncStorage.setItem(TE_KEYS.reminderIds, '["tillexpiry-daily-2026-09-25"]');
  await AsyncStorage.setItem('drafts:addDate', '{"secret":1}');
  await AsyncStorage.setItem('billing:last_verified_entitlement', '{"isPremium":true}');
  await AsyncStorage.setItem('app:language', 'de');
  await AsyncStorage.setItem('journal:import', '{"inflight":1}');
}
const serveFile = (content: string) => { readMock.mockResolvedValueOnce(content); infoMock.mockResolvedValueOnce({ exists: true, size: content.length }); };

beforeEach(() => { jest.clearAllMocks(); });

describe('what a backup contains', () => {
  it('includes settings, products and dates; excludes drafts, billing, language, reminders and journals', async () => {
    await seed();
    const r = await createBackup('correct horse battery', '1.0.0');
    expect(r.fileName).toMatch(/^TillExpiry_Backup_\d{8}_\d{4}\.json$/);
    const payload = JSON.parse(lastBackup().content);
    expect(payload.format).toBe('tillexpiry');
    expect(payload.version).toBe(2);
    expect(payload.data).toBeUndefined(); // encrypted: nothing in the clear
    expect(payload.entityCounts).toEqual({ products: 3, openDates: 2, history: 1 });
    expect(JSON.stringify(payload)).not.toContain('tillexpiry-daily');
    expect(JSON.stringify(payload)).not.toContain('secret');
    expect(JSON.stringify(payload)).not.toContain('isPremium');
    for (const [k, ok] of [['settings:expiry', true], ['products:items', true], ['dates:batches', true], ['promotions:items', false], ['queue:intents', false], ['calculators:saved', false], ['priceLists:index', false], ['drafts:addDate', false], ['billing:x', false], ['app:language', false], ['app:reminderIds', false], ['journal:import', false], ['__proto__:x', false], ['products:items:corrupt:123:abc', false], ['tillexpiry:v1:diagnostics:errorLog', false], ['backup:restoreJournal', false]] as [string, boolean][]) expect(isBackupKey(k)).toBe(ok);
  });
  it('a 2,000-product catalogue round-trips through an encrypted backup', async () => {
    await seed(2000);
    await createBackup('pass phrase 123', '1.0.0');
    const file = lastBackup().content;
    mockStorage.clear();
    await AsyncStorage.setItem('app:language', 'fr');
    await AsyncStorage.setItem('products:staleKey', '[]'); // stale allowlisted key, gets removed
    serveFile(file);
    const insp = await inspectBackup('file:///b.json');
    expect(insp.encrypted).toBe(true);
    expect(insp.entityCounts.products).toBe(2000);
    serveFile(file);
    const r = await restoreBackup('file:///b.json', 'pass phrase 123');
    expect(r.entityCounts.products).toBe(2000);
    expect(JSON.parse((await AsyncStorage.getItem(TE_KEYS.products))!).length).toBe(2000);
    expect(await AsyncStorage.getItem('app:language')).toBe('fr'); // device-local kept
    expect(await AsyncStorage.getItem('products:staleKey')).toBeNull();
    expect(await AsyncStorage.getItem(RESTORE_JOURNAL_KEY)).toBeNull();
  });
});

describe('restore validation', () => {
  it('wrong passphrase, foreign file, junk JSON, empty and hostile-only files are all rejected with a code and zero writes', async () => {
    await seed();
    await createBackup('right', '1.0.0');
    const file = lastBackup().content;
    const before = await AsyncStorage.getItem(TE_KEYS.products);
    mockStorage.multiSet.mockClear();
    serveFile(file); await expect(restoreBackup('f', 'wrong')).rejects.toMatchObject({ code: 'wrong-passphrase' });
    serveFile(file); await expect(restoreBackup('f')).rejects.toMatchObject({ code: 'passphrase-required' });
    serveFile('{"format":"tillnote","version":1,"data":{"settings:x":"1"}}'); await expect(restoreBackup('f')).rejects.toMatchObject({ code: 'wrong-format' });
    serveFile('not json'); await expect(restoreBackup('f')).rejects.toMatchObject({ code: 'invalid-json' });
    serveFile('{"format":"tillexpiry","version":1,"data":{}}'); await expect(restoreBackup('f')).rejects.toMatchObject({ code: 'empty-backup' });
    serveFile('{"format":"tillexpiry","version":1,"data":{"__proto__":"x","app:pin":"1234","billing:last_verified_entitlement":"{}"}}'); await expect(restoreBackup('f')).rejects.toMatchObject({ code: 'empty-backup' });
    serveFile('{"format":"tillexpiry","version":9,"data":{"settings:a":"1"}}'); await expect(restoreBackup('f')).rejects.toBeInstanceOf(RestoreError);
    expect(mockStorage.multiSet).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem(TE_KEYS.products)).toBe(before);
  });
  it('a plaintext v1 file still restores, hostile keys dropped, checksum honoured', async () => {
    mockStorage.clear();
    serveFile(JSON.stringify({ format: 'tillexpiry', version: 1, data: { 'settings:shop': '{"targetPercent":22}', 'billing:last_verified_entitlement': '{"isPremium":true}', 'app:language': 'ar' } }));
    const r = await restoreBackup('f');
    expect(r.restoredKeys).toBe(1);
    expect(await AsyncStorage.getItem('settings:shop')).toBe('{"targetPercent":22}');
    expect(await AsyncStorage.getItem('billing:last_verified_entitlement')).toBeNull();
    serveFile(JSON.stringify({ format: 'tillexpiry', version: 1, checksum: 1, data: { 'settings:a': '1' } }));
    await expect(restoreBackup('f')).rejects.toMatchObject({ code: 'checksum-mismatch' });
  });
  it('oversized files are refused before being read', async () => {
    infoMock.mockResolvedValueOnce({ exists: true, size: 300 * 1024 * 1024 });
    await expect(inspectBackup('f')).rejects.toMatchObject({ code: 'too-large' });
  });
});

describe('interrupted restore', () => {
  it('a failure after the snapshot rolls back to the previous store', async () => {
    await seed();
    await createBackup('p', '1.0.0');
    const file = lastBackup().content;
    const beforeItems = await AsyncStorage.getItem(TE_KEYS.products);
    await AsyncStorage.setItem('settings:shop', '{"targetPercent":99}');
    serveFile(file);
    mockStorage.multiRemove.mockImplementationOnce(async () => { throw new Error('disk'); });
    await AsyncStorage.setItem('products:staleKey', '[]');
    await expect(restoreBackup('f', 'p')).rejects.toMatchObject({ code: 'rolled-back' });
    expect(await AsyncStorage.getItem('settings:shop')).toBe('{"targetPercent":99}');
    expect(await AsyncStorage.getItem(TE_KEYS.products)).toBe(beforeItems);
    expect(await AsyncStorage.getItem('products:staleKey')).toBe('[]');
    expect(await AsyncStorage.getItem(RESTORE_JOURNAL_KEY)).toBeNull();
  });
  it('a journal left in "prepared" state (crash mid-restore) is rolled back at launch; "committed" is just cleaned up', async () => {
    mockStorage.clear();
    const snapshot: [string, string][] = [['settings:shop', '{"old":true}'], ['products:categories', '[]']];
    const djb2 = (s: string) => { let h = 5381; for (let i = 0; i < s.length; i++) h = (((h << 5) + h) ^ s.charCodeAt(i)) >>> 0; return h; };
    await AsyncStorage.setItem('settings:shop', '{"half":"written"}');
    await AsyncStorage.setItem(RESTORE_JOURNAL_KEY, JSON.stringify({ version: 1, state: 'prepared', snapshot, checksum: djb2(JSON.stringify(snapshot)) }));
    expect(await recoverInterruptedRestore()).toBe('rolledBack');
    expect(await AsyncStorage.getItem('settings:shop')).toBe('{"old":true}');
    expect(await AsyncStorage.getItem('products:categories')).toBe('[]');
    expect(await AsyncStorage.getItem(RESTORE_JOURNAL_KEY)).toBeNull();
    await AsyncStorage.setItem(RESTORE_JOURNAL_KEY, JSON.stringify({ version: 1, state: 'committed', snapshot, checksum: djb2(JSON.stringify(snapshot)) }));
    expect(await recoverInterruptedRestore()).toBe('completed');
    expect(await AsyncStorage.getItem('settings:shop')).toBe('{"old":true}');
    await AsyncStorage.setItem(RESTORE_JOURNAL_KEY, 'garbage');
    expect(await recoverInterruptedRestore()).toBe('none');
    expect(await AsyncStorage.getItem(RESTORE_JOURNAL_KEY)).toBeNull();
  });
});

describe('integrity check + counts', () => {
  it('counts arrays and flags unparsable ones', async () => {
    mockStorage.clear();
    await AsyncStorage.setItem('products:categories', '[1,2,3]');
    await AsyncStorage.setItem('dates:batches', '[oops');
    expect(await checkStorageIntegrity()).toEqual({ ok: false, totalRecords: 3, parseErrors: 1 });
    expect(entityCountsFor({ 'products:items': '[1,2,3]', 'dates:batches': '[{"status":"open"},{"status":"closed"},{"status":"closed"}]' })).toMatchObject({ products: 3, openDates: 1, history: 2 });
    expect(entityCountsFor({ 'dates:batches': 'oops' })).toMatchObject({ openDates: 0, history: 0 });
  });
});
