/**
 * Local reminders through expo-notifications (§22). Nothing leaves the phone: the OS shows notifications this app
 * scheduled on the device.
 *
 * Reconciliation (adapted from Till Note's notificationReconciliation / taskReminders, SHA 6fa6e941): the schedule is
 * always rebuilt from canonical batch data. Notification ids are device-local (DEVICE_KEYS.reminderIds, never backed
 * up); a run cancels every stale id of ours, schedules the plan with deterministic ids (so a repeat never duplicates),
 * and records a visible state:
 *   off                 — every reminder type is switched off;
 *   ok                  — the plan is scheduled;
 *   permission_required — notifications are not allowed (the app stays fully usable, T39/T40);
 *   schedule_failed     — reading data or scheduling failed; what did schedule is kept, retry later (T41).
 * Runs are serialized: a request during a run collapses into one follow-up run.
 *
 * Demo (§27): demo data never schedules device notifications. While the demo is active a reconcile leaves the real
 * schedule (built from real data) untouched and returns the state flagged `demoActive`.
 *
 * The Today screen stays authoritative: a failed schedule never hides or changes anything there (T45).
 */
import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import i18n from '../../i18n';
import { DEVICE_KEYS } from '../../storage/keys';
import { onDataChanged } from '../../storage/changeBus';
import { getScope, onScopeChanged } from '../../storage/scope';
import { deviceTimeZone } from '../../domain/expiry/datePrecision';
import { listWorkspaces } from '../workspaces/workspaceStore';
import { listBatches } from '../batches/batchStore';
import { getGeneral, getReminderSettings, loadSettings } from '../settings/settingsStore';
import { logError } from '../../utils/errorLog';
import { withStorageKeyLock } from '../../utils/storageSafety';
import { anyReminderEnabled, planReminders, REMINDER_ID_PREFIX, type PlannedReminder, type WorkspaceBatches } from './reminderPlan';

export const CHANNEL_ID = 'expiry-reminders';

export type ReminderStatus = 'off' | 'ok' | 'permission_required' | 'schedule_failed';
export type PermissionState = 'granted' | 'denied' | 'undetermined';

export interface ReminderState {
  status: ReminderStatus;
  /** Notifications of ours currently scheduled on the device. */
  scheduled: number;
  /** Notifications the current plan asked for. */
  planned: number;
  /** Planned notifications that could not be scheduled in the last run. */
  failed: number;
  lastRunIso?: string;
  /** Why the last run happened (diagnostic only). */
  reason?: string;
  /** Set by cancelAllReminders (e.g. before a restore) until the next successful reconcile. */
  pendingReconcile?: boolean;
  /** The demo is active: nothing is scheduled from demo data; the real schedule is left as it was. */
  demoActive?: boolean;
}

const INITIAL: ReminderState = { status: 'off', scheduled: 0, planned: 0, failed: 0 };

let state: ReminderState = INITIAL;
const listeners = new Set<() => void>();
function setState(next: ReminderState): void {
  state = next;
  listeners.forEach(l => { try { l(); } catch { /* never break a reconcile */ } });
}

async function persistState(next: ReminderState): Promise<void> {
  setState(next);
  const { demoActive: _demo, ...stored } = next;
  await AsyncStorage.setItem(DEVICE_KEYS.reminderState, JSON.stringify(stored)).catch(e => logError('reminders.persistState', e));
}

export function getReminderState(): ReminderState { return state; }

export async function loadReminderState(): Promise<ReminderState> {
  try {
    const raw = await AsyncStorage.getItem(DEVICE_KEYS.reminderState);
    const v = raw ? JSON.parse(raw) : null;
    if (v && typeof v === 'object' && ['off', 'ok', 'permission_required', 'schedule_failed'].includes(v.status)) {
      setState({ ...INITIAL, ...v, demoActive: getScope() === 'demo' });
    }
  } catch { /* keep the in-memory state */ }
  return state;
}

function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }
export function useReminderState(): ReminderState {
  return useSyncExternalStore(subscribe, getReminderState, getReminderState);
}

// ─── permission ─────────────────────────────────────────────────────────────

export interface PermissionInfo { state: PermissionState; canAskAgain: boolean }

export async function getReminderPermission(): Promise<PermissionInfo> {
  try {
    const p = await Notifications.getPermissionsAsync();
    if (p.granted) return { state: 'granted', canAskAgain: true };
    const canAskAgain = p.canAskAgain !== false;
    return { state: canAskAgain ? 'undetermined' : 'denied', canAskAgain };
  } catch { return { state: 'undetermined', canAskAgain: true }; }
}

