/**
 * Which precision each kind of date may use (§7.3). A use-by or internal cutoff needs a real day (or an exact time);
 * best-before, manufacturer expiry and quality review may be month-only; "none" carries no date at all.
 */
import type { DateKind, DeadlineValue, ExpiryRule, RuleClass } from './expiryTypes';
import { isValidDeadline } from './datePrecision';

export const HARD_KINDS: readonly DateKind[] = ['use_by', 'manufacturer_expiry', 'internal_cutoff'] as const;
export const QUALITY_KINDS: readonly DateKind[] = ['best_before', 'quality_review'] as const;

export const isHardKind = (k: DateKind) => HARD_KINDS.includes(k);
export const isQualityKind = (k: DateKind) => QUALITY_KINDS.includes(k);

export type DeadlineError = 'dateRequired' | 'noDateAllowed' | 'monthNotAllowed' | 'invalidDate';

export function allowsMonth(kind: DateKind): boolean {
  return kind === 'best_before' || kind === 'manufacturer_expiry' || kind === 'quality_review';
}

export function validateDeadline(kind: DateKind, deadline: DeadlineValue | undefined): DeadlineError | null {
  if (kind === 'none') return deadline ? 'noDateAllowed' : null;
  if (!deadline) return 'dateRequired';
  if (deadline.precision === 'month' && !allowsMonth(kind)) return 'monthNotAllowed';
  if (!isValidDeadline(deadline)) return 'invalidDate';
  return null;
}

/** The date kind a rule result carries: a hard rule is an internal cutoff, a quality rule a quality review. */
export function kindForRuleClass(c: RuleClass): DateKind {
  return c === 'hard_cutoff' ? 'internal_cutoff' : 'quality_review';
}

export type RuleError = 'nameRequired' | 'sourceRequired' | 'durationRequired' | 'badDuration';

export const RULE_MAX_MINUTES = 60 * 24 * 3650;

/** Every relative rule is the business's own and must say where it comes from (§7.5). No built-in durations exist. */
export function validateRule(r: Pick<ExpiryRule, 'name' | 'sourceText' | 'appliesTo' | 'durationMinutes'>): RuleError | null {
  if (!r.name.trim()) return 'nameRequired';
  if (!r.sourceText.trim()) return 'sourceRequired';
  if (r.appliesTo !== 'manual_review') {
    if (r.durationMinutes == null) return 'durationRequired';
    if (!Number.isInteger(r.durationMinutes) || r.durationMinutes < 1 || r.durationMinutes > RULE_MAX_MINUTES) return 'badDuration';
  } else if (r.durationMinutes != null && (!Number.isInteger(r.durationMinutes) || r.durationMinutes < 1 || r.durationMinutes > RULE_MAX_MINUTES)) {
    return 'badDuration';
  }
  return null;
}
