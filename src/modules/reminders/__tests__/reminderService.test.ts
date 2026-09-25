/** §22 / §31 T39–T45, T09: reminder reconciliation against the real storage layer and the expo-notifications mock. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as N from 'expo-notifications';
import { createWorkspace, __resetWorkspaceCache } from '../../workspaces/workspaceStore';
import { correctDeadline, createDatedBatch, getBatch, setBatchArchived } from '../../batches/batchStore';
import * as batchStore from '../../batches/batchStore';
import { saveReminderSettings, __resetSettingsForTests } from '../../settings/settingsStore';
import { DEVICE_KEYS } from '../../../storage/keys';
import { __setScopeForTests } from '../../../storage/scope';
import { addDays, todayIn, zonedIso } from '../../../domain/expiry/datePrecision';
import { evaluateBatch } from '../../../domain/expiry/statusEngine';
import { DEFAULT_STATUS_SETTINGS } from '../../../domain/expiry/expiryTypes';
import { cancelAllReminders, getReminderState, reconcileReminders, registerReminders, snoozeBatchReminder, __resetRemindersForTests } from '../reminderService';
import { REMINDER_ID_PREFIX } from '../reminderPlan';

const mock = N as any;
const store = AsyncStorage as any;
const TZ = 'Europe/London';
const today = todayIn(TZ);

async function scheduledIds(): Promise<string[]> {
  return (await N.getAllScheduledNotificationsAsync()).map(n => n.identifier).sort();
}
async function storedIds(): Promise<string[]> {
  return JSON.parse((await AsyncStorage.getItem(DEVICE_KEYS.reminderIds)) ?? '[]');
}
async function setup() {
  const w = await createWorkspace({ name: 'Corner Shop', mode: 'mixed', currency: 'GBP', timeZone: TZ });
  const a = await createDatedBatch({ workspaceId: w.id, kind: 'bought_in', newProduct: { name: 'Milk' }, dateKind: 'use_by', deadline: { precision: 'date', date: addDays(today, 5) } });
  const b = await createDatedBatch({ workspaceId: w.id, kind: 'bought_in', newProduct: { name: 'Biscuits' }, dateKind: 'best_before', deadline: { precision: 'date', date: addDays(today, 10) } });
  return { w, a, b };
}
const forBatch = (ids: string[], batchId: string) => ids.filter(id => id.includes(`:${batchId}:`));

beforeEach(() => {
  store.clear();
  mock.__reset();
  jest.clearAllMocks();
  __resetWorkspaceCache();
  __resetSettingsForTests();
  __resetRemindersForTests();
  __setScopeForTests('real');
});

describe('reminder reconciliation', () => {
  it('T39/T40 without permission: nothing scheduled, permission_required is recorded, the data is untouched', async () => {
    const { w, a } = await setup();
    const s = await reconcileReminders('test');
    expect(s.status).toBe('permission_required');
    expect(s.planned).toBeGreaterThan(0);
    expect(await scheduledIds()).toEqual([]);
    expect(JSON.parse((await AsyncStorage.getItem(DEVICE_KEYS.reminderState))!).status).toBe('permission_required');
    expect((await getBatch(w.id, a.id))?.effective).toEqual(a.effective);
    mock.__setPermission('denied');
    expect((await reconcileReminders()).status).toBe('permission_required');
  });

  it('schedules the plan, persists the device-local ids, and a repeat creates no duplicates', async () => {
    const { a, b } = await setup();
    mock.__setPermission('granted');
    const s1 = await reconcileReminders();
    expect(s1.status).toBe('ok');
    expect(s1.scheduled).toBe(s1.planned);
    const ids1 = await scheduledIds();
    expect(ids1.length).toBe(s1.scheduled);
    expect(forBatch(ids1, a.id).length).toBe(2); // advance + same-day
    expect(forBatch(ids1, b.id).length).toBe(2);
    expect((await storedIds()).sort()).toEqual(ids1);
    const s2 = await reconcileReminders();
    expect(await scheduledIds()).toEqual(ids1);
    expect(s2.scheduled).toBe(s1.scheduled);
    expect(s2.lastRunIso).toBeTruthy();
  });

  it('overlapping requests are serialized and collapse into one follow-up run', async () => {
    await setup();
    mock.__setPermission('granted');
    let active = 0, maxActive = 0;
    const orig = mock.getPermissionsAsync.getMockImplementation();
    mock.getPermissionsAsync.mockImplementation(async () => { active++; maxActive = Math.max(maxActive, active); await new Promise(r => setTimeout(r, 5)); active--; return orig(); });
    const [x, y, z] = await Promise.all([reconcileReminders('a'), reconcileReminders('b'), reconcileReminders('c')]);
    expect(maxActive).toBe(1);
    expect(mock.getPermissionsAsync).toHaveBeenCalledTimes(2);
    expect(y).toBe(z);
    expect(x.status).toBe('ok');
    const ids = await scheduledIds();
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('T42 a deadline correction replaces the stale reminder; T43 archiving removes it', async () => {
    const { w, a, b } = await setup();
    mock.__setPermission('granted');
    await reconcileReminders();
    const before = forBatch(await scheduledIds(), a.id);
    await correctDeadline(w.id, a.id, 'use_by', { precision: 'date', date: addDays(today, 7) }, 'Supplier label');
    await reconcileReminders();
    const after = forBatch(await scheduledIds(), a.id);
    expect(after.length).toBe(2);
    expect(after.some(id => before.includes(id))).toBe(false);
    await setBatchArchived(w.id, b.id, true);
    await reconcileReminders();
    expect(forBatch(await scheduledIds(), b.id)).toEqual([]);
  });

  it('T41 a schedule error is recorded as schedule_failed, the rest stays scheduled, and a retry recovers', async () => {
    const { w, a } = await setup();
    mock.__setPermission('granted');
    const orig = mock.scheduleNotificationAsync.getMockImplementation();
    mock.scheduleNotificationAsync.mockImplementation(async (req: any) => {
      if (String(req.identifier).includes(`:${a.id}:`)) throw new Error('OS limit');
      return orig(req);
    });
    const s = await reconcileReminders();
    expect(s.status).toBe('schedule_failed');
    expect(s.failed).toBe(2);
    expect(s.scheduled).toBe(s.planned - 2);
    expect((await scheduledIds()).length).toBe(s.scheduled);
    // T45: status on Today is computed from data, never from the schedule.
    const batch = await getBatch(w.id, a.id);
    expect(evaluateBatch(batch!, Date.now(), DEFAULT_STATUS_SETTINGS).status).toBe('later');
    mock.scheduleNotificationAsync.mockImplementation(orig);
    const again = await reconcileReminders('retry');
    expect(again.status).toBe('ok');
    expect(forBatch(await scheduledIds(), a.id).length).toBe(2);
  });

  it('a data read failure keeps the existing schedule and reports schedule_failed', async () => {
    await setup();
    mock.__setPermission('granted');
    const ok = await reconcileReminders();
    const ids = await scheduledIds();
    const orig = store.getItem.getMockImplementation();
    store.getItem.mockImplementation(async (k: string) => { if (k.startsWith('workspaces:')) throw new Error('disk'); return orig(k); });
    let s;
    try { s = await reconcileReminders(); } finally { store.getItem.mockImplementation(orig); }
    expect(s.status).toBe('schedule_failed');
    expect(s.scheduled).toBe(ok.scheduled);
    expect(await scheduledIds()).toEqual(ids);
  });

  it('T44 cancelAll removes every reminder of ours (also untracked ones) and a later reconcile reschedules from data', async () => {
    await setup();
    mock.__setPermission('granted');
    await reconcileReminders();
    await N.scheduleNotificationAsync({ identifier: `${REMINDER_ID_PREFIX}advance:restored-old:1`, content: {}, trigger: null } as any);
    await N.scheduleNotificationAsync({ identifier: 'other-app-feature', content: {}, trigger: null } as any);
    await cancelAllReminders();
    expect(await scheduledIds()).toEqual(['other-app-feature']);
    expect(await storedIds()).toEqual([]);
    expect(getReminderState().pendingReconcile).toBe(true);
    // Restore leaves a stale id of ours on the device: the next reconcile cancels it.
    await N.scheduleNotificationAsync({ identifier: `${REMINDER_ID_PREFIX}same_day:gone:2`, content: {}, trigger: null } as any);
    const s = await reconcileReminders('restore');
    expect(s.status).toBe('ok');
    expect(s.pendingReconcile).toBeUndefined();
    const ids = await scheduledIds();
    expect(ids).not.toContain(`${REMINDER_ID_PREFIX}same_day:gone:2`);
    expect(ids).toContain('other-app-feature');
    expect(ids.length).toBe(s.scheduled + 1);
  });

  it('T09 a snooze removes the batch warnings before it ends and never changes the deadline or status', async () => {
    const { w, a } = await setup();
    mock.__setPermission('granted');
    await reconcileReminders();
    const before = await getBatch(w.id, a.id);
    const until = zonedIso(addDays(today, 4), '12:00', TZ); // after the advance warning (day 4, 08:00), before the same-day one (day 5)
    const s = await snoozeBatchReminder(a.id, until);
    expect(s.status).toBe('ok');
    expect(forBatch(await scheduledIds(), a.id).map(id => id.split(':')[1])).toEqual(['same_day']);
    const after = await getBatch(w.id, a.id);
    expect(after).toEqual(before);
    expect(evaluateBatch(after!, Date.now(), DEFAULT_STATUS_SETTINGS)).toEqual(evaluateBatch(before!, Date.now(), DEFAULT_STATUS_SETTINGS));
    expect(JSON.parse((await AsyncStorage.getItem(DEVICE_KEYS.snoozes))!)[a.id]).toBe(until);
    await expect(snoozeBatchReminder(a.id, 'soon')).rejects.toThrow();
  });

  it('a snooze saved while a reconcile is loading data survives that reconcile pruning an expired snooze', async () => {
    const { a, b } = await setup();
    mock.__setPermission('granted');
    await AsyncStorage.setItem(DEVICE_KEYS.snoozes, JSON.stringify({ [b.id]: new Date(Date.now() - 60_000).toISOString() }));
    const until = zonedIso(addDays(today, 4), '12:00', TZ);
    // Hold the reconcile inside its data load until the user's snooze is on disk.
    let release!: () => void;
    const gate = new Promise<void>(r => { release = r; });
    const realList = batchStore.listBatches;
    const spy = jest.spyOn(batchStore, 'listBatches').mockImplementationOnce(async (...args) => { await gate; return realList(...args); });
    const running = reconcileReminders('foreground');
    while (!spy.mock.calls.length) await new Promise(r => setTimeout(r, 1));
    const snoozed = snoozeBatchReminder(a.id, until);
    while (!(await AsyncStorage.getItem(DEVICE_KEYS.snoozes))?.includes(a.id)) await new Promise(r => setTimeout(r, 1));
    release();
    await Promise.all([running, snoozed]);
    spy.mockRestore();
    expect(JSON.parse((await AsyncStorage.getItem(DEVICE_KEYS.snoozes))!)).toEqual({ [a.id]: until });
    expect(forBatch(await scheduledIds(), a.id).map(id => id.split(':')[1])).toEqual(['same_day']);
  });

  it('turning every type off cancels ours and records off', async () => {
    await setup();
    mock.__setPermission('granted');
    await reconcileReminders();
    await saveReminderSettings({ dailySummary: { enabled: false, hour: 8, minute: 0 }, advanceDays: 0, sameDay: false, exactTime: { enabled: false, leadMinutes: 60 } });
    const s = await reconcileReminders();
    expect(s.status).toBe('off');
    expect(await scheduledIds()).toEqual([]);
  });

  it('demo data never schedules device notifications and leaves the real schedule untouched', async () => {
    await setup();
    mock.__setPermission('granted');
    await reconcileReminders();
    const ids = await scheduledIds();
    __setScopeForTests('demo');
    const s = await reconcileReminders('scope');
    expect(s.demoActive).toBe(true);
    expect(await scheduledIds()).toEqual(ids);
    __setScopeForTests('real');
  });

  it('registerReminders runs one reconcile at start and a debounced one after a data change', async () => {
    const { w } = await setup();
    mock.__setPermission('granted');
    await registerReminders();
    await registerReminders(); // idempotent
    await new Promise(r => setTimeout(r, 20));
    const first = getReminderState();
    expect(first.status).toBe('ok');
    expect(first.reason).toBe('startup');
    const c = await createDatedBatch({ workspaceId: w.id, kind: 'bought_in', newProduct: { name: 'Ham' }, dateKind: 'use_by', deadline: { precision: 'date', date: addDays(today, 3) } });
    await new Promise(r => setTimeout(r, 1000));
    expect(getReminderState().reason).toBe('data');
    expect(forBatch(await scheduledIds(), c.id).length).toBe(2);
  });
});
