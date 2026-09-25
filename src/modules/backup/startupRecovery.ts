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
 * Settle an unsettled restore (P1-REOPEN-02). Runs recovery; only when it returns ready is `onReady` (reload the data)
 * awaited and the global write gate opened again. Otherwise the gate stays closed with the current reason, so normal
 * screens and business writes stay unavailable. Never throws.
 */
export async function settleRecovery(
  onReady: () => Promise<void>,
  recover: () => Promise<RecoveryOutcome> = recoverInterruptedRestore,
): Promise<StartupRecoveryResult> {
  const r = await runStartupRecovery(recover);
  if (r.status === 'recoveryRequired') { blockWrites(r.reason); return r; }
  // Recovery settled the journal: writes are safe again, so reload canonical data, then open the app.
  clearWriteBlock();
  try { await onReady(); } catch { /* a reload failure is reported by the screens; the dataset is whole */ }
  return r;
}
