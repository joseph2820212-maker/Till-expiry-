/**
 * Reminder planning (§22) — pure. Given every active workspace's active batches, the reminder settings, snoozes and
 * "now", returns the bounded list of local notifications to schedule. Nothing here touches storage or the OS.
 *
 * Four types:
 *  - daily summary: one per morning for the next SUMMARY_DAYS days, with the counts that will be true that morning
 *    (a notification's text is fixed when it is scheduled, so a repeating trigger could not carry the right counts);
 *  - advance warning: N days before the deadline day, at the morning time, in the batch's time zone;
 *  - same-day warning: the morning of the deadline day (only if that morning is still before the deadline);
 *  - exact-time reminder: `leadMinutes` before an exact (datetime) opened / prepared cutoff.
 *
 * Rules: only future triggers; a warning never fires at or after its deadline, so a past item is never announced as a
 * coming one; snoozed batches get no individual warning before the snooze ends (the deadline itself never changes,
 * T09); the list is capped (nearest first) so the OS limit is never reached. Lead times are reminder settings, never
 * shelf-life rules. The Today screen stays the authority: this plan is a convenience layer only.
 *
 * Wording always names the date kind (use-by, best-before, internal cutoff…) and never calls anything "safe".
 */
import type { Batch, StatusSettings, Workspace } from '../../domain/expiry/expiryTypes';
import { addDays, deadlineDate, deadlineInstant, localTimeOf, todayIn, zonedTimeToInstant } from '../../domain/expiry/datePrecision';
import { evaluateDeadline, groupOf, type StatusGroup } from '../../domain/expiry/statusEngine';
import { isHardKind } from '../../domain/expiry/expiryValidation';
import type { ReminderSettings } from '../settings/settingsStore';
import { deadlineLine } from '../batches/format';

export type Translate = (key: string, opts?: Record<string, unknown>) => string;

export type ReminderType = 'summary' | 'advance' | 'same_day' | 'exact';

/** Every identifier this app schedules starts with this prefix, so stale ones can be found and cancelled. */
export const REMINDER_ID_PREFIX = 'tillexpiry:';
/** Safe below the Android (~500) and iOS (64) pending-notification limits, leaving room for the OS. */
export const MAX_PLANNED = 60;
export const SUMMARY_DAYS = 7;
/** Individual warnings further ahead than this are planned on a later reconcile (the app reconciles on every open). */
export const WARNING_HORIZON_DAYS = 45;
const DUPLICATE_WINDOW_MS = 30 * 60000;

export interface PlannedReminder {
  identifier: string;
  type: ReminderType;
  /** Trigger instant (epoch ms). */
  at: number;
  title: string;
  body: string;
  data: { type: ReminderType; workspaceId?: string; batchId?: string };
}

export interface WorkspaceBatches { workspace: Pick<Workspace, 'id' | 'name' | 'timeZone' | 'status'>; batches: Batch[] }

export interface PlanInput {
  workspaces: WorkspaceBatches[];
  settings: ReminderSettings;
  status: StatusSettings;
  /** batchId → ISO instant until which individual warnings for that batch are silenced. */
  snoozes?: Record<string, string>;
  now: number;
  /** Zone of the phone: the daily summary follows the phone's morning. */
  deviceTimeZone: string;
  t: Translate;
  max?: number;
}

const pad = (n: number) => String(n).padStart(2, '0');
const morning = (s: ReminderSettings) => `${pad(s.dailySummary.hour)}:${pad(s.dailySummary.minute)}`;

/** True when at least one of the four types is switched on. */
export function anyReminderEnabled(s: ReminderSettings): boolean {
  return s.dailySummary.enabled || s.advanceDays > 0 || s.sameDay || s.exactTime.enabled;
}

const SUMMARY_ORDER: StatusGroup[] = ['past_hard', 'due_today', 'due_soon', 'needs_checking', 'quality_review'];
const SUMMARY_KEY: Record<string, string> = {
  past_hard: 'reminders.summaryPastHard',
  due_today: 'reminders.summaryDueToday',
  due_soon: 'reminders.summaryDueSoon',
  needs_checking: 'reminders.summaryNeedsChecking',
  quality_review: 'reminders.summaryQualityReview',
};

function isLive(b: Batch, workspaceId: string): boolean {
  return b.status === 'active' && b.workspaceId === workspaceId;
}

function snoozedUntil(snoozes: Record<string, string> | undefined, batchId: string): number {
  const v = snoozes?.[batchId];
  const ms = v ? Date.parse(v) : NaN;
  return Number.isFinite(ms) ? ms : -Infinity;
}

