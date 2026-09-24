/**
 * Shop settings for dates and reminders. One small record, cached in memory so every screen reads the same
 * values synchronously; `useExpirySettings()` re-renders when they change (e.g. after a restore).
 */
import { useSyncExternalStore } from 'react';
import { TE_KEYS } from '../../storage/keys';
import { readObject, writeObject } from '../../storage/repo';
import { DATE_TYPES, DEFAULT_SETTINGS, type ExpirySettings } from '../../domain/types';
import { clampAlertDays } from '../../domain/expiry';

let current: ExpirySettings = DEFAULT_SETTINGS;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

/** Repair anything a hand-edited or older file could contain; unknown values fall back to the defaults. */
export function sanitizeSettings(raw: Partial<ExpirySettings> | null | undefined): ExpirySettings {
  const r = raw ?? {};
  const rem = (r.reminder ?? {}) as Partial<ExpirySettings['reminder']>;
  const int = (v: unknown, lo: number, hi: number, fb: number) => (typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : fb);
  return {
    schemaVersion: 1,
    alertDays: clampAlertDays(r.alertDays, DEFAULT_SETTINGS.alertDays),
    defaultDateType: DATE_TYPES.includes(r.defaultDateType as any) ? (r.defaultDateType as ExpirySettings['defaultDateType']) : DEFAULT_SETTINGS.defaultDateType,
    reminder: {
      enabled: rem.enabled === true,
      hour: int(rem.hour, 0, 23, DEFAULT_SETTINGS.reminder.hour),
      minute: int(rem.minute, 0, 59, DEFAULT_SETTINGS.reminder.minute),
    },
  };
}

export async function loadSettings(): Promise<ExpirySettings> {
  current = sanitizeSettings(await readObject<Partial<ExpirySettings>>(TE_KEYS.settings, DEFAULT_SETTINGS));
  emit();
  return current;
}

export function getSettings(): ExpirySettings {
  return current;
}

export async function updateSettings(patch: Partial<Omit<ExpirySettings, 'reminder'>> & { reminder?: Partial<ExpirySettings['reminder']> }): Promise<ExpirySettings> {
  const next = sanitizeSettings({ ...current, ...patch, reminder: { ...current.reminder, ...(patch.reminder ?? {}) } });
  await writeObject(TE_KEYS.settings, next);
  current = next;
  emit();
  return next;
}

export function subscribeSettings(l: () => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export function useExpirySettings(): ExpirySettings {
  return useSyncExternalStore(subscribeSettings, getSettings, getSettings);
}

/** Test helper: back to defaults without touching storage. */
export function resetSettingsCache(): void {
  current = DEFAULT_SETTINGS;
  emit();
}
