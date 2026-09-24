/**
 * Expiry rules (§7.5): the business's own after-opening / after-preparation / review rules. There are no built-in
 * shelf-life durations. Editing a rule bumps its version; batches keep the snapshot they were created with (T18).
 */
import type { ExpiryRule, RuleAppliesTo, RuleClass } from '../../domain/expiry/expiryTypes';
import { validateRule } from '../../domain/expiry/expiryValidation';
import { K } from '../../storage/keys';
import { listRecords, newId, nowIso, readRecord, runTxn } from '../../storage/entityStore';
import { DomainError, cleanText, mustGet, optText, putRecord } from '../../storage/repoHelpers';
import { notifyDataChanged } from '../../storage/changeBus';

export interface RuleDraft {
  name: string;
  appliesTo: RuleAppliesTo;
  class: RuleClass;
  durationMinutes?: number;
  sourceText: string;
  storageInstruction?: string;
}

function validate(d: RuleDraft) {
  const v = { name: cleanText(d.name), appliesTo: d.appliesTo, class: d.class, durationMinutes: d.durationMinutes, sourceText: cleanText(d.sourceText), storageInstruction: optText(d.storageInstruction, 120) };
  if (!['after_opening', 'after_preparation', 'manual_review'].includes(v.appliesTo)) throw new DomainError('badRule');
  if (!['hard_cutoff', 'quality_review'].includes(v.class)) throw new DomainError('badRule');
  const err = validateRule(v);
  if (err) throw new DomainError(`rule_${err}`);
  if ([...v.name].length > 60 || [...v.sourceText].length > 200) throw new DomainError('textTooLong');
  return v;
}

export async function saveRule(workspaceId: string, d: RuleDraft, id?: string): Promise<ExpiryRule> {
  const v = validate(d);
  const rule = await runTxn(async tx => {
    const now = nowIso();
    if (id) {
      const existing = await mustGet<ExpiryRule>(tx, 'rules', id, workspaceId);
      const next: ExpiryRule = { ...existing, ...v, version: existing.version + 1, updatedAt: now };
      tx.set(K.item('rules', id), next);
      return next;
    }
    const rec: ExpiryRule = { id: newId('rule'), workspaceId, ...v, status: 'active', version: 1, createdAt: now, updatedAt: now };
    await putRecord(tx, 'rules', rec);
    return rec;
  });
  notifyDataChanged();
  return rule;
}

export async function setRuleHidden(workspaceId: string, id: string, hidden: boolean): Promise<void> {
  await runTxn(async tx => {
    const r = await mustGet<ExpiryRule>(tx, 'rules', id, workspaceId);
    tx.set(K.item('rules', id), { ...r, status: hidden ? 'hidden' : 'active', updatedAt: nowIso() });
  });
  notifyDataChanged();
}

export async function listRules(workspaceId: string, opts: { includeHidden?: boolean; appliesTo?: RuleAppliesTo } = {}): Promise<ExpiryRule[]> {
  const { items } = await listRecords<ExpiryRule>('rules', workspaceId);
  return items
    .filter(r => r.workspaceId === workspaceId && (opts.includeHidden || r.status === 'active') && (!opts.appliesTo || r.appliesTo === opts.appliesTo))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getRule(workspaceId: string, id: string): Promise<ExpiryRule | null> {
  const r = await readRecord<ExpiryRule>(K.item('rules', id));
  return r && r.workspaceId === workspaceId ? r : null;
}