export function planReminders(input: PlanInput): PlannedReminder[] {
  const { settings: s, now, t } = input;
  const max = input.max ?? MAX_PLANNED;
  const live = input.workspaces
    .filter(w => w.workspace.status === 'active')
    .map(w => ({ workspace: w.workspace, batches: w.batches.filter(b => isLive(b, w.workspace.id)) }));
  const multi = live.length > 1;
  const out: PlannedReminder[] = [];

  // ── daily summary ────────────────────────────────────────────────────────
  if (s.dailySummary.enabled) {
    const today = todayIn(input.deviceTimeZone, now);
    for (let i = 0; i < SUMMARY_DAYS; i++) {
      const day = addDays(today, i);
      const at = zonedTimeToInstant(day, morning(s), input.deviceTimeZone);
      if (at <= now) continue;
      const counts: Partial<Record<StatusGroup, number>> = {};
      for (const w of live) {
        for (const b of w.batches) {
          const g = groupOf(evaluateDeadline(b.effective, b.timeZone || w.workspace.timeZone, at, input.status).status);
          counts[g] = (counts[g] ?? 0) + 1;
        }
      }
      const parts = SUMMARY_ORDER.filter(g => counts[g]).map(g => t(SUMMARY_KEY[g], { count: counts[g] }));
      if (!parts.length) continue;
      out.push({ identifier: `${REMINDER_ID_PREFIX}summary:${day}`, type: 'summary', at, title: t('reminders.summaryTitle'), body: parts.join(' · '), data: { type: 'summary' } });
    }
  }

  // ── individual warnings ─────────────────────────────────────────────────
  const horizon = now + WARNING_HORIZON_DAYS * 86400000;
  for (const w of live) {
    for (const b of w.batches) {
      const info = b.effective;
      if (info.dateKind === 'none' || !info.deadline) continue;
      const tz = b.timeZone || w.workspace.timeZone;
      let deadlineAt: number;
      let deadlineDay: string;
      try {
        deadlineAt = deadlineInstant(info.deadline, tz);
        deadlineDay = deadlineDate(info.deadline, tz);
      } catch { continue; }
      if (!Number.isFinite(deadlineAt) || deadlineAt <= now) continue; // past: Today shows it; never a "coming" warning
      const hard = isHardKind(info.dateKind);
      const until = snoozedUntil(input.snoozes, b.id);
      const line = deadlineLine(t, info, tz);
      const body = multi ? t('reminders.bodyWithWorkspace', { workspace: w.workspace.name, product: b.productName, deadline: line }) : t('reminders.body', { product: b.productName, deadline: line });
      const add = (type: ReminderType, at: number, title: string) => {
        if (!Number.isFinite(at) || at <= now || at >= deadlineAt || at > horizon || at < until) return;
        out.push({ identifier: `${REMINDER_ID_PREFIX}${type}:${b.id}:${at}`, type, at, title, body, data: { type, workspaceId: w.workspace.id, batchId: b.id } });
      };
      if (s.advanceDays > 0) {
        let at = NaN;
        try { at = zonedTimeToInstant(addDays(deadlineDay, -s.advanceDays), morning(s), tz); } catch { /* skipped */ }
        add('advance', at, t(hard ? 'reminders.advanceHardTitle' : 'reminders.advanceQualityTitle', { kind: t(`dateKind.${info.dateKind}`), days: s.advanceDays }));
      }
      const exactAt = s.exactTime.enabled && info.deadline.precision === 'datetime' ? deadlineAt - s.exactTime.leadMinutes * 60000 : NaN;
      if (s.sameDay) {
        let at = NaN;
        try { at = zonedTimeToInstant(deadlineDay, morning(s), tz); } catch { /* skipped */ }
        // Within half an hour of the exact-time reminder, the same-day one would only repeat it.
        if (!(Number.isFinite(exactAt) && exactAt > now && Math.abs(exactAt - at) < DUPLICATE_WINDOW_MS)) {
          add('same_day', at, t(hard ? 'reminders.sameDayHardTitle' : 'reminders.sameDayQualityTitle', { kind: t(`dateKind.${info.dateKind}`) }));
        }
      }
      if (Number.isFinite(exactAt)) {
        add('exact', exactAt, t(hard ? 'reminders.exactHardTitle' : 'reminders.exactQualityTitle', { kind: t(`dateKind.${info.dateKind}`), time: localTimeOf(deadlineAt, tz) }));
      }
    }
  }

  // Nearest first, then a stable order; the cap keeps the plan bounded.
  out.sort((a, b) => a.at - b.at || (a.identifier < b.identifier ? -1 : a.identifier > b.identifier ? 1 : 0));
  return out.slice(0, Math.max(0, max));
}