/** Ask the OS (only after the in-app explanation, E04). Reconciles afterwards so the state line updates. */
export async function requestReminderPermission(): Promise<PermissionState> {
  let result: PermissionState = 'denied';
  try {
    await ensureChannel();
    const p = await Notifications.requestPermissionsAsync();
    result = p.granted ? 'granted' : p.canAskAgain === false ? 'denied' : 'undetermined';
  } catch (e) { logError('reminders.permission', e); }
  await reconcileReminders('permission').catch(() => undefined);
  return result;
}

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, { name: i18n.t('reminders.channelName'), importance: Notifications.AndroidImportance.DEFAULT });
}

// ─── ids and snoozes (device-local) ─────────────────────────────────────────

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}

async function storedIds(): Promise<string[]> {
  const v = await readJson<unknown>(DEVICE_KEYS.reminderIds, []);
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

/** Ids of ours: the stored list plus anything with our prefix the OS still holds (e.g. after a lost write). */
async function ourScheduledIds(): Promise<Set<string>> {
  const ids = new Set(await storedIds());
  try {
    for (const n of await Notifications.getAllScheduledNotificationsAsync()) {
      if (n.identifier.startsWith(REMINDER_ID_PREFIX)) ids.add(n.identifier);
    }
  } catch { /* keep the stored list */ }
  return ids;
}

export async function getSnoozes(): Promise<Record<string, string>> {
  const v = await readJson<unknown>(DEVICE_KEYS.snoozes, {});
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const out: Record<string, string> = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) if (typeof x === 'string' && Number.isFinite(Date.parse(x))) out[k] = x;
  return out;
}

/**
 * Silence a batch's individual warnings until `untilIso` (T09). Only the reminder moves: the batch, its deadline and
 * its Today status are untouched, and the daily summary still counts it.
 */
export async function snoozeBatchReminder(batchId: string, untilIso: string): Promise<ReminderState> {
  if (!batchId || !Number.isFinite(Date.parse(untilIso))) throw new RangeError('bad snooze');
  await withStorageKeyLock(DEVICE_KEYS.snoozes, async () => {
    const snoozes = await getSnoozes();
    snoozes[batchId] = untilIso;
    await AsyncStorage.setItem(DEVICE_KEYS.snoozes, JSON.stringify(snoozes));
  });
  return reconcileReminders('snooze');
}

// Read-modify-write under the key lock, re-reading inside it: a snooze saved while a reconcile was loading data
// must never be overwritten by that reconcile's pruned copy.
async function pruneSnoozes(now: number): Promise<Record<string, string>> {
  return withStorageKeyLock(DEVICE_KEYS.snoozes, async () => {
    const snoozes = await getSnoozes();
    const live = Object.fromEntries(Object.entries(snoozes).filter(([, v]) => Date.parse(v) > now));
    if (Object.keys(live).length !== Object.keys(snoozes).length) {
      await AsyncStorage.setItem(DEVICE_KEYS.snoozes, JSON.stringify(live)).catch(() => undefined);
    }
    return live;
  });
}

// ─── reconcile ──────────────────────────────────────────────────────────────

async function loadData(): Promise<WorkspaceBatches[]> {
  const workspaces = await listWorkspaces();
  const out: WorkspaceBatches[] = [];
  for (const w of workspaces) out.push({ workspace: w, batches: await listBatches(w.id) });
  return out;
}

async function cancelIds(ids: Iterable<string>): Promise<void> {
  for (const id of ids) await Notifications.cancelScheduledNotificationAsync(id).catch(e => logError('reminders.cancel', e));
}

async function schedule(r: PlannedReminder): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    identifier: r.identifier,
    content: { title: r.title, body: r.body, data: r.data },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(r.at), channelId: CHANNEL_ID } as Notifications.NotificationTriggerInput,
  });
}

