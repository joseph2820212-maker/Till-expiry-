/**
 * Local reminders through expo-notifications. Nothing is sent to a server: the operating system shows a
 * notification that this app scheduled on the device. Permission is asked only when the user turns reminders on
 * (after an in-app explanation), never at start-up.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import i18n from '../../i18n';
import { TE_KEYS } from '../../storage/keys';
import { onDataChanged } from '../../storage/changeBus';
import { todayLocal } from '../../domain/dates';
import { alertDaysFor } from '../../domain/expiry';
import type { DateBatch, Product } from '../../domain/types';
import { listBatches } from '../dates/storage/batchStore';
import { listProducts } from '../products/storage/productStore';
import { getSettings } from '../settings/settingsStore';
import { planReminders, REMINDER_ID_PREFIX, type PlannedReminder } from './reminderPlan';
import { logError } from '../../utils/errorLog';

export const CHANNEL_ID = 'date-reminders';

export type PermissionState = 'granted' | 'denied' | 'undetermined';

export async function getReminderPermission(): Promise<PermissionState> {
  try {
    const p = await Notifications.getPermissionsAsync();
    if (p.granted) return 'granted';
    return p.canAskAgain === false ? 'denied' : 'undetermined';
  } catch { return 'undetermined'; }
}

export async function requestReminderPermission(): Promise<PermissionState> {
  try {
    await ensureChannel();
    const p = await Notifications.requestPermissionsAsync();
    if (p.granted) return 'granted';
    return p.canAskAgain === false ? 'denied' : 'undetermined';
  } catch { return 'denied'; }
}

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, { name: i18n.t('reminders.channelName'), importance: Notifications.AndroidImportance.DEFAULT });
}

/** The notification text for one planned day, in the app language. */
export function reminderContent(r: PlannedReminder): { title: string; body: string } {
  const parts: string[] = [];
  if (r.expired) parts.push(i18n.t('reminders.partExpired', { count: r.expired }));
  if (r.dueToday) parts.push(i18n.t('reminders.partToday', { count: r.dueToday }));
  if (r.dueSoon) parts.push(i18n.t('reminders.partSoon', { count: r.dueSoon }));
  return { title: i18n.t('reminders.title'), body: parts.join(' · ') };
}

async function cancelOurs(): Promise<void> {
  let ids: string[] = [];
  try { ids = JSON.parse((await AsyncStorage.getItem(TE_KEYS.reminderIds)) ?? '[]'); } catch { ids = []; }
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of all) if (n.identifier.startsWith(REMINDER_ID_PREFIX) && !ids.includes(n.identifier)) ids.push(n.identifier);
  } catch { /* keep the stored list */ }
  for (const id of ids) await Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined);
  await AsyncStorage.removeItem(TE_KEYS.reminderIds).catch(() => undefined);
}

function triggerDate(r: PlannedReminder): Date {
  const [y, m, d] = r.day.split('-').map(Number);
  return new Date(y, m - 1, d, r.hour, r.minute, 0, 0);
}

let running: Promise<number> | null = null;
let again = false;

/**
 * Cancel this app's reminders and schedule the plan for the next days. Returns how many were scheduled.
 * Concurrent calls collapse into one follow-up run so the schedule always reflects the last change.
 */
export function syncReminders(now: Date = new Date()): Promise<number> {
  if (running) { again = true; return running; }
  running = (async () => {
    let n = 0;
    try {
      do {
        again = false;
        n = await syncOnce(now);
      } while (again);
    } finally { running = null; }
    return n;
  })();
  return running;
}

async function syncOnce(now: Date): Promise<number> {
  try {
    const settings = getSettings();
    await cancelOurs();
    if (!settings.reminder.enabled) return 0;
    if ((await getReminderPermission()) !== 'granted') return 0;
    await ensureChannel();
    const [batches, products] = await Promise.all([listBatches({ status: 'open' }), listProducts({ includeArchived: true })]);
    const byId = new Map<string, Product>(products.map(p => [p.id, p]));
    const plan = planReminders(batches, (b: DateBatch) => alertDaysFor(byId.get(b.productId), settings.alertDays), settings.reminder, todayLocal(now), now.getHours() * 60 + now.getMinutes());
    const ids: string[] = [];
    for (const r of plan) {
      const content = reminderContent(r);
      await Notifications.scheduleNotificationAsync({
        identifier: r.identifier,
        content: { title: content.title, body: content.body, data: { screen: 'Dates' } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: triggerDate(r), channelId: CHANNEL_ID } as any,
      });
      ids.push(r.identifier);
    }
    await AsyncStorage.setItem(TE_KEYS.reminderIds, JSON.stringify(ids)).catch(() => undefined);
    return ids.length;
  } catch (e) {
    logError('reminders.sync', e);
    return 0;
  }
}

let unsubscribe: (() => void) | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

/** Start-up: show reminders while the app is open too, and reschedule shortly after any date changes. */
export function startReminderSync(): void {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }) as any,
    });
  } catch { /* not available on this platform */ }
  if (unsubscribe) return;
  const later = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; syncReminders().catch(() => undefined); }, 800);
  };
  const offData = onDataChanged(later);
  // The notification text is fixed when scheduled: a new app language needs a new schedule.
  i18n.on('languageChanged', later);
  unsubscribe = () => { offData(); i18n.off('languageChanged', later); };
  syncReminders().catch(() => undefined);
}
