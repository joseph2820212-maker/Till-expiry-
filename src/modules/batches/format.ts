/**
 * The words for dates and statuses — one place, so every screen, label, report and notification says the same thing.
 * Use-by, best-before, expiry, internal cutoff and review dates are always named; nothing is ever called "safe".
 */
import type { Batch, DateKind, DeadlineInfo, DeadlineValue } from '../../domain/expiry/expiryTypes';
import type { Evaluation, ExpiryStatus } from '../../domain/expiry/statusEngine';
import { localDateOf, localTimeOf } from '../../domain/expiry/datePrecision';
import { localDate, localDateShort } from '../../utils/locale';
import { colors } from '../../theme/colors';
import i18n from '../../i18n';
import type { MoneyValue } from '../../domain/expiry/expiryTypes';
import { formatMoney } from '../../domain/formatMoney';

type T = (k: string, o?: Record<string, unknown>) => string;

export function formatDeadlineValue(d: DeadlineValue, tz: string): string {
  if (d.precision === 'month') return localDate(`${d.month}-01`, { month: 'long', year: 'numeric' });
  if (d.precision === 'date') return localDateShort(d.date);
  const ms = Date.parse(d.at);
  return `${localDateShort(localDateOf(ms, tz))}, ${localTimeOf(ms, tz)}`;
}

/** "Use by 25 Sept 2026", "Best before end September 2026", "Internal cutoff 24 Sept 2026, 14:00", "No date — needs checking". */
export function deadlineLine(t: T, info: DeadlineInfo, tz: string): string {
  if (info.dateKind === 'none' || !info.deadline) return t('deadline.none');
  const value = formatDeadlineValue(info.deadline, tz);
  if (info.deadline.precision === 'month') return t('deadline.monthLine', { kind: t(`dateKind.${info.dateKind}`), month: value });
  return t('deadline.line', { kind: t(`dateKind.${info.dateKind}`), date: value });
}

export function reasonLine(t: T, info: DeadlineInfo): string {
  return t(`deadlineReason.${info.reason}`);
}

/** Status wording depends on the date kind: past use-by is "action required", past best-before is "review quality". */
export function statusLabel(t: T, ev: Evaluation, kind: DateKind): string {
  switch (ev.status) {
    case 'past_deadline': return t(`status.past.${kind === 'none' ? 'use_by' : kind}`);
    case 'quality_past_review': return t(`status.qualityPast.${kind === 'quality_review' ? 'quality_review' : 'best_before'}`);
    case 'due_today': return t('status.dueToday');
    case 'quality_due': return t('status.qualityDue');
    case 'urgent':
      if (ev.msLeft !== undefined && ev.daysLeft === 0) return t('status.dueToday');
      return ev.msLeft !== undefined ? t('status.urgentHours') : t('status.dueTomorrow');
    case 'soon': return t('status.dueIn', { count: ev.daysLeft ?? 0 });
    case 'quality_soon': return t('status.qualityIn', { count: ev.daysLeft ?? 0 });
    case 'later': return t('status.later');
    case 'quality_later': return t('status.qualityLater');
    default: return t('status.unknown');
  }
}

/** Colour never carries meaning alone: it always sits next to the words above. Unknown is never green. */
export function statusColors(s: ExpiryStatus): { fg: string; bg: string } {
  switch (s) {
    case 'past_deadline': return { fg: '#FFFFFF', bg: colors.dangerRed };
    case 'due_today': case 'urgent': return { fg: '#7A3D08', bg: '#FBE2C8' };
    case 'soon': return { fg: colors.primaryBlue, bg: colors.softBlue };
    case 'later': return { fg: colors.successGreen, bg: colors.softGreen };
    case 'unknown': return { fg: '#5B6476', bg: '#E8E4DA' };
    default: return { fg: '#4B3B8F', bg: colors.softPurple };
  }
}

export function quantityLine(t: T, b: Pick<Batch, 'quantityRemaining' | 'quantityInitial' | 'quantityUnit'>): string | null {
  if (b.quantityRemaining == null) return null;
  return t('batch.left', { count: b.quantityRemaining, unit: b.quantityUnit ? ` ${b.quantityUnit}` : '' });
}

export function kindLabel(t: T, b: Pick<Batch, 'kind'>): string {
  return t(`batchKind.${b.kind}`);
}

/** Exact money in the current app language; unknown stays visibly unknown (callers pass undefined → "Not recorded"). */
export function moneyText(m: MoneyValue): string {
  return formatMoney(m.minor, m.currency, (i18n.language || 'en') as Parameters<typeof formatMoney>[2]);
}
