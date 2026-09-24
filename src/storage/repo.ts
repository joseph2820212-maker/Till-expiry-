/**
 * Small typed storage helpers for TillExpiry records on top of storageSafety (per-key locks, corruption kept aside).
 * Writes read STRICTLY (a failed read aborts instead of overwriting data with an empty list) and multi-key updates
 * restore every key they touched if any write fails.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { readStorageList, readStorageRawStrict, withStorageKeyLock } from '../utils/storageSafety';

export async function readList<T>(key: string): Promise<T[]> {
  return readStorageList<T>(key);
}

export async function readObject<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? { ...fallback, ...parsed } : fallback;
  } catch {
    return fallback;
  }
}

export async function writeObject<T>(key: string, value: T): Promise<void> {
  await withStorageKeyLock(key, () => AsyncStorage.setItem(key, JSON.stringify(value)));
}

/** Read-modify-write one list under its lock. */
export async function updateList<T, R = void>(key: string, fn: (list: T[]) => { list: T[]; result: R } | Promise<{ list: T[]; result: R }>): Promise<R> {
  return withStorageKeyLock(key, async () => {
    const list = await readStorageList<T>(key, { strict: true });
    const out = await fn(list);
    await AsyncStorage.setItem(key, JSON.stringify(out.list));
    return out.result;
  });
}

/**
 * Transaction over several keys: every key is snapshotted strictly, `fn` returns the new values, and if any write
 * fails every key is put back as it was.
 */
export async function transact<R>(keys: string[], fn: (read: <T>(key: string) => T[]) => { writes: Record<string, unknown>; result: R } | Promise<{ writes: Record<string, unknown>; result: R }>): Promise<R> {
  return withStorageKeyLock(keys, async () => {
    const raw: Record<string, string | null> = {};
    for (const k of keys) raw[k] = await readStorageRawStrict(k);
    const parsed: Record<string, unknown[]> = {};
    for (const k of keys) {
      try { const v = raw[k] ? JSON.parse(raw[k] as string) : []; parsed[k] = Array.isArray(v) ? v : []; } catch { throw new Error(`stored data for ${k} is unreadable; nothing was changed`); }
    }
    const out = await fn(<T,>(k: string) => (parsed[k] ?? []) as T[]);
    const written: string[] = [];
    try {
      for (const [k, v] of Object.entries(out.writes)) {
        if (!keys.includes(k)) throw new Error(`key ${k} is not part of this transaction`);
        await AsyncStorage.setItem(k, JSON.stringify(v));
        written.push(k);
      }
    } catch (e) {
      for (const k of written) {
        if (raw[k] === null) await AsyncStorage.removeItem(k).catch(() => undefined);
        else await AsyncStorage.setItem(k, raw[k] as string).catch(() => undefined);
      }
      throw e;
    }
    return out.result;
  });
}
