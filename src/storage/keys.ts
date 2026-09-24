/**
 * TillExpiry storage keys (§24). One record per key plus small id indexes per workspace — never one giant blob.
 * Every logical key is `<namespace>:…`; the physical key gets a `demo:` prefix while the isolated demo is active
 * (storage/scope.ts), so demo code can never address a real record (T65).
 */
export const NS = {
  settings: 'settings',
  workspaces: 'workspaces',
  products: 'products',
  batches: 'batches',
  events: 'events',
  rules: 'rules',
  locations: 'locations',
  lists: 'lists',
  imports: 'imports',
} as const;

export type EntityNs = 'products' | 'batches' | 'events' | 'rules' | 'locations' | 'lists' | 'imports';

export const K = {
  settingsGeneral: 'settings:general',
  settingsReminders: 'settings:reminders',
  workspacesIndex: 'workspaces:index',
  workspacesActive: 'workspaces:active',
  workspace: (id: string) => `workspaces:item:${id}`,
  index: (ns: EntityNs, workspaceId: string) => `${ns}:index:${workspaceId}`,
  item: (ns: EntityNs, id: string) => `${ns}:item:${id}`,
  /** Per-batch event list, so a batch's history never loads every event of the workspace. */
  batchEvents: (batchId: string) => `events:batch:${batchId}`,
} as const;

/** Namespaces that belong in a backup (§23). Device-local keys (app:, journal:, backup:, demo:) are never included. */
export const BACKUP_NAMESPACES = ['settings', 'workspaces', 'products', 'batches', 'events', 'rules', 'locations', 'lists', 'imports'] as const;

/** Device-local keys: never backed up, never restored. */
export const DEVICE_KEYS = {
  scope: 'app:scope',
  reminderIds: 'app:reminderIds',
  reminderState: 'app:reminderState',
  snoozes: 'app:snoozes',
  txnJournal: 'journal:txn',
  demoMeta: 'app:demoMeta',
} as const;
