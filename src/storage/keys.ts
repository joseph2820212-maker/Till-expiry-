/**
 * TillExpiry storage keys. Every persisted key is `<namespace>:<name>`; the backup allowlist is built from
 * BACKUP_NAMESPACES so a key outside these namespaces can never be restored (backupFile.isBackupKey).
 */
export const TE_KEYS = {
  products: 'products:items',
  batches: 'dates:batches',
  settings: 'settings:expiry',
  /** Device-only: identifiers of the reminders this app scheduled (never backed up; a restore reschedules). */
  reminderIds: 'app:reminderIds',
} as const;

/** Namespaces that belong in a backup. Drafts, billing cache, journals and device-only keys are excluded. */
export const BACKUP_NAMESPACES = ['settings', 'products', 'dates'] as const;
