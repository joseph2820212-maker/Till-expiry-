/**
 * General and reminder settings (§22). Stored per data scope (real / demo), cached in memory so every screen reads the
 * same values synchronously. Notification lead times are reminder settings, never shelf-life rules.
 */
import { useSyncExternalStore } from 'react';
import { K } from '../../storage/keys';
import { readRecord, runTxn } from '../../storage/entityStore';
import { onScopeChanged } from '../../storage/scope';
import { notifyDataChanged } from '../../storage/changeBus';
import { DEFAULT_STATUS_SETTINGS, type StatusSettings } from '../../domain/expiry/expiryTypes';

export interface GeneralSettings extends StatusSettings { schemaVersion: 1 }

export interface ReminderSettings {
  schemaVersion: 1;
  /** Morning summary of what needs attention. */
  dailySummary: { enabled: boolean; hour: number; minute: number };
  /** Warning N days before a date-only deadline (0 = off). */
  advanceDays: number;
  /** Warning on the morning of the deadline day. */
  sameDay: boolean;
  /** Warning shortly before an exact-time (opened / prepared) cutoff; lead in minutes. */
  exactTime: { enabled: boolean; leadMinutes: number };
}

export const DEFAULT_GENERAL: GeneralSettings = { schemaVersion: 1, ...DEFAULT_STATUS_SETTINGS };
export const DEFAULT_REMINDERS: ReminderSettings = {
  schemaVersion: 1,
  dailySummary: { enabled: true, hour: 8, minute: 0 },
  advanceDays: 1,
  sameDay: true,
  exactTime: { enabled: true, leadMinutes: 60 },
};

const int = (v: unknown, lo: number, hi: number, fb: number) => (typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : fb);

export function sanitizeGeneral(r: Partial<GeneralSettings> | null | undefined): GeneralSettings {
  const x = r ?? {};
  return { schemaVersion: 1, soonDays: int(x.soonDays, 1, 60, DEFAULT_GENERAL.soonDays), urgentHours: int(x.urgentHours, 1, 72, DEFAULT_GENERAL.urgentHours) };
}

export function sanitizeReminders(r: Partial<ReminderSettings> | null | undefined): ReminderSettings {
  const x = (r ?? {}) as Partial<ReminderSettings>;
  const d = (x.dailySummary ?? {}) as Partial<ReminderSettings['dailySummary']>;
  const e = (x.exactTime ?? {}) as Partial<ReminderSettings['exactTime']>;
  return {
    schemaVersion: 1,
    dailySummary: { enabled: typeof d.enabled === 'boolean' ? d.enabled : DEFAULT_REMINDERS.dailySummary.enabled, hour: int(d.hour, 0, 23, 8), minute: int(d.minute, 0, 59, 0) },
    advanceDays: int(x.advanceDays, 0, 14, DEFAULT_REMINDERS.advanceDays),
    sameDay: typeof x.sameDay === 'boolean' ? x.sameDay : DEFAULT_REMINDERS.sameDay,
    exactTime: { enabled: typeof e.enabled === 'boolean' ? e.enabled : true, leadMinutes: int(e.leadMinutes, 0, 24 * 60, 60) },
  };
}

let general = DEFAULT_GENERAL;
let reminders = DEFAULT_REMINDERS;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

export async function loadSettings(): Promise<void> {
  general = sanitizeGeneral(await readRecord<Partial<GeneralSettings>>(K.settingsGeneral));
  reminders = sanitizeReminders(await readRecord<Partial<ReminderSettings>>(K.settingsReminders));
  emit();
}
onScopeChanged(() => { loadSettings().catch(() => undefined); });

export const getGeneral = () => general;
export const getReminderSettings = () => reminders;

export async function saveGeneral(patch: Partial<GeneralSettings>): Promise<GeneralSettings> {
  const next = sanitizeGeneral({ ...general, ...patch });
  await runTxn(async tx => { tx.set(K.settingsGeneral, next); });
  general = next; emit(); notifyDataChanged();
  return next;
}

export async function saveReminderSettings(patch: Partial<ReminderSettings>): Promise<ReminderSettings> {
  const next = sanitizeReminders({ ...reminders, ...patch, dailySummary: { ...reminders.dailySummary, ...(patch.dailySummary ?? {}) }, exactTime: { ...reminders.exactTime, ...(patch.exactTime ?? {}) } });
  await runTxn(async tx => { tx.set(K.settingsReminders, next); });
  reminders = next; emit(); notifyDataChanged();
  return next;
}

function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }
export const useGeneralSettings = () => useSyncExternalStore(subscribe, getGeneral, getGeneral);
export const useReminderSettings = () => useSyncExternalStore(subscribe, getReminderSettings, getReminderSettings);

export function __resetSettingsForTests(): void { general = DEFAULT_GENERAL; reminders = DEFAULT_REMINDERS; emit(); }
