/**
 * Global write gate (P1-REOPEN-02). While a restore is unsettled — its outcome is unconfirmed, its rollback failed, or
 * start-up recovery could not resolve its journal — the phone may hold a dataset that the next recovery replaces
 * wholesale. Until the journal is settled, no business write is allowed (anything written now could silently vanish)
 * and the app shows only the blocking recovery screen (App.tsx subscribes to this gate).
 */
import { useSyncExternalStore } from 'react';

export type WriteBlockReason = 'rollbackFailed' | 'journalUnreadable' | 'storageUnavailable' | 'restoreUnconfirmed';

let reason: WriteBlockReason | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => { try { l(); } catch { /* a listener never blocks the gate */ } });

export class WritesBlockedError extends Error {
  readonly code = 'recoveryRequired';
  constructor() { super('recoveryRequired'); this.name = 'WritesBlockedError'; }
}

export function blockWrites(r: WriteBlockReason): void { reason = r; emit(); }
export function clearWriteBlock(): void { reason = null; emit(); }
export function writeBlockReason(): WriteBlockReason | null { return reason; }

/** Every business write path calls this first. */
export function assertWritable(): void {
  if (reason) throw new WritesBlockedError();
}

export function subscribeWriteGate(l: () => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export function useWriteBlockReason(): WriteBlockReason | null {
  return useSyncExternalStore(subscribeWriteGate, writeBlockReason, writeBlockReason);
}
