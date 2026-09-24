/** Master handoff §16 / T21 — internal preparation label content. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createWorkspace, __resetWorkspaceCache } from '../../workspaces/workspaceStore';
import { saveRule } from '../../rules/ruleStore';
import { saveLocation } from '../../locations/locationStore';
import { openBatch, prepareBatch, createDatedBatch, getBatch } from '../../batches/batchStore';
import { deadlineLine } from '../../batches/format';
import { buildLabelsHtml, isLabelBatch, labelData } from '../labelHtml';

const t = (k: string, o?: Record<string, unknown>) => (o && Object.keys(o).length ? `${k}(${Object.entries(o).map(([a, b]) => `${a}=${b}`).join(',')})` : k);

beforeEach(() => { (AsyncStorage as any).clear(); __resetWorkspaceCache(); });

async function setup() {
  const w = await createWorkspace({ name: 'Kitchen', mode: 'food_prep', currency: 'GBP', timeZone: 'Europe/London' });
  const fridge = await saveLocation(w.id, { name: 'Prep fridge', kind: 'prep' });
  const rule = await saveRule(w.id, { name: 'Cooked rice', appliesTo: 'after_preparation', class: 'hard_cutoff', durationMinutes: 1440, sourceText: 'Kitchen HACCP plan section 4', storageInstruction: 'Keep at 0–5 °C' });
  const b = await prepareBatch({ workspaceId: w.id, newProduct: { name: 'Rice <cooked>' }, preparedAt: '2026-09-24T10:00:00+01:00', ruleId: rule.id, locationId: fridge.id, lotNumber: 'P-17', notes: 'For the lunch service' });
  return { w, fridge, rule, b };
}

describe('internal label', () => {
  it('shows the not-PPDS wording, the rule and its source, storage, lot, location and the prepared time', async () => {
    const { b } = await setup();
    const d = labelData(t, b, 'Prep fridge');
    expect(d.footer).toBe('label.notPpds');
    expect(d.ruleLine).toBe('label.rule(name=Cooked rice)');
    expect(d.sourceLine).toBe('label.source(source=Kitchen HACCP plan section 4)');
    expect(d.storageLine).toBe('label.storage(text=Keep at 0–5 °C)');
    expect(d.lotLine).toBe('label.lot(lot=P-17)');
    expect(d.locationLine).toBe('label.location(name=Prep fridge)');
    expect(d.timeLine).toMatch(/^label\.preparedAt\(time=.*10:00\)$/);
    const html = buildLabelsHtml([d]);
    expect(html).toContain('label.notPpds');
    expect(html).toContain('Kitchen HACCP plan section 4');
    expect(html).toContain('Rice &lt;cooked&gt;');
    expect(html).not.toContain('Rice <cooked>');
    expect(html).not.toMatch(/\bsafe\b/i);
  });

  it('T21 the label shows the same effective deadline wording as the batch detail', async () => {
    const { w, b } = await setup();
    const stored = (await getBatch(w.id, b.id))!;
    expect(labelData(t, stored).deadlineLine).toBe(deadlineLine(t, stored.effective, stored.timeZone));
    expect(stored.effective.dateKind).toBe('internal_cutoff');
    expect(labelData(t, stored).deadlineLine).toContain('dateKind.internal_cutoff');
  });

  it('an opened pack keeps its original date visible; a direct deadline is named as such; bought-in batches are not labelled', async () => {
    const { w } = await setup();
    const parent = await createDatedBatch({ workspaceId: w.id, kind: 'bought_in', newProduct: { name: 'Passata' }, dateKind: 'best_before', deadline: { precision: 'month', month: '2027-03' }, quantity: 4 });
    const { child } = await openBatch({ workspaceId: w.id, parentBatchId: parent.id, quantity: 1, openedAt: '2026-09-24T09:00:00+01:00', direct: { kind: 'use_by', deadline: { precision: 'date', date: '2026-09-27' } } });
    const d = labelData(t, child);
    expect(d.timeLine).toMatch(/^label\.openedAt/);
    expect(d.ruleLine).toBe('label.directDeadline');
    expect(d.sourceLine).toBeUndefined();
    expect(d.secondaryLine).toContain('dateKind.best_before');
    expect(isLabelBatch(child)).toBe(true);
    expect(isLabelBatch(parent)).toBe(false);
  });
});
