/** E11 product form, E21 rule form (source required, no suggested durations, version bump), E22 location counts. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createWorkspace, __resetWorkspaceCache } from '../../workspaces/workspaceStore';
import { saveRule } from '../../rules/ruleStore';
import { saveProduct } from '../../products/productStore';
import { durationMinutes, emptyRuleForm, ruleFormToDraft, ruleToForm } from '../../rules/screens/ruleForm';
import { addBarcode, emptyProductForm, formToDraft, productToForm } from '../../products/utils/productForm';
import { countByLocation } from '../../locations/screens/locationCounts';

const store = AsyncStorage as any;
beforeEach(() => { store.clear(); __resetWorkspaceCache(); });

describe('E21 rule form', () => {
  it('a new rule has no prefilled or suggested duration', () => {
    expect(emptyRuleForm('after_preparation')).toMatchObject({ appliesTo: 'after_preparation', durationText: '' });
  });

  it('a rule without a source is rejected by the form and by the store', async () => {
    const f = { ...emptyRuleForm(), name: 'Opened milk', durationText: '3', durationUnit: 'days' as const, sourceText: '   ' };
    expect(ruleFormToDraft(f)).toEqual({ ok: false, errors: { source: 'sourceRequired' } });
    const w = await createWorkspace({ name: 'Cafe', mode: 'food_prep', timeZone: 'Europe/London' });
    await expect(saveRule(w.id, { name: 'Opened milk', appliesTo: 'after_opening', class: 'hard_cutoff', durationMinutes: 4320, sourceText: '' })).rejects.toMatchObject({ code: 'rule_sourceRequired' });
  });

  it('duration: whole units only, required except for manual review; every problem reported at once', () => {
    expect(durationMinutes('3', 'days')).toBe(4320);
    expect(durationMinutes('90', 'minutes')).toBe(90);
    expect(durationMinutes('', 'hours')).toBeUndefined();
    expect(durationMinutes('1.5', 'hours')).toBeNaN();
    expect(ruleFormToDraft({ ...emptyRuleForm(), durationText: '' })).toEqual({ ok: false, errors: { name: 'nameRequired', source: 'sourceRequired', duration: 'durationRequired' } });
    expect(ruleFormToDraft({ ...emptyRuleForm(), name: 'X', sourceText: 'Y', durationText: '2.5' })).toEqual({ ok: false, errors: { duration: 'badDuration' } });
    const review = ruleFormToDraft({ ...emptyRuleForm('manual_review'), name: 'Weekly look', sourceText: 'Our quality checklist', class: 'quality_review' });
    expect(review).toEqual({ ok: true, draft: { name: 'Weekly look', appliesTo: 'manual_review', class: 'quality_review', durationMinutes: undefined, sourceText: 'Our quality checklist', storageInstruction: undefined } });
  });

  it('editing bumps the version; the form round-trips the stored rule', async () => {
    const w = await createWorkspace({ name: 'Cafe', mode: 'food_prep', timeZone: 'Europe/London' });
    const built = ruleFormToDraft({ ...emptyRuleForm('after_preparation'), name: 'Soup', durationText: '36', durationUnit: 'hours', sourceText: 'Kitchen procedure 2.1', storageInstruction: 'Keep chilled' });
    if (!built.ok) throw new Error('expected ok');
    const r1 = await saveRule(w.id, built.draft);
    expect(r1).toMatchObject({ version: 1, durationMinutes: 2160 });
    expect(ruleToForm(r1)).toMatchObject({ durationText: '36', durationUnit: 'hours', storageInstruction: 'Keep chilled' });
    const r2 = await saveRule(w.id, { ...built.draft, durationMinutes: 1440 }, r1.id);
    expect(r2.version).toBe(2);
    expect(ruleToForm(r2)).toMatchObject({ durationText: '1', durationUnit: 'days' });
  });
});

describe('E11 product form', () => {
  it('exact money only with a currency; unknown stays undefined; round trip', async () => {
    const f = { ...emptyProductForm(), name: 'Coffee beans 1kg', costText: '12.40', priceText: '', unit: 'kg' as const };
    expect(formToDraft(f, '')).toEqual({ ok: false, errors: { cost: 'money_noCurrency' } });
    const r = formToDraft(f, 'EUR');
    if (!r.ok) throw new Error('expected ok');
    expect(r.draft.costPerTrackingUnit).toEqual({ minor: 1240, currency: 'EUR' });
    expect(r.draft.sellingPrice).toBeUndefined();
    const w = await createWorkspace({ name: 'Shop', mode: 'retail', currency: 'EUR', timeZone: 'Europe/Berlin' });
    const p = await saveProduct(w.id, r.draft);
    expect(productToForm(p)).toMatchObject({ name: 'Coffee beans 1kg', costText: '12.40', priceText: '', unit: 'kg' });
  });

  it('name and custom unit are required', () => {
    expect(formToDraft({ ...emptyProductForm(), unit: 'custom' }, 'GBP')).toEqual({ ok: false, errors: { name: 'nameRequired', unit: 'customUnitRequired' } });
  });

  it('several barcodes; the same code is not added twice; roles kept', () => {
    let list = addBarcode([], ' 5000157024671 ', 'ean13');
    list = addBarcode(list, '5000157024671');
    list = addBarcode(list, '15000157024678', 'unknown');
    expect(list).toEqual([{ code: '5000157024671', symbology: 'ean13', role: 'single' }, { code: '15000157024678', symbology: undefined, role: 'single' }]);
  });
});

describe('E22 locations', () => {
  it('counts active batches per place', () => {
    const m = countByLocation([{ locationId: 'a', status: 'active' }, { locationId: 'a', status: 'completed' }, { locationId: 'b', status: 'active' }, { status: 'active' }]);
    expect([...m.entries()]).toEqual([['a', 1], ['b', 1]]);
  });
});
