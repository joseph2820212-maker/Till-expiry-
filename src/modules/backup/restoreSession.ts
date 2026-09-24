/**
 * Hand-over of a picked backup file from BackupRestore (E35) to RestorePreview (E36). Files can be large, so the
 * picked file and, once decrypted, its parsed content stay in memory here instead of in navigation params.
 * Cleared after a restore, on cancel, and whenever a new file is picked.
 */
import type { BackupFileRef, ParsedBackup } from './backupFile';

export interface RestoreSession {
  file: BackupFileRef;
  /** Header already checked when the file was picked. */
  createdAt: string;
  appVersion: string;
  /** Set after the passphrase was accepted (decrypted + validated). */
  parsed?: ParsedBackup;
}

let session: RestoreSession | null = null;

export function setRestoreSession(next: RestoreSession): void { session = next; }
export function getRestoreSession(): RestoreSession | null { return session; }
export function setParsedBackup(parsed: ParsedBackup): void { if (session) session = { ...session, parsed }; }
export function clearRestoreSession(): void { session = null; }
