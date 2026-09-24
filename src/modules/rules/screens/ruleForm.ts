/**
 * Rule editor form (E21) → RuleDraft. Rules are the business's own: there are no built-in or suggested durations, and
 * every rule must say where its duration comes from (sourceText). Validation is the domain's (validateRule).
 */
import type { ExpiryRule, RuleAppliesTo, RuleClass } from '../../../domain/expiry/expiryTypes';
import { validateRule } from '../../../domain/expiry/expiryValidation';
import { splitDuration } from '../../../domain/expiry/ruleEngine';
import { normalizeArabicNumerals } from '../../../utils/locale';
import type { RuleDraft } from '../ruleStore';

export type DurationUnit = 'minutes' | 'hours' | 'days';
const FACTOR: Record<DurationUnit, number> = { minutes: 1, hours: 60, days: 1440 };

export interface RuleForm {
  name: string;
  appliesTo: RuleAppliesTo;
  class: RuleClass;
  durationText: string;
  durationUnit: DurationUnit;
  sourceText: string;
  storageInstruction: string;
}

export function emptyRuleForm(appliesTo: RuleAppliesTo = 'after_opening'): RuleForm {
  // No duration is ever prefilled: the business enters its own.
  return { name: '', appliesTo, class: 'hard_cutoff', durationText: '', durationUnit: 'days', sourceText: '', storageInstruction: '' };
}

export function ruleToForm(r: ExpiryRule): RuleForm {
  const d = r.durationMinutes != null ? splitDuration(r.durationMinutes) : null;
  return {
    name: r.name, appliesTo: r.appliesTo, class: r.class,
    durationText: d ? String(d.value) : '', durationUnit: d?.unit ?? 'days',
    sourceText: r.sourceText, storageInstruction: r.storageInstruction ?? '',
  };
}

/** Whole number of units → minutes; '' → undefined; anything else → NaN (refused). */
export function durationMinutes(text: string, unit: DurationUnit): number | undefined {
  const s = normalizeArabicNumerals(String(text ?? '')).trim();
  if (!s) return undefined;
  if (!/^\d{1,7}$/.test(s)) return NaN;
  return Number(s) * FACTOR[unit];
}

export type RuleFormResult = { ok: true; draft: RuleDraft } | { ok: false; errors: Partial<Record<'name' | 'duration' | 'source', string>> };

export function ruleFormToDraft(f: RuleForm): RuleFormResult {
  const minutes = durationMinutes(f.durationText, f.durationUnit);
  const draft: RuleDraft = {
    name: f.name.trim(), appliesTo: f.appliesTo, class: f.class,
    durationMinutes: minutes !== undefined && Number.isNaN(minutes) ? -1 : minutes,
    sourceText: f.sourceText.trim(), storageInstruction: f.storageInstruction.trim() || undefined,
  };
  const err = validateRule({ name: draft.name, sourceText: draft.sourceText, appliesTo: draft.appliesTo, durationMinutes: draft.durationMinutes });
  if (!err) return { ok: true, draft };
  // Report every problem at once (the domain check stops at the first).
  const errors: Partial<Record<'name' | 'duration' | 'source', string>> = {};
  if (!draft.name) errors.name = 'nameRequired';
  if (!draft.sourceText) errors.source = 'sourceRequired';
  const durErr = validateRule({ name: 'x', sourceText: 'x', appliesTo: draft.appliesTo, durationMinutes: draft.durationMinutes });
  if (durErr) errors.duration = durErr;
  return { ok: false, errors };
}