async function runOnce(reason: string | undefined, now: number): Promise<ReminderState> {
  const base = { reason, lastRunIso: new Date(now).toISOString() };
  if (getScope() === 'demo') {
    // Demo data never schedules device notifications; the real schedule stays as it was.
    const next = { ...state, demoActive: true };
    setState(next);
    return next;
  }
  const settings = getReminderSettings();
  const existing = await ourScheduledIds();

  if (!anyReminderEnabled(settings)) {
    await cancelIds(existing);
    await AsyncStorage.setItem(DEVICE_KEYS.reminderIds, '[]').catch(() => undefined);
    const next: ReminderState = { status: 'off', scheduled: 0, planned: 0, failed: 0, ...base };
    await persistState(next);
    return next;
  }

  let plan: PlannedReminder[];
  try {
    const data = await loadData();
    const live = await pruneSnoozes(now);
    plan = planReminders({ workspaces: data, settings, status: getGeneral(), snoozes: live, now, deviceTimeZone: deviceTimeZone(), t: i18n.t.bind(i18n) as never });
  } catch (e) {
    // Data could not be read: keep what is scheduled (it was built from the last good data) and say so.
    logError('reminders.plan', e);
    const next: ReminderState = { ...state, status: 'schedule_failed', scheduled: existing.size, failed: 0, ...base, demoActive: false };
    await persistState(next);
    return next;
  }

  const permission = await getReminderPermission();
  if (permission.state !== 'granted') {
    await cancelIds(existing); // they could not show anyway; the next granted run schedules afresh
    await AsyncStorage.setItem(DEVICE_KEYS.reminderIds, '[]').catch(() => undefined);
    const next: ReminderState = { status: 'permission_required', scheduled: 0, planned: plan.length, failed: 0, ...base };
    await persistState(next);
    return next;
  }

  try { await ensureChannel(); } catch (e) { logError('reminders.channel', e); }
  const wanted = new Set(plan.map(r => r.identifier));
  await cancelIds([...existing].filter(id => !wanted.has(id)));

  const ok: string[] = [];
  let failed = 0;
  for (const r of plan) {
    try { await schedule(r); ok.push(r.identifier); }
    catch (e) { failed++; logError('reminders.schedule', e); }
  }
  await AsyncStorage.setItem(DEVICE_KEYS.reminderIds, JSON.stringify(ok)).catch(e => logError('reminders.persistIds', e));
  const next: ReminderState = { status: failed ? 'schedule_failed' : 'ok', scheduled: ok.length, planned: plan.length, failed, ...base };
  await persistState(next);
  return next;
}

let running: Promise<ReminderState> | null = null;
let queued: Promise<ReminderState> | null = null;

/**
 * Rebuild the schedule from canonical data. Never throws for a scheduling problem: the outcome is the returned state.
 * A call during a run waits for it and then runs once more (several such calls share that one follow-up run).
 */
export function reconcileReminders(reason?: string): Promise<ReminderState> {
  if (!running) {
    running = runOnce(reason, Date.now())
      .catch(e => {
        logError('reminders.reconcile', e);
        const next: ReminderState = { ...state, status: 'schedule_failed', reason, lastRunIso: new Date().toISOString() };
        setState(next);
        return next;
      })
      .finally(() => { running = null; });
    return running;
  }
  if (!queued) {
    queued = running.then(() => { queued = null; return reconcileReminders(reason); });
  }
  return queued;
}

/** Backwards-compatible name used by older callers. */
export const syncReminders = (): Promise<number> => reconcileReminders('sync').then(s => s.scheduled);

/**
 * Cancel every reminder of ours — before a destructive data replacement (restore / import) — and mark that a
 * reconcile is needed. Call `reconcileReminders('restore')` once the new data is in place (T44).
 */
export async function cancelAllReminders(): Promise<void> {
  if (running) await running.catch(() => undefined);
  const ids = await ourScheduledIds();
  await cancelIds(ids);
  await AsyncStorage.setItem(DEVICE_KEYS.reminderIds, '[]');
  await persistState({ ...state, scheduled: 0, failed: 0, pendingReconcile: true, lastRunIso: new Date().toISOString(), reason: 'cancel_all' });
}

// ─── start-up wiring ────────────────────────────────────────────────────────

const DEBOUNCE_MS = 800;
let registered: (() => void) | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

function later(reason: string) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; reconcileReminders(reason).catch(() => undefined); }, DEBOUNCE_MS);
}

/**
 * Start-up (called from bootstrap `onDataReady`): show reminders while the app is open, reconcile after data or
 * settings change (settings saves emit the data-changed signal), after a scope switch, a language change (the text is
 * fixed when scheduled) and whenever the app comes to the foreground (the plan is bounded, so it rolls forward).
 */
export async function registerReminders(): Promise<void> {
  if (registered) return;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }) as never,
    });
  } catch { /* not available on this platform */ }
  await loadReminderState();
  // The plan needs the stored reminder settings, whatever order the start-up hooks run in.
  await loadSettings().catch(e => logError('reminders.loadSettings', e));
  const offData = onDataChanged(() => later('data'));
  const offScope = onScopeChanged(() => later('scope'));
  const onLang = () => later('language');
  try { i18n.on?.('languageChanged', onLang); } catch { /* ignore */ }
  let appSub: { remove(): void } | undefined;
  try { appSub = AppState?.addEventListener?.('change', s => { if (s === 'active') later('foreground'); }); } catch { /* ignore */ }
  registered = () => {
    offData(); offScope();
    try { i18n.off?.('languageChanged', onLang); } catch { /* ignore */ }
    appSub?.remove();
    if (timer) { clearTimeout(timer); timer = null; }
  };
  reconcileReminders('startup').catch(() => undefined);
}

/** Test helper. */
export function __resetRemindersForTests(): void {
  registered?.();
  registered = null;
  running = null;
  queued = null;
  setState(INITIAL);
}
