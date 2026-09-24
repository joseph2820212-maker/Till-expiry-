import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  StorageCorruptionError,
  readStorageList,
  readStorageRawStrict,
  withStorageKeyLock,
} from '../storageSafety';

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

describe('storageSafety', () => {
  it('preserves a corrupt list before falling back to an empty list', async () => {
    await AsyncStorage.setItem('financial:test', '{bad json');

    const list = await readStorageList('financial:test');

    expect(list).toEqual([]);
    const keys = await AsyncStorage.getAllKeys();
    const backupKey = keys.find(key => key.startsWith('financial:test:corrupt:'));
    expect(backupKey).toBeDefined();
    expect(await AsyncStorage.getItem(backupKey!)).toBe('{bad json');
  });

  it('throws after preserving corrupt data in strict mode', async () => {
    await AsyncStorage.setItem('financial:strict', '{"not":"a list"}');

    await expect(
      readStorageList('financial:strict', { strict: true }),
    ).rejects.toBeInstanceOf(StorageCorruptionError);

    const keys = await AsyncStorage.getAllKeys();
    const backupKey = keys.find(key => key.startsWith('financial:strict:corrupt:'));
    expect(backupKey).toBeDefined();
    expect(await AsyncStorage.getItem(backupKey!)).toBe('{"not":"a list"}');
  });

  it('serializes work for the same storage key', async () => {
    const order: string[] = [];
    let releaseFirst!: () => void;

    const first = withStorageKeyLock('shared:key', async () => {
      order.push('first:start');
      await new Promise<void>(resolve => {
        releaseFirst = resolve;
      });
      order.push('first:end');
    });

    await new Promise(resolve => setTimeout(resolve, 0));

    const second = withStorageKeyLock('shared:key', async () => {
      order.push('second:start');
      order.push('second:end');
    });

    expect(order).toEqual(['first:start']);
    releaseFirst();
    await Promise.all([first, second]);

    expect(order).toEqual(['first:start', 'first:end', 'second:start', 'second:end']);
  });
});

describe('readStorageRawStrict', () => {
  it('returns the raw stored value', async () => {
    await AsyncStorage.setItem('snap:key', 'raw-value');
    expect(await readStorageRawStrict('snap:key')).toBe('raw-value');
  });

  it('returns null for a genuinely absent key (no throw)', async () => {
    expect(await readStorageRawStrict('snap:absent')).toBeNull();
  });

  it('THROWS on a real read error instead of masking it as null', async () => {
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('io failure'));
    await expect(readStorageRawStrict('snap:key')).rejects.toThrow(/Could not read/);
  });
});
