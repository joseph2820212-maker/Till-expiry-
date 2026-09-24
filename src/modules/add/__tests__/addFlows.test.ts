/**
 * Add flows (§12, §31): form → store mapping against the real journaled storage layer.
 * T04 month-only use-by blocked in the form, T13 earlier original hard date wins, T14 best-before stays a quality date,
 * T15 double tap saves once, T16 prepared time defaults to now and is editable, T17 / T18 rule snapshot,
 * T19 no date → needs checking, T32 standard barcode finds the product and still asks for the date.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { moneyFieldText } from '../../products/utils/moneyFields';
import { createWorkspace, __resetWorkspaceCache } from '../../workspaces/workspaceStore';
import { listProducts, saveProduct, getProduct } from '../../products/productStore';
import { saveRule } from '../../rules/ruleStore';
import { saveLocation } from '../../locations/locationStore';
import { createDatedBatch, getBatch, listBatches, listEvents, openBatch, prepareBatch } from '../../batches/batchStore';
import { newId } from '../../../storage/entityStore';
import { evaluateBatch } from '../../../domain/expiry/statusEngine';
import { DEFAULT_STATUS_SETTINGS } from '../../../domain/expiry/expiryTypes';
import { DEFAULT_REMINDERS } from '../../settings/settingsStore';
import {
  buildDatedPlan, buildOpenInput, buildPrepareInput, choiceOrder, createSaveGuard, instantFromFields, nowFields, openPreview,
  preparePreview, reminderPreview, type DatedForm, type OpenedForm, type PreparedForm,
} from '../addForms';
import { createScanDebounce, findProductFor, readScannedCode, scanOutcome } from '../scanRouting';
import { GS } from '../gs1';

const store = AsyncStorage as any;
beforeEach(() => { store.clear(); __resetWorkspaceCache(); });

const TZ = 'Europe/London';
const ws = (currency = 'GBP') => createWorkspace({ name: 'Corner Shop', mode: 'mixed', currency, timeZone: TZ });
const dated = (p: Partial<DatedForm> = {}): DatedForm => ({ kind: 'bought_in', newName: '', quantityText: '', lot: '', costText: '', priceText: '', notes: '', ...p });

describe('E14 add choices', () => {
  it('every mode offers the same five choices; only the order changes', () => {
    for (const m of ['retail', 'food_prep', 'mixed', 'home_other', undefined] as const) {
      expect([...choiceOrder(m)].sort()).toEqual(['bought_in', 'opened', 'other', 'prepared', 'scan']);
    }
    expect(choiceOrder('food_prep')[0]).toBe('prepared');
    expect(choiceOrder('retail')[0]).toBe('scan');
  });
});

describe('E15 scanner routing', () => {
  it('T32 a standard barcode finds the product in the active workspace and still asks for the date', async () => {
    const w = await ws();
    const p = await saveProduct(w.id, { name: 'Milk 2L', barcodes: [{ code: '5000157024671' }], defaultDateKind: 'use_by' });
    const read = readScannedCode('5000157024671', 'ean13');
    expect(read.gs1).toBeNull();
    const found = findProductFor(read, await listProducts(w.id));
    expect(found?.id).toBe(p.id);
    const out = scanOutcome('add', read, found);
    expect(out).toEqual({ type: 'navigate', route: 'AddBoughtIn', params: { productId: p.id } });
    // The form opened for that product has its usual kind of date but NO date: saving is refused until one is entered.
    const plan = buildDatedPlan(dated({ productId: p.id, dateKind: 'use_by' }), { workspaceId: w.id, currency: 'GBP', product: p });
    expect(plan).toEqual({ ok: false, errors: { deadline: 'dateRequired' } });
  });

  it('a product in another workspace is not found; unknown code → the bought-in form with the code filled in', async () => {
    const a = await ws();
    const b = await createWorkspace({ name: 'Second', mode: 'retail', currency: '', timeZone: TZ });
    await saveProduct(a.id, { name: 'Milk', barcodes: [{ code: '5000157024671' }] });
    const read = readScannedCode('5000157024671', 'org.gs1.EAN-13');
    expect(findProductFor(read, await listProducts(b.id))).toBeNull();
    expect(scanOutcome('add', read, null)).toEqual({ type: 'navigate', route: 'AddBoughtIn', params: { barcode: '5000157024671', symbology: 'ean13' } });
    expect(scanOutcome('find', read, null)).toEqual({ type: 'notFound', code: '5000157024671', symbology: 'ean13' });
    expect(scanOutcome('open', read, null).type).toBe('notFound');
    expect(scanOutcome('attach', read, null)).toEqual({ type: 'attach', code: '5000157024671', symbology: 'ean13' });
  });

  it('GS1 DataMatrix: product matched by the GTIN, raw data passed on for the form to suggest (not save) the date', async () => {
    const w = await ws();
    const p = await saveProduct(w.id, { name: 'Yoghurt', barcodes: [{ code: '5000157024671' }] });
    const raw = `0105000157024671` + `10L42${GS}17261231`;
    const read = readScannedCode(raw, 'datamatrix');
    expect(read.gs1?.expiry).toEqual({ precision: 'date', date: '2026-12-31' });
    const found = findProductFor(read, await listProducts(w.id));
    expect(found?.id).toBe(p.id);
    expect(scanOutcome('add', read, found)).toEqual({ type: 'navigate', route: 'AddBoughtIn', params: { productId: p.id, gs1: raw } });
    expect(scanOutcome('find', read, found)).toEqual({ type: 'navigate', route: 'ProductDetail', params: { id: p.id } });
    expect(scanOutcome('open', read, found)).toEqual({ type: 'navigate', route: 'AddOpened', params: { productId: p.id } });
  });

  it('a GS1 code is only suggested: a prefilled date needs "I checked the pack" before saving', async () => {
    const w = await ws();
    const f = dated({ newName: 'Yoghurt', dateKind: 'use_by', deadline: { precision: 'date', date: '2026-12-31' }, gs1Prefilled: true });
    expect(buildDatedPlan(f, { workspaceId: w.id, currency: 'GBP' })).toEqual({ ok: false, errors: { gs1: 'gs1Confirm' } });
    expect(buildDatedPlan({ ...f, gs1Confirmed: true }, { workspaceId: w.id, currency: 'GBP' }).ok).toBe(true);
  });

  it('double scan within the debounce window is ignored', () => {
    let now = 1000;
    const accept = createScanDebounce(1500, () => now);
    expect(accept('5000157024671')).toBe(true);
    now += 200; expect(accept('5000157024671')).toBe(false);
    expect(accept('036000291452')).toBe(true);
    now += 200; expect(accept('036000291452')).toBe(false);
    now += 2000; expect(accept('036000291452')).toBe(true);
  });
});

describe('E16 / E19 bought in and other dated', () => {
  it('saves the right batch: new product inline with barcode, quantity, unit, lot, place, exact cost on the product', async () => {
    const w = await ws();
    const fridge = await saveLocation(w.id, { name: 'Fridge 1', kind: 'fridge' });
    const plan = buildDatedPlan(dated({
      newName: 'Ham 200g', newBarcode: '036000291452', dateKind: 'use_by', deadline: { precision: 'date', date: '2026-10-03' },
      quantityText: '6', unit: 'pack', lot: ' L123 ', locationId: fridge.id, costText: '1.20', priceText: '',
    }), { workspaceId: w.id, currency: 'GBP', requestId: newId('req') });
    if (!plan.ok) throw new Error(JSON.stringify(plan.errors));
    const b = await createDatedBatch(plan.input.input);
    expect(b).toMatchObject({
      kind: 'bought_in', productName: 'Ham 200g', dateKind: 'use_by', datePrecision: 'date', printedDate: '2026-10-03',
      quantityInitial: 6, quantityRemaining: 6, quantityUnit: 'pack', lotNumber: 'L123', locationId: fridge.id,
      effective: { dateKind: 'use_by', deadline: { precision: 'date', date: '2026-10-03' }, reason: 'printed' },
    });
    const p = await getProduct(w.id, b.productId);
    expect(p?.costPerTrackingUnit).toEqual({ minor: 120, currency: 'GBP' });
    expect(p?.sellingPrice).toBeUndefined(); // unknown stays unknown, never 0
    expect(p?.barcodes[0].normalized).toBe('0036000291452');
    expect(p?.defaultDateKind).toBe('use_by');
  });

  it('T04 month-only use-by is blocked in the form and nothing is written', async () => {
    const w = await ws();
    const plan = buildDatedPlan(dated({ newName: 'Ham', dateKind: 'use_by', deadline: { precision: 'month', month: '2026-10' } }), { workspaceId: w.id, currency: 'GBP' });
    expect(plan).toEqual({ ok: false, errors: { deadline: 'monthNotAllowed' } });
    expect(await listProducts(w.id)).toEqual([]);
    // Best before may be month-only and keeps that precision.
    const ok = buildDatedPlan(dated({ newName: 'Rice', dateKind: 'best_before', deadline: { precision: 'month', month: '2027-03' } }), { workspaceId: w.id, currency: 'GBP' });
    if (!ok.ok) throw new Error('expected ok');
    const b = await createDatedBatch(ok.input.input);
    expect(b).toMatchObject({ datePrecision: 'month', printedMonth: '2027-03' });
  });

  it('T19 "No date" is allowed and shows as needs checking, never okay', async () => {
    const w = await ws();
    const plan = buildDatedPlan(dated({ kind: 'other', newName: 'First-aid kit', dateKind: 'none' }), { workspaceId: w.id, currency: '' });
    if (!plan.ok) throw new Error('expected ok');
    const b = await createDatedBatch(plan.input.input);
    expect(b.effective).toEqual({ dateKind: 'none', reason: 'none' });
    expect(evaluateBatch(b, Date.now(), DEFAULT_STATUS_SETTINGS).status).toBe('unknown');
  });

  it('validation: product, kind, quantity, custom unit and money errors; money ignored without a currency', () => {
    const r = buildDatedPlan(dated({ quantityText: '-1', unit: 'custom', costText: '1,234' }), { workspaceId: 'w', currency: 'GBP' });
    expect(r).toEqual({ ok: false, errors: { product: 'productRequired', dateKind: 'dateKindRequired', quantity: 'badQuantity', unit: 'customUnitRequired', cost: 'money_ambiguous' } });
    const zero = buildDatedPlan(dated({ newName: 'X', dateKind: 'none', priceText: '0' }), { workspaceId: 'w', currency: 'GBP' });
    expect(zero).toEqual({ ok: false, errors: { price: 'money_zero' } });
    const noCur = buildDatedPlan(dated({ newName: 'X', dateKind: 'none', costText: '2.50' }), { workspaceId: 'w', currency: '' });
    expect(noCur.ok && noCur.input.input.newProduct?.costPerTrackingUnit).toBeUndefined();
  });

  it('changing cost on an existing product travels with the batch input (one transaction), not as a separate save', async () => {
    const w = await ws();
    const p = await saveProduct(w.id, { name: 'Bread' });
    const plan = buildDatedPlan(dated({ productId: p.id, dateKind: 'best_before', deadline: { precision: 'date', date: '2026-09-30' }, costText: '0.85' }), { workspaceId: w.id, currency: 'GBP', product: p });
    if (!plan.ok) throw new Error('expected ok');
    expect(plan.input.input.productMoney?.costPerTrackingUnit).toEqual({ minor: 85, currency: 'GBP' });
    const same = buildDatedPlan(dated({ productId: p.id, dateKind: 'best_before', deadline: { precision: 'date', date: '2026-09-30' } }), { workspaceId: w.id, currency: 'GBP', product: p });
    expect(same.ok && same.input.input.productMoney).toBeUndefined();
  });

  describe('EXP-REV-02 product money change and new batch are atomic', () => {
    async function setup() {
      const w = await ws();
      const p = await saveProduct(w.id, { name: 'Bread', costPerTrackingUnit: { minor: 50, currency: 'GBP' }, sellingPrice: { minor: 120, currency: 'GBP' } });
      const plan = buildDatedPlan(dated({ productId: p.id, dateKind: 'best_before', deadline: { precision: 'date', date: '2026-09-30' }, costText: '0.85', priceText: '1.50' }), { workspaceId: w.id, currency: 'GBP', product: p, requestId: 'req-atomic' });
      if (!plan.ok) throw new Error('expected ok');
      return { w, p, input: plan.input.input };
    }
    it('a failure after the product change is staged leaves the product money unchanged and writes no batch, event or index', async () => {
      const { w, p, input } = await setup();
      const store = AsyncStorage as any;
      const before = await AsyncStorage.getAllKeys();
      const real = store.multiSet.getMockImplementation();
      store.multiSet.mockImplementationOnce(async () => { throw new Error('disk full'); });
      await expect(createDatedBatch(input)).rejects.toThrow();
      store.multiSet.mockImplementation(real);
      expect((await getProduct(w.id, p.id))?.costPerTrackingUnit).toEqual({ minor: 50, currency: 'GBP' });
      expect((await getProduct(w.id, p.id))?.sellingPrice).toEqual({ minor: 120, currency: 'GBP' });
      expect(await listBatches(w.id)).toEqual([]);
      expect(await listEvents(w.id)).toEqual([]);
      expect((await AsyncStorage.getAllKeys()).filter(k => !k.startsWith('journal:')).sort()).toEqual(before.filter(k => !k.startsWith('journal:')).sort());
    });
    it('success writes both; a repeated tap with the same request id changes nothing more', async () => {
      const { w, p, input } = await setup();
      const b1 = await createDatedBatch(input);
      expect((await getProduct(w.id, p.id))?.costPerTrackingUnit).toEqual({ minor: 85, currency: 'GBP' });
      const b2 = await createDatedBatch({ ...input, productMoney: { costPerTrackingUnit: { minor: 999, currency: 'GBP' } } });
      expect(b2.id).toBe(b1.id);
      expect((await getProduct(w.id, p.id))?.costPerTrackingUnit).toEqual({ minor: 85, currency: 'GBP' });
      expect(await listBatches(w.id)).toHaveLength(1);
    });
  });

  describe('EXP-REV-06 a workspace currency change never relabels money', () => {
    it('a GBP amount is not prefilled or rewritten when the workspace currency is EUR', async () => {
      const w = await ws();
      const p = await saveProduct(w.id, { name: 'Tea', costPerTrackingUnit: { minor: 100, currency: 'GBP' } });
      expect(moneyFieldText(p.costPerTrackingUnit, 'EUR')).toBe('');
      const plan = buildDatedPlan(dated({ productId: p.id, dateKind: 'best_before', deadline: { precision: 'date', date: '2026-09-30' }, costText: '' }), { workspaceId: w.id, currency: 'EUR', product: p });
      if (!plan.ok) throw new Error('expected ok');
      expect(plan.input.input.productMoney).toBeUndefined(); // GBP 1.00 is kept, not turned into EUR 1.00 or cleared
      await createDatedBatch(plan.input.input);
      expect((await getProduct(w.id, p.id))?.costPerTrackingUnit).toEqual({ minor: 100, currency: 'GBP' });
    });
  });

  it('T15 a double tap saves once (in-flight guard + request id)', async () => {
    const w = await ws();
    const guard = createSaveGuard(() => newId('req'));
    const form = dated({ newName: 'Milk', dateKind: 'use_by', deadline: { precision: 'date', date: '2026-09-28' }, quantityText: '2' });
    const tap = () => guard.run(async requestId => {
      const plan = buildDatedPlan(form, { workspaceId: w.id, currency: 'GBP', requestId });
      if (!plan.ok) throw new Error('bad');
      return createDatedBatch(plan.input.input);
    });
    const [a, b] = await Promise.all([tap(), tap()]);
    expect(a?.id).toBeDefined();
    expect(b).toBeUndefined();
    expect(await listBatches(w.id)).toHaveLength(1);
    // The store also refuses a replay of the same request (e.g. a retried save after a slow write).
    const plan = buildDatedPlan(form, { workspaceId: w.id, currency: 'GBP', requestId: 'req-fixed' });
    if (!plan.ok) throw new Error('bad');
    const x = await createDatedBatch(plan.input.input);
    const y = await createDatedBatch(plan.input.input);
    expect(x.id).toBe(y.id);
    expect(await listBatches(w.id)).toHaveLength(2);
    expect(await listProducts(w.id)).toHaveLength(2);
  });
});

describe('E17 opened', () => {
  const baseOpen = (p: Partial<OpenedForm>): OpenedForm => ({ amountText: '', openedDate: '2026-09-24', openedTime: '10:00', source: 'rule', directKind: 'internal_cutoff', notes: '', ...p });

  it('T13 an earlier original hard use-by wins over the after-opening rule; the preview matches what is saved', async () => {
    const w = await ws();
    const rule = await saveRule(w.id, { name: 'Opened sauce', appliesTo: 'after_opening', class: 'hard_cutoff', durationMinutes: 5 * 1440, sourceText: 'Manufacturer label' });
    const parent = await createDatedBatch({ workspaceId: w.id, kind: 'bought_in', newProduct: { name: 'Cream' }, dateKind: 'use_by', deadline: { precision: 'date', date: '2026-09-26' }, quantity: 4 });
    const form = baseOpen({ parentBatchId: parent.id, amountText: '1', ruleId: rule.id });
    const preview = openPreview(form, { tz: TZ, parent, rule });
    expect(preview?.effective).toEqual({ dateKind: 'use_by', deadline: { precision: 'date', date: '2026-09-26' }, reason: 'original_hard' });
    expect(preview?.own.deadline).toEqual({ precision: 'datetime', at: '2026-09-29T10:00:00+01:00' });
    const built = buildOpenInput(form, { workspaceId: w.id, tz: TZ, parent, rule, requestId: 'req-o1' });
    if (!built.ok) throw new Error(JSON.stringify(built.errors));
    const { child, parent: after } = await openBatch(built.input);
    expect(child.effective).toEqual(preview?.effective);
    expect(after?.quantityRemaining).toBe(3);
  });

  it('T14 an original best-before stays a quality date next to the after-opening cutoff', async () => {
    const w = await ws();
    const rule = await saveRule(w.id, { name: 'Jar opened', appliesTo: 'after_opening', class: 'hard_cutoff', durationMinutes: 3 * 1440, sourceText: 'Label: once opened use within 3 days' });
    const parent = await createDatedBatch({ workspaceId: w.id, kind: 'bought_in', newProduct: { name: 'Pesto' }, dateKind: 'best_before', deadline: { precision: 'month', month: '2027-01' } });
    const preview = openPreview(baseOpen({ parentBatchId: parent.id, ruleId: rule.id }), { tz: TZ, parent, rule });
    expect(preview?.effective).toMatchObject({ dateKind: 'internal_cutoff', reason: 'rule' });
    expect(preview?.secondary).toEqual({ dateKind: 'best_before', deadline: { precision: 'month', month: '2027-01' }, reason: 'original_quality' });
  });

  it('amount opened: required and at most what is left for a counted batch; optional otherwise; a source is required', async () => {
    const w = await ws();
    const parent = await createDatedBatch({ workspaceId: w.id, kind: 'bought_in', newProduct: { name: 'Milk' }, dateKind: 'use_by', deadline: { precision: 'date', date: '2026-09-30' }, quantity: 2 });
    const ctx = { workspaceId: w.id, tz: TZ, parent };
    expect(buildOpenInput(baseOpen({ parentBatchId: parent.id, amountText: '3', source: 'original' }), ctx)).toEqual({ ok: false, errors: { amount: 'amountTooHigh' } });
    expect(buildOpenInput(baseOpen({ parentBatchId: parent.id, source: 'original' }), ctx)).toEqual({ ok: false, errors: { amount: 'amountRequired' } });
    expect(buildOpenInput(baseOpen({ parentBatchId: parent.id, amountText: '1' }), ctx)).toEqual({ ok: false, errors: { rule: 'ruleRequired' } });
    expect(buildOpenInput(baseOpen({ parentBatchId: parent.id, amountText: '1', source: 'direct', directKind: 'use_by', directDeadline: { precision: 'month', month: '2026-10' } }), ctx)).toEqual({ ok: false, errors: { deadline: 'monthNotAllowed' } });
    expect(buildOpenInput(baseOpen({ parentBatchId: parent.id, amountText: '1', openedTime: '25:00', source: 'original' }), ctx)).toEqual({ ok: false, errors: { openedAt: 'badTime' } });
    const uncounted = await createDatedBatch({ workspaceId: w.id, kind: 'bought_in', newProduct: { name: 'Oil' }, dateKind: 'best_before', deadline: { precision: 'date', date: '2027-05-01' } });
    const ok = buildOpenInput(baseOpen({ parentBatchId: uncounted.id, source: 'direct', directKind: 'quality_review', directDeadline: { precision: 'date', date: '2026-11-01' } }), { workspaceId: w.id, tz: TZ, parent: uncounted });
    expect(ok.ok).toBe(true);
  });
});

describe('E18 prepared', () => {
  const basePrep = (p: Partial<PreparedForm>): PreparedForm => ({ newName: '', preparedDate: '2026-09-24', preparedTime: '09:30', quantityText: '', source: 'rule', directKind: 'internal_cutoff', sourceBatchIds: [], lot: '', notes: '', ...p });

  it('T16 prepared time defaults to now in the workspace zone and can be edited', () => {
    const now = Date.parse('2026-09-24T08:15:00Z');
    expect(nowFields(TZ, now)).toEqual({ date: '2026-09-24', time: '09:15' });
    expect(instantFromFields('2026-09-24', '07:05', TZ)).toBe('2026-09-24T07:05:00+01:00');
    expect(instantFromFields('2026-09-24', '7:05', TZ)).toBeNull();
    expect(instantFromFields('2026-09-24', '٠٧:٠٥', TZ)).toBe('2026-09-24T07:05:00+01:00');
  });

  it('T17 the saved prepared batch uses the exact rule version snapshot; T18 editing the rule later does not rewrite it', async () => {
    const w = await ws();
    let rule = await saveRule(w.id, { name: 'Sandwich', appliesTo: 'after_preparation', class: 'hard_cutoff', durationMinutes: 24 * 60, sourceText: 'Our HACCP plan section 4' });
    const form = basePrep({ newName: 'Ham sandwich', ruleId: rule.id, quantityText: '10' });
    const preview = preparePreview(form, { tz: TZ, rule });
    expect(preview?.effective).toEqual({ dateKind: 'internal_cutoff', deadline: { precision: 'datetime', at: '2026-09-25T09:30:00+01:00' }, reason: 'rule' });
    const built = buildPrepareInput(form, { workspaceId: w.id, tz: TZ, rule, requestId: 'req-p1' });
    if (!built.ok) throw new Error(JSON.stringify(built.errors));
    const b = await prepareBatch(built.input);
    expect(b.appliedRule).toEqual({ ruleId: rule.id, ruleVersion: 1, ruleName: 'Sandwich', class: 'hard_cutoff', durationMinutes: 1440, sourceText: 'Our HACCP plan section 4' });
    expect(b.effective).toEqual(preview?.effective);
    const again = await prepareBatch(built.input); // T15-style replay
    expect(again.id).toBe(b.id);
    rule = await saveRule(w.id, { name: 'Sandwich', appliesTo: 'after_preparation', class: 'hard_cutoff', durationMinutes: 12 * 60, sourceText: 'Our HACCP plan v2' }, rule.id);
    expect(rule.version).toBe(2);
    const stored = await getBatch(w.id, b.id);
    expect(stored?.appliedRule?.ruleVersion).toBe(1);
    expect(stored?.effective).toEqual(b.effective);
    const p = await getProduct(w.id, b.productId);
    expect(p?.isPrepared).toBe(true);
  });

  it('T19 prepared without a rule or date cannot be saved (no generic shelf life)', () => {
    const r = buildPrepareInput(basePrep({ newName: 'Salad' }), { workspaceId: 'w', tz: TZ, rule: null });
    expect(r).toEqual({ ok: false, errors: { rule: 'ruleRequired' } });
    expect(preparePreview(basePrep({ newName: 'Salad' }), { tz: TZ, rule: null })).toBeNull();
    const direct = buildPrepareInput(basePrep({ newName: 'Salad', source: 'direct' }), { workspaceId: 'w', tz: TZ });
    expect(direct).toEqual({ ok: false, errors: { deadline: 'dateRequired' } });
  });
});

describe('reminder preview', () => {
  const now = Date.parse('2026-09-24T09:00:00Z');
  it('date-only: warning N days before and on the day, plus the morning summary', () => {
    const lines = reminderPreview({ dateKind: 'use_by', deadline: { precision: 'date', date: '2026-09-28' }, reason: 'printed' }, TZ, DEFAULT_REMINDERS, now);
    expect(lines).toEqual([{ kind: 'advance', date: '2026-09-27', days: 1 }, { kind: 'sameDay', date: '2026-09-28' }, { kind: 'summary', hour: 8, minute: 0 }]);
  });
  it('exact cutoff: lead-time warning; past and undated say so', () => {
    const at = Date.parse('2026-09-25T09:30:00+01:00');
    expect(reminderPreview({ dateKind: 'internal_cutoff', deadline: { precision: 'datetime', at: '2026-09-25T09:30:00+01:00' }, reason: 'rule' }, TZ, DEFAULT_REMINDERS, now)[0]).toEqual({ kind: 'exact', at: at - 3600000, minutes: 60 });
    expect(reminderPreview({ dateKind: 'use_by', deadline: { precision: 'date', date: '2026-09-20' }, reason: 'printed' }, TZ, DEFAULT_REMINDERS, now)[0]).toEqual({ kind: 'past' });
    expect(reminderPreview({ dateKind: 'none', reason: 'none' }, TZ, { ...DEFAULT_REMINDERS, dailySummary: { enabled: false, hour: 8, minute: 0 } }, now)).toEqual([{ kind: 'none' }]);
    expect(reminderPreview({ dateKind: 'use_by', deadline: { precision: 'date', date: '2026-09-28' }, reason: 'printed' }, TZ, { ...DEFAULT_REMINDERS, advanceDays: 0, sameDay: false, dailySummary: { enabled: false, hour: 8, minute: 0 } }, now)).toEqual([{ kind: 'off' }]);
  });
});
