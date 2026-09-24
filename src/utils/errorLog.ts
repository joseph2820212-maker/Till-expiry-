/**
 * errorLog.ts — lightweight, Expo-Go-safe local error log.
 *
 * Captures runtime errors into a small capped ring buffer in AsyncStorage so a
 * crash/bug can be inspected (and exported) without any native crash-reporting
 * SDK.
 *
 * Design constraints:
 *   • No native dependency — pure AsyncStorage + the JS global error handler.
 *   • logError() NEVER throws and never rejects: logging must not crash the app.
 *   • Bounded: keeps only the most recent MAX_ENTRIES, newest first.
 *   • Writes are serialised through a promise chain to avoid read-modify-write
 *     races between concurrent failures.
 *   • Captures messages + stacks only; it does not snapshot app data.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'tillexpiry:v1:diagnostics:errorLog';
const MAX_ENTRIES = 100;
const MAX_STACK_CHARS = 4000;

export interface ErrorLogEntry {
  t: string;        // ISO timestamp
  ctx: string;      // where it happened (caller-supplied label)
  msg: string;      // error message
  stack?: string;   // truncated stack / component stack
  fatal?: boolean;  // true for an uncaught/fatal error
}

// Serialise ALL operations (reads, writes, clears) through one queue so
// concurrent failures can't clobber each other and a read always reflects
// pending writes. The chain is kept alive (never left rejected) so one bad op
// can't skip the next one's body.
let opChain: Promise<unknown> = Promise.resolve();

function enqueue<T>(op: () => Promise<T>): Promise<T> {
  const result = opChain.then(op, op); // run regardless of the previous outcome
  opChain = result.then(() => undefined, () => undefined);
  return result;
}

function describeError(error: unknown): { msg: string; stack?: string } {
  if (error instanceof Error) {
    return { msg: error.message || error.name || 'Error', stack: error.stack };
  }
  if (typeof error === 'string') return { msg: error };
  try {
    return { msg: JSON.stringify(error) };
  } catch {
    return { msg: String(error) };
  }
}

async function readRaw(): Promise<ErrorLogEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ErrorLogEntry[]) : [];
  } catch {
    return [];
  }
}

/**
 * Record an error. Best-effort and non-throwing — safe to call from anywhere,
 * including other catch blocks and the global handler.
 */
export function logError(ctx: string, error: unknown, opts?: { fatal?: boolean; extra?: string }): Promise<void> {
  const { msg, stack } = describeError(error);
  const entry: ErrorLogEntry = {
    t: new Date().toISOString(),
    ctx: String(ctx || 'unknown'),
    msg: opts?.extra ? `${msg} — ${opts.extra}` : msg,
    fatal: opts?.fatal || undefined,
  };
  if (stack) entry.stack = stack.slice(0, MAX_STACK_CHARS);

  return enqueue(async () => {
    const list = await readRaw();
    list.unshift(entry);
    if (list.length > MAX_ENTRIES) list.length = MAX_ENTRIES;
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch {
      /* storage full / unavailable — a dropped diagnostic must never crash the app */
    }
  });
}

/** Newest-first list of captured errors. */
export async function getErrorLog(): Promise<ErrorLogEntry[]> {
  return enqueue(readRaw);
}

export async function clearErrorLog(): Promise<void> {
  return enqueue(async () => {
    try { await AsyncStorage.removeItem(STORAGE_KEY); } catch { /* best effort */ }
  });
}

/** Human-readable dump for sharing/export (no app data, just errors). */
export async function formatErrorLogForExport(): Promise<string> {
  const list = await getErrorLog();
  if (list.length === 0) return 'No errors recorded.';
  const lines = list.map(e => {
    const head = `[${e.t}]${e.fatal ? ' FATAL' : ''} (${e.ctx}) ${e.msg}`;
    return e.stack ? `${head}\n${e.stack}` : head;
  });
  return `Error log — ${list.length} entr${list.length === 1 ? 'y' : 'ies'} (newest first)\n\n${lines.join('\n\n')}`;
}

// ─── Global uncaught-error capture ────────────────────────────────────────────

interface ErrorUtilsLike {
  getGlobalHandler?: () => ((error: unknown, isFatal?: boolean) => void) | undefined;
  setGlobalHandler: (handler: (error: unknown, isFatal?: boolean) => void) => void;
}

let installed = false;

/**
 * Chain a logger onto the JS global error handler so uncaught errors are
 * recorded, then hand off to the previous handler (preserving the dev red-box
 * and default fatal handling). Idempotent and a no-op where ErrorUtils is absent.
 */
export function installGlobalErrorLogger(): void {
  if (installed) return;
  const errorUtils = (globalThis as unknown as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  if (!errorUtils || typeof errorUtils.setGlobalHandler !== 'function') return;

  const previous = errorUtils.getGlobalHandler?.();
  errorUtils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
    void logError('global', error, { fatal: !!isFatal });
    if (typeof previous === 'function') previous(error, isFatal);
  });
  installed = true;
}

/** Test-only: reset the install guard. */
export function __resetGlobalErrorLoggerForTests(): void {
  installed = false;
}
