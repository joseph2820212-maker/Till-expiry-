/**
 * Applying a saved rule. The batch keeps a snapshot of the rule as it was (id, version, class, duration, source), so
 * editing the rule later never rewrites historical batches (§7.4, T17–T18). Durations are absolute minutes.
 */
import type { AppliedRuleSnapshot, ExpiryRule, IsoDateTime } from './expiryTypes';
import { isoInZone } from './datePrecision';

export function snapshotRule(rule: ExpiryRule): AppliedRuleSnapshot {
  return {
    ruleId: rule.id,
    ruleVersion: rule.version,
    ruleName: rule.name,
    class: rule.class,
    durationMinutes: rule.durationMinutes,
    sourceText: rule.sourceText,
    storageInstruction: rule.storageInstruction,
  };
}

/** Deadline of a rule applied at `from`, as an offset-aware instant in the workspace zone. */
export function ruleDeadlineAt(snapshot: AppliedRuleSnapshot, from: IsoDateTime, tz: string): IsoDateTime | undefined {
  if (snapshot.durationMinutes == null) return undefined;
  const start = Date.parse(from);
  if (!Number.isFinite(start)) throw new RangeError('rule start is not an instant');
  return isoInZone(start + snapshot.durationMinutes * 60000, tz);
}

/** Human form of a duration for rule lists: whole days, else hours, else minutes. */
export function splitDuration(minutes: number): { value: number; unit: 'days' | 'hours' | 'minutes' } {
  if (minutes % 1440 === 0) return { value: minutes / 1440, unit: 'days' };
  if (minutes % 60 === 0) return { value: minutes / 60, unit: 'hours' };
  return { value: minutes, unit: 'minutes' };
}
