import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { planReminders, REMINDER_ID_PREFIX } from '../reminderPlan';
import { reminderContent, syncReminders } from '../reminderService';
import { TE_KEYS } from '../../../storage/keys';
import { addDate } from '../../dates/storage/batchStore';
import { loadSettings, resetSettingsCache, updateSettings, sanitizeSettings } from '../../settings/settingsStore';
import type { DateBatch } from '../../../domain/types';

const N = Notifications as any;
const at = '2026-09-01T00:00:00Z';
const B = (id: string, date: string, over: Partial<DateBatch> = {}): DateBatch => ({ schemaVersion: 1, id, productId: 'p', productName: 'P', date, dateType: 'useBy', status: 'open', events: [], createdAt: at, updatedAt: at, ...over });

beforeEach(() => { (AsyncStorage as any).clear(); N.__reset(); resetSettingsCache(); });

describe('reminder plan (pure)', () => {
  const on = { enabled: true, hour: 8, minute: 30 };
  it('plans one reminder per day with that morning\'s counts, skips empty days and a time already passed today', () => {
    const list = [B('a', '2026-09-24'), B('b', '2026-09-26'), B('c', '2026-10-20'), B('d', '2026-09-20', { status: 'closed' })];
    const plan = planReminders(list, () => 2, on, '2026-09-24', 7 * 60);
    expect(plan.map(p => [p.day, p.expired, p.dueToday, p.dueSoon])).toEqual([
      ['2026-09-24', 0, 1, 1],
      ['2026-09-25', 1, 0, 1],
      ['2026-09-26', 1, 1, 0],
      ['2026-09-27', 2, 0, 0],
      ['2026-09-28', 2, 0, 0],
      ['2026-09-29', 2, 0, 0],
      ['2026-09-30', 2, 0, 0],
    ]);
    expect(plan[0].identifier).toBe(`${REMINDER_ID_PREFIX}2026-09-24`);
    expect(planReminders(list, () => 2, on, '2026-09-24', 9 * 60)[0].day).toBe('2026-09-25');
    expect(planReminders([B('z', '2027-01-01')], () => 3, on, '2026-09-24', 0)).toEqual([]);
    expect(planReminders(list, () => 2, { ...on, enabled: false }, '2026-09-24', 0)).toEqual([]);
  });
  it('the text lists only the non-zero parts, in the app language', () => {
    expect(reminderContent({ identifier: 'x', day: '2026-09-24', hour: 8, minute: 0, expired: 2, dueToday: 0, dueSoon: 5 })).toEqual({ title: 'Date check', body: 'Expired: 2 · Due soon: 5' });
  });
});

describe('scheduling', () => {
  it('schedules nothing while reminders are off or permission is missing, and never asks for permission itself', async () => {
    await addDate({ newProduct: { name: 'Milk' }, date: '2026-09-24', dateType: 'useBy' });
    expect(await syncReminders(new Date(2026, 8, 24, 6, 0))).toBe(0);
    await updateSettings({ reminder: { enabled: true } });
    expect(await syncReminders(new Date(2026, 8, 24, 6, 0))).toBe(0);
    expect(N.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(await N.getAllScheduledNotificationsAsync()).toEqual([]);
  });
  it('replaces its own reminders on every sync and cancels them all when turned off', async () => {
    N.__setPermission('granted');
    await updateSettings({ reminder: { enabled: true, hour: 8 } });
    await addDate({ newProduct: { name: 'Milk' }, date: '2026-09-25', dateType: 'useBy' });
    await N.scheduleNotificationAsync({ identifier: 'someone-else', content: {}, trigger: null });
    const n = await syncReminders(new Date(2026, 8, 24, 6, 0));
    expect(n).toBe(7);
    let ours = (await N.getAllScheduledNotificationsAsync()).filter((x: any) => x.identifier.startsWith(REMINDER_ID_PREFIX));
    expect(ours).toHaveLength(7);
    expect(ours[0].trigger.date).toEqual(new Date(2026, 8, 24, 8, 0));
    expect(JSON.parse((await AsyncStorage.getItem(TE_KEYS.reminderIds))!)).toHaveLength(7);
    await syncReminders(new Date(2026, 8, 24, 6, 0));
    ours = (await N.getAllScheduledNotificationsAsync()).filter((x: any) => x.identifier.startsWith(REMINDER_ID_PREFIX));
    expect(ours).toHaveLength(7);
    await updateSettings({ reminder: { enabled: false } });
    expect(await syncReminders(new Date(2026, 8, 24, 6, 0))).toBe(0);
    const left = await N.getAllScheduledNotificationsAsync();
    expect(left.map((x: any) => x.identifier)).toEqual(['someone-else']);
  });
});

describe('settings', () => {
  it('repairs bad stored values and survives a reload', async () => {
    expect(sanitizeSettings({ alertDays: 999, defaultDateType: 'nope' as any, reminder: { enabled: 'yes' as any, hour: 25, minute: -1 } })).toEqual({
      schemaVersion: 1, alertDays: 60, defaultDateType: 'bestBefore', reminder: { enabled: false, hour: 8, minute: 0 },
    });
    await updateSettings({ alertDays: 5, defaultDateType: 'useBy', reminder: { hour: 7 } });
    resetSettingsCache();
    expect(await loadSettings()).toMatchObject({ alertDays: 5, defaultDateType: 'useBy', reminder: { enabled: false, hour: 7, minute: 0 } });
  });
});
