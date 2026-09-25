/**
 * Start-up order: roll back an interrupted data transaction, load the data scope (real / demo), resolve the active
 * workspace and the settings. Each step is guarded so a damaged record can never stop the app from opening; the
 * screens then show what can be read and report the rest.
 */
import { recoverInterruptedTransaction } from '../storage/entityStore';
import { loadScope } from '../storage/scope';
import { loadActiveWorkspace } from '../modules/workspaces/workspaceStore';
import { loadSettings } from '../modules/settings/settingsStore';
import { registerReminders } from '../modules/reminders/reminderService';
import { logError } from '../utils/errorLog';

const startupHooks: (() => Promise<void> | void)[] = [];

/** Modules that need to start after the data is ready (reminders, settings) register here. */
export function onDataReady(hook: () => Promise<void> | void): void {
  startupHooks.push(hook);
}

export async function bootstrapData(): Promise<void> {
  try { await recoverInterruptedTransaction(); } catch (e) { logError('bootstrap.txnRecovery', e); }
  try { await loadScope(); } catch (e) { logError('bootstrap.scope', e); }
  try { await loadActiveWorkspace(); } catch (e) { logError('bootstrap.workspace', e); }
  try { await loadSettings(); } catch (e) { logError('bootstrap.settings', e); }
  for (const hook of startupHooks) {
    try { await hook(); } catch (e) { logError('bootstrap.hook', e); }
  }
  // Reminders reconcile from the stored batches in the background: Today never waits for the notification system.
  try { void Promise.resolve(registerReminders()).catch(e => logError('bootstrap.reminders', e)); } catch (e) { logError('bootstrap.reminders', e); }
}

/**
 * Strict reload after a settled restore (FINAL-02): the same canonical state as start-up, but any failure THROWS so the
 * caller keeps the app blocked. Runs while the write gate is still closed; only reads (and the transaction journal's
 * own recovery) happen here. Reminders are reconciled in the background afterwards, as at start-up.
 */
export async function reloadAfterRecovery(): Promise<void> {
  await recoverInterruptedTransaction();
  await loadScope();
  await loadActiveWorkspace();
  await loadSettings();
  try { void Promise.resolve(registerReminders()).catch(e => logError('reload.reminders', e)); } catch (e) { logError('reload.reminders', e); }
}
