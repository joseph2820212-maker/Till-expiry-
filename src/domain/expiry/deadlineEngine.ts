/**
 * Which date controls a batch (§9). Pure functions; the UI never calculates deadlines itself.
 *
 * - Bought-in / other: the printed or entered date controls.
 * - Opened: the saved after-opening rule (or a directly entered deadline) is compared with the original pack date.
 *   If the original date is HARD (use-by, manufacturer expiry, internal cutoff) and earlier than the hard result,
 *   the original stays in control (T13). An original best-before stays visible as a quality date and never becomes a
 *   safety cutoff (T14).
 * - Prepared: the saved preparation rule (or a direct deadline) controls. There are no built-in shelf lives.
 * - No rule and no date → no deadline: the batch "needs checking", never "okay" (T19).
 */
import type { AppliedRuleSnapshot, Batch, DateKind, DatePrecision, DeadlineInfo, DeadlineValue, IsoDateTime } from './expiryTypes';
import { deadlineInstant } from './datePrecision';
import { isHardKind, isQualityKind, kindForRuleClass } from './expiryValidation';
import { ruleDeadlineAt } from './ruleEngine';

/** The batch's own stored date fields as one value. */
export function ownDeadline(b: Pick<Batch, 'dateKind' | 'datePrecision' | 'printedDate' | 'printedMonth' | 'exactDeadlineAt'>): DeadlineValue | undefined {
  if (b.dateKind === 'none') return undefined;
  if (b.datePrecision === 'datetime') return b.exactDeadlineAt ? { precision: 'datetime', at: b.exactDeadlineAt } : undefined;
  if (b.datePrecision === 'month') return b.printedMonth ? { precision: 'month', month: b.printedMonth } : undefined;
  return b.printedDate ? { precision: 'date', date: b.printedDate } : undefined;
}

/** Stored fields for a deadline value (inverse of ownDeadline). */
export function deadlineFields(kind: DateKind, d: DeadlineValue | undefined): Pick<Batch, 'dateKind' | 'datePrecision' | 'printedDate' | 'printedMonth' | 'exactDeadlineAt'> {
  if (!d || kind === 'none') return { dateKind: kind === 'none' ? 'none' : kind, datePrecision: 'date' };
  if (d.precision === 'datetime') return { dateKind: kind, datePrecision: 'datetime', exactDeadlineAt: d.at };
  if (d.precision === 'month') return { dateKind: kind, datePrecision: 'month', printedMonth: d.month };
  return { dateKind: kind, datePrecision: 'date', printedDate: d.date };
}

export function compareDeadlines(a: DeadlineValue, b: DeadlineValue, tz: string): number {
  return deadlineInstant(a, tz) - deadlineInstant(b, tz);
}

/** Bought-in or other dated item: the entered date controls. */
export function boughtInDeadline(kind: DateKind, d: DeadlineValue | undefined): DeadlineInfo {
  if (kind === 'none' || !d) return { dateKind: 'none', reason: 'none' };
  return { dateKind: kind, deadline: d, reason: 'printed' };
}

export interface DerivedDeadline {
  /** Stored own date of the new batch. */
  own: { kind: DateKind; deadline?: DeadlineValue };
  effective: DeadlineInfo;
  secondary?: DeadlineInfo;
}

interface Candidate { kind: DateKind; deadline: DeadlineValue; reason: DeadlineInfo['reason'] }

function pick(hard: Candidate[], quality: Candidate[], tz: string): { effective: DeadlineInfo; secondary?: DeadlineInfo } {
  const byTime = (a: Candidate, b: Candidate) => compareDeadlines(a.deadline, b.deadline, tz);
  const h = [...hard].sort(byTime);
  const q = [...quality].sort(byTime);
  if (h.length) {
    const effective = { dateKind: h[0].kind, deadline: h[0].deadline, reason: h[0].reason };
    return q.length ? { effective, secondary: { dateKind: q[0].kind, deadline: q[0].deadline, reason: q[0].reason } } : { effective };
  }
  if (q.length) {
    const effective = { dateKind: q[0].kind, deadline: q[0].deadline, reason: q[0].reason };
    return q.length > 1 ? { effective, secondary: { dateKind: q[1].kind, deadline: q[1].deadline, reason: q[1].reason } } : { effective };
  }
  return { effective: { dateKind: 'none', reason: 'none' } };
}

/** The original pack's controlling date, classified. */
function originalCandidates(parent: Pick<Batch, 'effective' | 'secondary'> | undefined): { hard: Candidate[]; quality: Candidate[] } {
  const hard: Candidate[] = [];
  const quality: Candidate[] = [];
  for (const info of [parent?.effective, parent?.secondary]) {
    if (!info?.deadline) continue;
    if (isHardKind(info.dateKind)) hard.push({ kind: info.dateKind, deadline: info.deadline, reason: 'original_hard' });
    else if (isQualityKind(info.dateKind)) quality.push({ kind: info.dateKind, deadline: info.deadline, reason: 'original_quality' });
  }
  return { hard, quality };
}

export interface OpenInput {
  parent?: Pick<Batch, 'effective' | 'secondary'>;
  openedAt: IsoDateTime;
  rule?: AppliedRuleSnapshot;
  direct?: { kind: DateKind; deadline: DeadlineValue };
  tz: string;
}

/** Deadline of an opened (child) batch. */
export function openedDeadline(input: OpenInput): DerivedDeadline {
  const orig = originalCandidates(input.parent);
  const hard = [...orig.hard];
  const quality = [...orig.quality];
  let own: DerivedDeadline['own'] = { kind: 'none' };
  if (input.direct) {
    const c: Candidate = { kind: input.direct.kind, deadline: input.direct.deadline, reason: 'direct' };
    own = { kind: c.kind, deadline: c.deadline };
    (isHardKind(c.kind) ? hard : quality).push(c);
  } else if (input.rule) {
    const at = ruleDeadlineAt(input.rule, input.openedAt, input.tz);
    if (at) {
      const c: Candidate = { kind: kindForRuleClass(input.rule.class), deadline: { precision: 'datetime', at }, reason: 'rule' };
      own = { kind: c.kind, deadline: c.deadline };
      (input.rule.class === 'hard_cutoff' ? hard : quality).push(c);
    }
  }
  return { own, ...pick(hard, quality, input.tz) };
}

export interface PrepareInput {
  preparedAt: IsoDateTime;
  rule?: AppliedRuleSnapshot;
  direct?: { kind: DateKind; deadline: DeadlineValue };
  tz: string;
}

/** Deadline of a freshly prepared batch: the business rule or a direct deadline, nothing else. */
export function preparedDeadline(input: PrepareInput): DerivedDeadline {
  if (input.direct) {
    return { own: { kind: input.direct.kind, deadline: input.direct.deadline }, effective: { dateKind: input.direct.kind, deadline: input.direct.deadline, reason: 'direct' } };
  }
  if (input.rule) {
    const at = ruleDeadlineAt(input.rule, input.preparedAt, input.tz);
    if (at) {
      const kind = kindForRuleClass(input.rule.class);
      const deadline: DeadlineValue = { precision: 'datetime', at };
      return { own: { kind, deadline }, effective: { dateKind: kind, deadline, reason: 'rule' } };
    }
  }
  return { own: { kind: 'none' }, effective: { dateKind: 'none', reason: 'none' } };
}

export function precisionOf(d: DeadlineValue | undefined): DatePrecision {
  return d?.precision ?? 'date';
}
