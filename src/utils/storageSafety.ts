import AsyncStorage from '@react-native-async-storage/async-storage';

export const FINANCIAL_STORAGE_WRITE_LOCK = 'financial:storage:write';
type FinancialBarrierWaiter = {
  mode: 'read' | 'write';
  resolve: (release: () => void) => void;
};

let activeFinancialReaders = 0;
let financialWriterActive = false;
const financialBarrierQueue: FinancialBarrierWaiter[] = [];

function drainFinancialBarrierQueue(): void {
  if (financialWriterActive || activeFinancialReaders > 0 || financialBarrierQueue.length === 0) return;
  if (financialBarrierQueue[0].mode === 'write') {
    financialWriterActive = true;
    const waiter = financialBarrierQueue.shift()!;
    waiter.resolve(() => {
      financialWriterActive = false;
      drainFinancialBarrierQueue();
    });
    return;
  }
  while (financialBarrierQueue[0]?.mode === 'read') {
    activeFinancialReaders += 1;
    const waiter = financialBarrierQueue.shift()!;
    waiter.resolve(() => {
      activeFinancialReaders -= 1;
      if (activeFinancialReaders === 0) drainFinancialBarrierQueue();
    });
  }
}

function acquireFinancialBarrier(mode: 'read' | 'write'): Promise<() => void> {
  return new Promise(resolve => {
    if (mode === 'read'
      && !financialWriterActive
      && !financialBarrierQueue.some(waiter => waiter.mode === 'write')) {
      activeFinancialReaders += 1;
      resolve(() => {
        activeFinancialReaders -= 1;
        if (activeFinancialReaders === 0) drainFinancialBarrierQueue();
      });
      return;
    }
    financialBarrierQueue.push({ mode, resolve });
    drainFinancialBarrierQueue();
  });
}

export async function withFinancialStorageReadLock<T>(task: () => Promise<T>): Promise<T> {
  const release = await acquireFinancialBarrier('read');
  try {
    return await task();
  } finally {
    release();
  }
}
// Audit DB2-MF: shared lock for shop-list writes. The Daily Book updateShop and
// the settings module's saveShop/saveShopsStrict both read-modify-write
// settings:shops; serialising them here prevents a lost-update that drops a
// whole shop record (making a business's data unreachable in the UI).
export const SHOPS_WRITE_LOCK = 'shops:list:write';

export class StorageCorruptionError extends Error {
  readonly key: string;
  readonly backupKey: string | null;

  constructor(key: string, backupKey: string | null) {
    super(
      backupKey
        ? `Stored JSON for ${key} is corrupt. A copy was preserved at ${backupKey}.`
        : `Stored JSON for ${key} is corrupt.`,
    );
    this.name = 'StorageCorruptionError';
    this.key = key;
    this.backupKey = backupKey;
  }
}

const keyLocks = new Map<string, Promise<void>>();

async function acquireStorageKeyLock(key: string): Promise<() => void> {
  let release!: () => void;
  const previous = keyLocks.get(key) ?? Promise.resolve();
  const current = new Promise<void>(resolve => {
    release = resolve;
  });
  const queued = previous.then(() => current, () => current);
  keyLocks.set(key, queued);
  await previous.catch(() => undefined);

  return () => {
    release();
    if (keyLocks.get(key) === queued) {
      keyLocks.delete(key);
    }
  };
}

export async function withStorageKeyLock<T>(
  keys: string | readonly string[],
  task: () => Promise<T>,
): Promise<T> {
  const requestedKeys = Array.isArray(keys) ? keys : [keys];
  const ownsFinancialWriteBarrier = requestedKeys.includes(FINANCIAL_STORAGE_WRITE_LOCK);
  const lockKeys = requestedKeys
    .filter(key => key !== FINANCIAL_STORAGE_WRITE_LOCK)
    .filter((key, index, all) => all.indexOf(key) === index)
    .sort();
  const releases: Array<() => void> = [];

  try {
    if (ownsFinancialWriteBarrier) {
      releases.push(await acquireFinancialBarrier('write'));
    }
    for (const key of lockKeys) {
      releases.push(await acquireStorageKeyLock(key));
    }
    return await task();
  } finally {
    for (const release of releases.reverse()) {
      release();
    }
  }
}

async function preserveCorruptValue(key: string, raw: string | null): Promise<string | null> {
  if (raw === null) return null;
  const backupKey = `${key}:corrupt:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  await AsyncStorage.setItem(backupKey, raw);
  return backupKey;
}

async function handleCorruptList(key: string, raw: string | null, strict: boolean): Promise<[]> {
  const backupKey = await preserveCorruptValue(key, raw);
  if (strict) {
    throw new StorageCorruptionError(key, backupKey);
  }
  return [];
}

export async function parseStorageList<T>(
  key: string,
  raw: string | null,
  options: { strict?: boolean } = {},
): Promise<T[]> {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return handleCorruptList(key, raw, options.strict === true);
  }
  return Array.isArray(parsed)
    ? parsed as T[]
    : handleCorruptList(key, raw, options.strict === true);
}

export async function readStorageList<T>(
  key: string,
  options: { strict?: boolean } = {},
): Promise<T[]> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return parseStorageList<T>(key, raw, options);
  } catch (error) {
    if (options.strict === true) throw error;
    return [];
  }
}

/**
 * Strict RAW string read for snapshot-before-mutate transactions.
 *
 * Returns the stored value, or null when the key is GENUINELY absent — but
 * RETHROWS a real read error instead of masking it as null. Payment/refund
 * deletion snapshots every affected key before mutating; with a swallowed read
 * (`getItem(...).catch(() => null)`) a transient read failure looked identical to
 * "key absent", so the rollback could `removeItem()` a ledger that merely failed
 * to read. Reading strictly makes a failed snapshot ABORT the whole operation
 * before anything is changed.
 */
export async function readStorageRawStrict(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    throw new Error(`Could not read "${key}" to snapshot before a financial change; aborted with no changes made.`);
  }
}
