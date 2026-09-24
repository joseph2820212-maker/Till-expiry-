/**
 * Reminder planning (pure). A local notification's text is fixed when it is scheduled, so instead of one
 * repeating reminder the app schedules one reminder per day for the next REMINDER_HORIZON_DAYS days, each with
 * the counts that will be true on that morning. A day with nothing expired or due gets no reminder.
 * The plan is rebuilt whenever dates change and every time the app opens.
 */
import type { DateBatch, LocalDate, ReminderSettings } from '../../domain/types';
import { addDays } from '../../domain/dates';
import { bandFor } from '../../domain/expiry';

export const REMINDER_HORIZON_DAYS = 7;
export const REMINDER_ID_PREFIX = 'tillexpiry-daily-';

export interface PlannedReminder {
  identifier: string;
  day: LocalDate;
  hour: number;
  minute: number;
  expired: number;
  dueToday: number;
  dueSoon: number;
}

/**
 * The reminders to schedule, given the open dates now. `nowDay`/`nowMinutes` stop a reminder being planned for a
 * time that has already passed today.
 */
export function planReminders(
  batches: DateBatch[],
  alertDaysOf: (b: DateBatch) => number,
  settings: ReminderSettings,
  nowDay: LocalDate,
  nowMinutes: number,
): PlannedReminder[] {
  if (!settings.enabled) return [];
  const open = batches.filter(b => b.status === 'open');
  const out: PlannedReminder[] = [];
  for (let i = 0; i < REMINDER_HORIZON_DAYS; i++) {
    const day = addDays(nowDay, i);
    if (i === 0 && settings.hour * 60 + settings.minute <= nowMinutes) continue;
    let expired = 0, dueToday = 0, dueSoon = 0;
    for (const b of open) {
      const band = bandFor(b.date, day, alertDaysOf(b));
      if (band === 'expired') expired++;
      else if (band === 'today') dueToday++;
      else if (band === 'soon') dueSoon++;
    }
    if (expired + dueToday + dueSoon === 0) continue;
    out.push({ identifier: `${REMINDER_ID_PREFIX}${day}`, day, hour: settings.hour, minute: settings.minute, expired, dueToday, dueSoon });
  }
  return out;
}
