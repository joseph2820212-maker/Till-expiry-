/**
 * Derived status of a batch (§9.7). Status is always computed from the stored dates and "now"; it is never stored,
 * so a missed notification or a closed app can never leave a wrong state behind (T45). Checking, snoozing a reminder
 * or moving a batch does not touch these inputs (T09, T10, T20).
 *
 * The words matter: nothing is ever called "safe". Unknown dates are never "okay".
 */
import type { Batch, DeadlineInfo, StatusSettings } from './expiryTypes';
import { daysBetween, deadlineDate, deadlineInstant, todayIn } from './datePrecision';
import { isHardKind } from './expiryValidation';

export type HardStatus = 'unknown' | 'later' | 'soon' | 'urgent' | 'due_today' | 'past_deadline';
export type QualityStatus = 'quality_later' | 'quality_soon' | 'quality_due' | 'quality_past_review';
export type ExpiryStatus = HardStatus | QualityStatus;

export const STATUS_RANK: Record<ExpiryStatus, number> = {
  past_deadline: 0, due_today: 1, urgent: 2, unknown: 3, quality_past_review: 4, soon: 5,
  quality_due: 6, quality_soon: 7, later: 8, quality_later: 9,
};

/** Summary groups on Today (§13). */
export type StatusGroup = 'past_hard' | 'due_today' | 'due_soon' | 'needs_checking' | 'quality_review' | 'later';

export function groupOf(s: ExpiryStatus): StatusGroup {
  switch (s) {
    case 'past_deadline': return 'past_hard';
    case 'due_today': return 'due_today';
    case 'urgent': case 'soon': return 'due_soon';
    case 'unknown': return 'needs_checking';
    case 'quality_past_review': case 'quality_due': case 'quality_soon': return 'quality_review';
    default: return 'later';
  }
}

export interface Evaluation {
  status: ExpiryStatus;
  /** Hard deadline (safety / cutoff) vs quality date. */
  isHard: boolean;
  /** Whole days from today to the deadline day in the workspace zone (negative when past). */
  daysLeft?: number;
  /** Milliseconds left for an exact-time deadline. */
  msLeft?: number;
}

export function evaluateDeadline(info: DeadlineInfo, tz: string, now: number, settings: StatusSettings): Evaluation {
  if (info.dateKind === 'none' || !info.deadline) return { status: 'unknown', isHard: true };
  const hard = isHardKind(info.dateKind);
  const today = todayIn(tz, now);
  const day = deadlineDate(info.deadline, tz);
  const daysLeft = daysBetween(today, day);
  const exact = info.deadline.precision === 'datetime';
  const msLeft = exact ? deadlineInstant(info.deadline, tz) - now : undefined;
  const past = exact ? (msLeft as number) <= 0 : daysLeft < 0;
  if (hard) {
    if (past) return { status: 'past_deadline', isHard: true, daysLeft, msLeft };
    if (daysLeft === 0) return { status: 'due_today', isHard: true, daysLeft, msLeft };
    const urgent = exact ? (msLeft as number) <= settings.urgentHours * 3600000 : daysLeft === 1;
    if (urgent) return { status: 'urgent', isHard: true, daysLeft, msLeft };
    return { status: daysLeft <= settings.soonDays ? 'soon' : 'later', isHard: true, daysLeft, msLeft };
  }
  if (past) return { status: 'quality_past_review', isHard: false, daysLeft, msLeft };
  if (daysLeft === 0) return { status: 'quality_due', isHard: false, daysLeft, msLeft };
  return { status: daysLeft <= settings.soonDays ? 'quality_soon' : 'quality_later', isHard: false, daysLeft, msLeft };
}

export function evaluateBatch(b: Pick<Batch, 'effective' | 'timeZone'>, now: number, settings: StatusSettings): Evaluation {
  return evaluateDeadline(b.effective, b.timeZone, now, settings);
}

/**
 * May a price / markdown action be offered (§17, T57)? Never past a hard deadline, never for an unknown date, and never
 * when a kept secondary hard date (e.g. the original use-by of an opened pack) has passed.
 */
export function priceActionAllowed(b: Pick<Batch, 'effective' | 'secondary' | 'timeZone' | 'status'>, now: number, settings: StatusSettings): boolean {
  if (b.status !== 'active') return false;
  const e = evaluateBatch(b, now, settings);
  if (e.status === 'unknown') return false;
  if (e.isHard && e.status === 'past_deadline') return false;
  if (b.secondary && isHardKind(b.secondary.dateKind)) {
    const s2 = evaluateDeadline(b.secondary, b.timeZone, now, settings);
    if (s2.status === 'past_deadline') return false;
  }
  return true;
}
