/**
 * Startup gate for an interrupted restore (EXP-REV-04). App.tsx calls `runStartupRecovery()` before any business data
 * is loaded. It never throws: either the app may continue (`ready`), or a pending restore could not be resolved and the
 * app must show RecoveryRequiredScreen instead of its normal screens (`recoveryRequired`). The restore journal is left
 * untouched in that case, so Retry (which runs this again) can still roll back.
 */
import { BackupError, recoverInterruptedRestore, type RecoveryOutcome } from './backupFile';

export type RecoveryBlockReason = 'rollbackFailed' | 'journalUnreadable' | 'storageUnavailable';

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
