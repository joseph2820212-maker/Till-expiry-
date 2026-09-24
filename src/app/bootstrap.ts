/**
 * Start-up order: roll back an interrupted data transaction, load the data scope (real / demo), resolve the active
 * workspace and the settings. Each step is guarded so a damaged record can never stop the app from opening; the
 * screens then show what can be read and report the rest.
 */
import { recoverInterruptedTransaction } from '../storage/entityStore';
import { loadScope } from '../storage/scope';
import { loadActiveWorkspace } from '../modules/workspaces/workspaceStore';
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
  for (const hook of startupHooks) {
    try { await hook(); } catch (e) { logError('bootstrap.hook', e); }
  }
}
