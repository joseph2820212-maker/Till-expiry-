/**
 * Startup gate for an interrupted restore (EXP-REV-04). App.tsx calls `runStartupRecovery()` before any business data
 * is loaded. It never throws: either the app may continue (`ready`), or a pending restore could not be resolved and the
 * app must show RecoveryRequiredScreen instead of its normal screens (`recoveryRequired`). The restore journal is left
 * untouched in that case, so Retry (which runs this again) can still roll back.
 */
import { BackupError, recoverInterruptedRestore, type RecoveryOutcome } from './backupFile';
import { blockWrites, clearWriteBlock, type WriteBlockReason } from '../../storage/writeGate';

export type RecoveryBlockReason = WriteBlockReason;

export type StartupRecoveryResult =
  | { status: 'ready'; outcome: RecoveryOutcome }
  | { status: 'recoveryRequired'; reason: RecoveryBlockReason };

/** Map a recovery failure to the reason shown on the blocking screen. */
export function recoveryBlockReason(e: unknown): RecoveryBlockReason {
  const detail = e instanceof BackupError ? e.detail ?? '' : '';
  if (detail.startsWith('journalUnreadable')) return 'journalUnreadable';
  if (detail.startsWith('rollbackFailed')) return 'rollbackFailed';
  return 'storageUnavailable';
}

export async function runStartupRecovery(
  recover: () => Promise<RecoveryOutcome> = recoverInterruptedRestore,
): Promise<StartupRecoveryResult> {
  try {
    return { status: 'ready', outcome: await recover() };
  } catch (e) {
    return { status: 'recoveryRequired', reason: recoveryBlockReason(e) };
  }
}

/**
 * Settle an unsettled restore (P1-REOPEN-02, FINAL-02). Runs recovery; when it returns ready, `onReady` reloads the
 * canonical state (workspace, settings, caches) WHILE THE WRITE GATE IS STILL CLOSED, so nothing can be written against
 * stale caches. Only after the reload succeeds is the gate opened. If recovery or the reload fails, the gate stays
 * closed and the app stays blocked. Never throws.
 */
export async function settleRecovery(
  onReady: () => Promise<void>,
  recover: () => Promise<RecoveryOutcome> = recoverInterruptedRestore,
): Promise<StartupRecoveryResult> {
  const r = await runStartupRecovery(recover);
  if (r.status === 'recoveryRequired') { blockWrites(r.reason); return r; }
  try {
    await onReady();
  } catch {
    // The journal is settled, but the app could not reload a consistent state: stay blocked; Retry reloads again.
    blockWrites('storageUnavailable');
    return { status: 'recoveryRequired', reason: 'storageUnavailable' };
  }
  clearWriteBlock();
  return r;
}
