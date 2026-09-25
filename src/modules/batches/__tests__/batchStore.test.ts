/** Master handoff §31 — batch, quantity, history and workspace acceptance tests against the real storage layer. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createWorkspace, hideWorkspace, loadActiveWorkspace, setActiveWorkspace, listWorkspaces, __resetWorkspaceCache } from '../../workspaces/workspaceStore';
import { listProducts, saveProduct, findByBarcode } from '../../products/productStore';
import { saveRule } from '../../rules/ruleStore';
import { saveLocation } from '../../locations/locationStore';
import { applyRule, checkBatch, correctDeadline, correctQuantity, createDatedBatch, getBatch, listBatchEvents, listBatches, moveBatch, openBatch, prepareBatch, recordRemoval, setBatchArchived } from '../batchStore';
import { K, DEVICE_KEYS } from '../../../storage/keys';
import { recoverInterruptedTransaction } from '../../../storage/entityStore';
import { evaluateBatch } from '../../../domain/expiry/statusEngine';
import { DEFAULT_STATUS_SETTINGS as S } from '../../../domain/expiry/expiryTypes';

const store = AsyncStorage as any;
beforeEach(async () => { store.clear(); __resetWorkspaceCache(); });

async function ws(name = 'Corner Shop') {
  return createWorkspace({ name, mode: 'mixed', currency: 'GBP', timeZone: 'Europe/London' });
}

describe('batches and dates', () => {
  it('T01 one product can have several batches with different dates', async () => {
    const w = await ws();
    const p = await saveProduct(w.id, { name: 'Milk 2L', barcodes: [{ code: '5000157024671' }] });
    await createDatedBatch({ workspaceId: w.id, kind: 'bought_in', productId: p.id, dateKind: 'use_by', deadline: { precision: 'date', date: '2026-09-26' }, quantity: 6 });
    await createDatedBatch({ workspaceId: w.id, kind: 'bought_in', productId: p.id, dateKind: 'use_by', deadline: { precision: 'date', date: '2026-10-02' }, quantity: 6 });
    const list = await listBatches(w.id);
    expect(list.map(b => b.printedDate).sort()).toEqual(['2026-09-26', '2026-10-02']);
    expect(new Set(list.map(b => b.productId))).toEqual(new Set([p.id]));
  });
  it('a new product and its first batch are created in one transaction; a use-by with month precision is refused and writes nothing', async () => {
    const w = await ws();
    await expect(createDatedBatch({ workspaceId: w.id, kind: 'bought_in', newProduct: { name: 'Ham' }, dateKind: 'use_by', deadline: { precision: 'month', month: '2026-10' } })).rejects.toMatchObject({ code: 'deadline_monthNotAllowed' });
    expect(await listProducts(w.id)).toEqual([]);
    const b = await createDatedBatch({ workspaceId: w.id, kind: 'bought_in', newProduct: { name: 'Ham', barcodes: [{ code: '036000291452' }] }, dateKind: 'use_by', deadline: { precision: 'date', date: '2026-10-03' } });
    expect((await findByBarcode(w.id, '0036000291452'))?.id).toBe(b.productId);
  });
  it('T10 checking and T20 moving never change the deadline; the move is in history', async () => {
    const w = await ws();
    const fridge = await saveLocation(w.id, { name: 'Freezer A', kind: 'freezer' });
    const b = await createDatedBatch({ workspaceId: w.id, kind: 'bought_in', newProduct: { name: 'Chicken' }, dateKind: 'use_by', deadline: { precision: 'date', date: '2026-09-26' } });
    await checkBatch(w.id, b.id);
    const moved = await moveBatch(w.id, b.id, fridge.id, 'Froze it');
    expect(moved.effective).toEqual(b.effective);
    expect(moved.printedDate).toBe('2026-09-26');
    expect((await listBatchEvents(w.id, b.id)).map(e => e.type)).toEqual(['created', 'checked', 'moved']);
  });
});

describe('opened batches', () => {
  async function sauce() {
    const w = await ws();
    const r = await saveRule(w.id, { name: 'Sauce opened', appliesTo: 'after_opening', class: 'hard_cutoff', durationMinutes: 3 * 1440, sourceText: 'Manufacturer label: use within 3 days' });
    const parent = await createDatedBatch({ workspaceId: w.id, kind: 'bought_in', newProduct: { name: 'Tomato sauce 1L' }, dateKind: 'best_before', deadline: { precision: 'month', month: '2027-03' }, quantity: 6, lotNumber: 'L123' });
    return { w, r, parent };
  }
  it('T11 opening 2 of 6 leaves 4 unopened; T12 the child gets its own rule and date', async () => {
    const { w, r, parent } = await sauce();
    const { child, parent: after } = await openBatch({ workspaceId: w.id, parentBatchId: parent.id, quantity: 2, openedAt: '2026-09-24T10:00:00+01:00', ruleId: r.id });
    expect(after?.quantityRemaining).toBe(4);
    expect(after?.status).toBe('active');
    expect(child).toMatchObject({ kind: 'opened', parentBatchId: parent.id, quantityRemaining: 2, lotNumber: 'L123', exactDeadlineAt: '2026-09-27T10:00:00+01:00' });
    expect(child.appliedRule).toMatchObject({ ruleId: r.id, ruleVersion: 1, class: 'hard_cutoff' });
    expect(child.secondary?.dateKind).toBe('best_before'); // T14 through the store
    expect((await getBatch(w.id, parent.id))?.printedMonth).toBe('2027-03');
  });
  it('T15 a duplicate tap (same request) cannot create two children or decrement twice', async () => {
    const { w, r, parent } = await sauce();
    const req = { workspaceId: w.id, parentBatchId: parent.id, quantity: 2, openedAt: '2026-09-24T10:00:00+01:00', ruleId: r.id, requestId: 'req-open-1' };
    const [a, b] = await Promise.all([openBatch(req), openBatch(req)]);
    expect(a.child.id).toBe(b.child.id);
    expect((await listBatches(w.id)).filter(x => x.kind === 'opened')).toHaveLength(1);
    expect((await getBatch(w.id, parent.id))?.quantityRemaining).toBe(4);
  });
  it('opening more than is left, or a counted batch without an amount, is refused', async () => {
    const { w, parent } = await sauce();
    await expect(openBatch({ workspaceId: w.id, parentBatchId: parent.id, quantity: 7, openedAt: '2026-09-24T10:00:00+01:00' })).rejects.toMatchObject({ code: 'quantityTooHigh' });
    await expect(openBatch({ workspaceId: w.id, parentBatchId: parent.id, openedAt: '2026-09-24T10:00:00+01:00' })).rejects.toMatchObject({ code: 'quantityRequired' });
    await expect(openBatch({ workspaceId: w.id, parentBatchId: parent.id, quantity: 1, openedAt: '2026-09-24 10:00' })).rejects.toMatchObject({ code: 'badTime' });
  });
  it('a preparation rule cannot be used for opening', async () => {
    const { w, parent } = await sauce();
    const prep = await saveRule(w.id, { name: 'Sandwich', appliesTo: 'after_preparation', class: 'hard_cutoff', durationMinutes: 240, sourceText: 'Our food-safety procedure' });
    await expect(openBatch({ workspaceId: w.id, parentBatchId: parent.id, quantity: 1, openedAt: '2026-09-24T10:00:00+01:00', ruleId: prep.id })).rejects.toMatchObject({ code: 'ruleWrongKind' });
  });
});

describe('prepared batches', () => {
  it('T16 the prepared time is whatever the user confirmed (defaulting to now is the form\'s job); T17 the exact rule version is snapshotted; T18 editing the rule later does not rewrite it', async () => {
    const w = await ws();
    const r = await saveRule(w.id, { name: 'Sandwich', appliesTo: 'after_preparation', class: 'hard_cutoff', durationMinutes: 240, sourceText: 'Our food-safety procedure v2' });
    const b = await prepareBatch({ workspaceId: w.id, newProduct: { name: 'Ham sandwich' }, preparedAt: '2026-09-24T08:15:00+01:00', ruleId: r.id, quantity: 12 });
    expect(b.effective).toEqual({ dateKind: 'internal_cutoff', deadline: { precision: 'datetime', at: '2026-09-24T12:15:00+01:00' }, reason: 'rule' });
    await saveRule(w.id, { name: 'Sandwich', appliesTo: 'after_preparation', class: 'hard_cutoff', durationMinutes: 600, sourceText: 'Our food-safety procedure v3' }, r.id);
    const again = await getBatch(w.id, b.id);
    expect(again?.appliedRule).toMatchObject({ ruleVersion: 1, durationMinutes: 240, sourceText: 'Our food-safety procedure v2' });
    expect(again?.effective).toEqual(b.effective);
    const b2 = await prepareBatch({ workspaceId: w.id, productId: b.productId, preparedAt: '2026-09-24T08:15:00+01:00', ruleId: r.id });
    expect(b2.appliedRule?.ruleVersion).toBe(2);
    expect(b2.exactDeadlineAt).toBe('2026-09-24T18:15:00+01:00');
  });
  it('T19 prepared with no rule and no date → needs checking, not green', async () => {
    const w = await ws();
    const b = await prepareBatch({ workspaceId: w.id, newProduct: { name: 'Soup' }, preparedAt: '2026-09-24T08:15:00+01:00' });
    expect(evaluateBatch(b, Date.now(), S).status).toBe('unknown');
  });
  it('applying an approved rule later is an explicit, recorded change', async () => {
    const w = await ws();
    const b = await prepareBatch({ workspaceId: w.id, newProduct: { name: 'Soup' }, preparedAt: '2026-09-24T08:15:00+01:00' });
    const r = await saveRule(w.id, { name: 'Soup chilled', appliesTo: 'after_preparation', class: 'hard_cutoff', durationMinutes: 2 * 1440, sourceText: 'HACCP plan' });
    await expect(applyRule(w.id, b.id, r.id, '')).rejects.toMatchObject({ code: 'reasonRequired' });
    const next = await applyRule(w.id, b.id, r.id, 'Forgot to pick the rule');
    expect(next.exactDeadlineAt).toBe('2026-09-26T08:15:00+01:00');
    const ev = (await listBatchEvents(w.id, b.id)).pop();
    expect(ev).toMatchObject({ type: 'rule_applied', reason: 'Forgot to pick the rule' });
  });
});

describe('quantity and history', () => {
  it('T22 quantity never goes below zero; T23 actions append history; completing at zero', async () => {
    const w = await ws();
    const b = await createDatedBatch({ workspaceId: w.id, kind: 'bought_in', newProduct: { name: 'Yoghurt' }, dateKind: 'use_by', deadline: { precision: 'date', date: '2026-09-26' }, quantity: 5 });
    await recordRemoval(w.id, b.id, 'sold', { quantity: 2 });
    await recordRemoval(w.id, b.id, 'used', { quantity: 1 });
    await expect(recordRemoval(w.id, b.id, 'wasted', { quantity: 3, reason: 'damaged' })).rejects.toMatchObject({ code: 'quantityTooHigh' });
    await expect(recordRemoval(w.id, b.id, 'wasted', { quantity: 1 })).rejects.toMatchObject({ code: 'reasonRequired' });
    const done = await recordRemoval(w.id, b.id, 'wasted', { reason: 'past_deadline' });
    expect(done).toMatchObject({ quantityRemaining: 0, status: 'completed' });
    expect((await listBatchEvents(w.id, b.id)).map(e => [e.type, e.quantity])).toEqual([['created', 5], ['sold', 2], ['used', 1], ['wasted', 2]]);
    await expect(recordRemoval(w.id, b.id, 'sold', { quantity: 1 })).rejects.toMatchObject({ code: 'batchNotActive' });
    await expect(correctQuantity(w.id, b.id, -1, 'count')).rejects.toMatchObject({ code: 'badQuantity' });
  });
  it('decimal quantities (kg) subtract exactly', async () => {
    const w = await ws();
    const b = await createDatedBatch({ workspaceId: w.id, kind: 'bought_in', newProduct: { name: 'Cheese', trackingUnit: 'kg' }, dateKind: 'use_by', deadline: { precision: 'date', date: '2026-09-26' }, quantity: 0.3, quantityUnit: 'kg' });
    const after = await recordRemoval(w.id, b.id, 'used', { quantity: 0.1 });
    expect(after.quantityRemaining).toBe(0.2);
  });
  it('T24 a batch past its use-by is never counted as wasted automatically', async () => {
    const w = await ws();
    const b = await createDatedBatch({ workspaceId: w.id, kind: 'bought_in', newProduct: { name: 'Milk' }, dateKind: 'use_by', deadline: { precision: 'date', date: '2020-01-01' }, quantity: 2 });
    expect(evaluateBatch(b, Date.now(), S).status).toBe('past_deadline');
    await listBatches(w.id);
    expect((await listBatchEvents(w.id, b.id)).map(e => e.type)).toEqual(['created']);
    expect((await getBatch(w.id, b.id))?.status).toBe('active');
  });
  it('T25 corrections record before / after / reason', async () => {
    const w = await ws();
    const b = await createDatedBatch({ workspaceId: w.id, kind: 'bought_in', newProduct: { name: 'Milk' }, dateKind: 'use_by', deadline: { precision: 'date', date: '2026-09-26' }, quantity: 6 });
    await expect(correctDeadline(w.id, b.id, 'use_by', { precision: 'date', date: '2026-09-28' }, ' ')).rejects.toMatchObject({ code: 'reasonRequired' });
    await correctDeadline(w.id, b.id, 'use_by', { precision: 'date', date: '2026-09-28' }, 'Misread the pack');
    await correctQuantity(w.id, b.id, 4, 'Recount');
    const [, dl, q] = await listBatchEvents(w.id, b.id);
    expect(dl).toMatchObject({ type: 'deadline_corrected', reason: 'Misread the pack', before: { effective: { deadline: { date: '2026-09-26' } } }, after: { effective: { deadline: { date: '2026-09-28' }, reason: 'corrected' } } });
    expect(q).toMatchObject({ type: 'quantity_corrected', reason: 'Recount', before: { quantityRemaining: 6 }, after: { quantityRemaining: 4 } });
  });
  it('T26 a failed multi-record write rolls every record back; an interrupted transaction is rolled back on launch', async () => {
    const w = await ws();
    const parent = await createDatedBatch({ workspaceId: w.id, kind: 'bought_in', newProduct: { name: 'Sauce' }, dateKind: 'best_before', deadline: { precision: 'date', date: '2027-01-01' }, quantity: 6 });
    const snapshot = JSON.stringify(Object.entries(await AsyncStorage.multiGet(await AsyncStorage.getAllKeys() as string[])).sort());
    const multiSet = AsyncStorage.multiSet as jest.Mock;
    const original = multiSet.getMockImplementation() as any;
    multiSet.mockImplementationOnce(async (pairs: [string, string][]) => { await original(pairs.slice(0, 1)); throw new Error('disk full'); });
    try {
      await expect(openBatch({ workspaceId: w.id, parentBatchId: parent.id, quantity: 2, openedAt: '2026-09-24T10:00:00+01:00' })).rejects.toThrow('disk full');
    } finally { multiSet.mockImplementation(original); }
    expect(JSON.stringify(Object.entries(await AsyncStorage.multiGet(await AsyncStorage.getAllKeys() as string[])).sort())).toBe(snapshot);
    // Simulated crash: journal present with the pre-write values.
    await AsyncStorage.setItem(K.item('batches', parent.id), '{"garbage":true}');
    await AsyncStorage.setItem(DEVICE_KEYS.txnJournal, JSON.stringify({ v: 1, snapshot: [[K.item('batches', parent.id), JSON.stringify(parent)]] }));
    expect(await recoverInterruptedTransaction()).toBe(true);
    expect(await getBatch(w.id, parent.id)).toEqual(parent);
  });
  it('a corrupt record aborts a write instead of being overwritten', async () => {
    const w = await ws();
    const b = await createDatedBatch({ workspaceId: w.id, kind: 'bought_in', newProduct: { name: 'Eggs' }, dateKind: 'best_before', deadline: { precision: 'date', date: '2026-10-10' }, quantity: 12 });
    await AsyncStorage.setItem(K.item('batches', b.id), '{not json');
    await expect(recordRemoval(w.id, b.id, 'sold', { quantity: 1 })).rejects.toThrow();
    expect(await AsyncStorage.getItem(K.item('batches', b.id))).toBe('{not json');
  });
  it('archive and restore append events and keep data', async () => {
    const w = await ws();
    const b = await createDatedBatch({ workspaceId: w.id, kind: 'other', newProduct: { name: 'Gloves' }, dateKind: 'manufacturer_expiry', deadline: { precision: 'month', month: '2028-01' } });
    await setBatchArchived(w.id, b.id, true);
    expect(await listBatches(w.id)).toEqual([]);
    await setBatchArchived(w.id, b.id, false);
    expect((await listBatches(w.id)).map(x => x.id)).toEqual([b.id]);
  });
});

describe('workspaces', () => {
  it('T27 products and T28 batches are isolated by workspace', async () => {
    const a = await ws('Shop A');
    const b = await ws('Shop B');
    await saveProduct(a.id, { name: 'Only in A', barcodes: [{ code: '5000157024671' }] });
    await saveProduct(b.id, { name: 'Only in B', barcodes: [{ code: '5000157024671' }] }); // same barcode is fine in another workspace
    await createDatedBatch({ workspaceId: a.id, kind: 'bought_in', newProduct: { name: 'A milk' }, dateKind: 'use_by', deadline: { precision: 'date', date: '2026-09-26' } });
    expect((await listProducts(a.id)).map(p => p.name).sort()).toEqual(['A milk', 'Only in A']);
    expect((await listProducts(b.id)).map(p => p.name)).toEqual(['Only in B']);
    expect(await listBatches(b.id)).toEqual([]);
    const aBatch = (await listBatches(a.id))[0];
    expect(await getBatch(b.id, aBatch.id)).toBeNull();
    await expect(recordRemoval(b.id, aBatch.id, 'sold')).rejects.toMatchObject({ code: 'batchNotFound' });
    const aProduct = (await listProducts(a.id))[0];
    await expect(createDatedBatch({ workspaceId: b.id, kind: 'bought_in', productId: aProduct.id, dateKind: 'none' })).rejects.toMatchObject({ code: 'productNotFound' });
  });
  it('T31 a hidden workspace can never stay active; the last one cannot be hidden', async () => {
    const a = await ws('Shop A');
    const b = await ws('Shop B');
    await setActiveWorkspace(b.id);
    await hideWorkspace(b.id);
    expect((await loadActiveWorkspace())?.id).toBe(a.id);
    await expect(setActiveWorkspace(b.id)).rejects.toMatchObject({ code: 'workspaceHidden' });
    await expect(hideWorkspace(a.id)).rejects.toMatchObject({ code: 'lastWorkspace' });
    // A stale active id pointing at a hidden workspace is repaired on read.
    await AsyncStorage.setItem(K.workspacesActive, JSON.stringify(b.id));
    expect((await loadActiveWorkspace())?.id).toBe(a.id);
    expect((await listWorkspaces({ includeHidden: true })).length).toBe(2);
  });
});

describe('EXP-REV-01 correcting an opened child keeps the original pack constraint', () => {
  async function openedUnderUseBy(parentKind: 'use_by' | 'best_before' = 'use_by') {
    const w = await ws();
    const parent = await createDatedBatch({ workspaceId: w.id, kind: 'bought_in', newProduct: { name: 'Cream' }, dateKind: parentKind, deadline: { precision: 'date', date: '2026-09-26' }, quantity: 4 });
    const { child } = await openBatch({ workspaceId: w.id, parentBatchId: parent.id, quantity: 1, openedAt: '2026-09-24T10:00:00+01:00', direct: { kind: 'internal_cutoff', deadline: { precision: 'datetime', at: '2026-09-25T18:00:00+01:00' } } });
    return { w, parent, child };
  }

  it('parent use-by 26 Sep, child cutoff corrected to 30 Sep → the 26 Sep use-by stays effective', async () => {
    const { w, child } = await openedUnderUseBy();
    const next = await correctDeadline(w.id, child.id, 'internal_cutoff', { precision: 'date', date: '2026-09-30' }, 'Label misread');
    expect(next.effective).toMatchObject({ dateKind: 'use_by', deadline: { precision: 'date', date: '2026-09-26' }, reason: 'original_hard' });
    expect(next.printedDate).toBe('2026-09-30'); // the child's own corrected date is stored
    expect(next.dateKind).toBe('internal_cutoff');
  });

  it('parent use-by 26 Sep, child corrected to "no date" → the parent hard deadline is still effective', async () => {
    const { w, child } = await openedUnderUseBy();
    const next = await correctDeadline(w.id, child.id, 'none', undefined, 'No cutoff on this one');
    expect(next.effective).toMatchObject({ dateKind: 'use_by', deadline: { date: '2026-09-26' }, reason: 'original_hard' });
    expect(next.dateKind).toBe('none');
  });

  it('parent best-before + child hard cutoff → the cutoff controls and the best-before stays secondary quality', async () => {
    const { w, child } = await openedUnderUseBy('best_before');
    const next = await correctDeadline(w.id, child.id, 'internal_cutoff', { precision: 'datetime', at: '2026-09-25T20:00:00+01:00' }, 'Kitchen rule');
    expect(next.effective).toMatchObject({ dateKind: 'internal_cutoff', deadline: { precision: 'datetime', at: '2026-09-25T20:00:00+01:00' }, reason: 'corrected' });
    expect(next.secondary).toMatchObject({ dateKind: 'best_before', deadline: { date: '2026-09-26' }, reason: 'original_quality' });
  });

  it('the correction history holds before / after / reason', async () => {
    const { w, child } = await openedUnderUseBy();
    await correctDeadline(w.id, child.id, 'internal_cutoff', { precision: 'date', date: '2026-09-30' }, 'Label misread', 'req_fix_1');
    const ev = (await listBatchEvents(w.id, child.id)).find(e => e.type === 'deadline_corrected');
    expect(ev).toMatchObject({ id: 'req_fix_1', reason: 'Label misread' });
    expect((ev?.before as any).effective).toMatchObject({ dateKind: 'internal_cutoff' });
    expect((ev?.after as any).effective).toMatchObject({ dateKind: 'use_by', reason: 'original_hard' });
    // a repeated request writes nothing new
    await correctDeadline(w.id, child.id, 'internal_cutoff', { precision: 'date', date: '2026-10-01' }, 'Label misread', 'req_fix_1');
    expect((await listBatchEvents(w.id, child.id)).filter(e => e.type === 'deadline_corrected')).toHaveLength(1);
  });
});

describe('P1-REOPEN-01 correcting the original pack re-derives its opened children in the same transaction', () => {
  async function packWithChild(parentKind: 'use_by' | 'best_before' = 'use_by', parentDate = '2026-09-30') {
    const w = await ws();
    const parent = await createDatedBatch({ workspaceId: w.id, kind: 'bought_in', newProduct: { name: 'Cream' }, dateKind: parentKind, deadline: { precision: 'date', date: parentDate }, quantity: 4 });
    const { child } = await openBatch({ workspaceId: w.id, parentBatchId: parent.id, quantity: 1, openedAt: '2026-09-24T10:00:00+01:00', direct: { kind: 'internal_cutoff', deadline: { precision: 'date', date: '2026-09-28' } } });
    return { w, parent, child };
  }

  it('parent use-by 30 → 26 Sep: the child becomes 26 Sep at once, with its own history event', async () => {
    const { w, parent, child } = await packWithChild();
    expect(child.effective).toMatchObject({ dateKind: 'internal_cutoff', deadline: { date: '2026-09-28' } });
    await correctDeadline(w.id, parent.id, 'use_by', { precision: 'date', date: '2026-09-26' }, 'Misread pack');
    const after = await getBatch(w.id, child.id);
    expect(after?.effective).toMatchObject({ dateKind: 'use_by', deadline: { date: '2026-09-26' }, reason: 'original_hard' });
    expect(after?.printedDate).toBe('2026-09-28'); // the child's own cutoff is preserved
    const ev = (await listBatchEvents(w.id, child.id)).find(e => e.type === 'deadline_corrected');
    expect(ev).toMatchObject({ reason: 'Misread pack' });
    expect((ev?.after as any).fromParent).toBe(parent.id);
  });

  it('parent use-by 26 → 30 Sep: the child returns to its own 28 Sep cutoff', async () => {
    const { w, parent, child } = await packWithChild('use_by', '2026-09-26');
    expect(child.effective).toMatchObject({ dateKind: 'use_by', deadline: { date: '2026-09-26' } });
    await correctDeadline(w.id, parent.id, 'use_by', { precision: 'date', date: '2026-09-30' }, 'Misread pack');
    expect((await getBatch(w.id, child.id))?.effective).toMatchObject({ dateKind: 'internal_cutoff', deadline: { date: '2026-09-28' }, reason: 'direct' });
  });

  it('a corrected parent best-before updates the child secondary quality date', async () => {
    const { w, parent, child } = await packWithChild('best_before', '2026-10-15');
    expect(child.secondary).toMatchObject({ dateKind: 'best_before', deadline: { date: '2026-10-15' } });
    await correctDeadline(w.id, parent.id, 'best_before', { precision: 'month', month: '2026-11' }, 'Month only on pack');
    const after = await getBatch(w.id, child.id);
    expect(after?.effective).toMatchObject({ dateKind: 'internal_cutoff', deadline: { date: '2026-09-28' } });
    expect(after?.secondary).toMatchObject({ dateKind: 'best_before', deadline: { precision: 'month', month: '2026-11' }, reason: 'original_quality' });
  });

  it('a rule-based child keeps its rule deadline and still takes an earlier corrected pack date', async () => {
    const w = await ws();
    const r = await saveRule(w.id, { name: 'Opened', appliesTo: 'after_opening', class: 'hard_cutoff', durationMinutes: 5 * 1440, sourceText: 'Label' });
    const parent = await createDatedBatch({ workspaceId: w.id, kind: 'bought_in', newProduct: { name: 'Sauce' }, dateKind: 'use_by', deadline: { precision: 'date', date: '2026-10-30' }, quantity: 2 });
    const { child } = await openBatch({ workspaceId: w.id, parentBatchId: parent.id, quantity: 1, openedAt: '2026-09-24T10:00:00+01:00', ruleId: r.id });
    expect(child.effective.reason).toBe('rule');
    await correctDeadline(w.id, parent.id, 'use_by', { precision: 'date', date: '2026-09-25' }, 'Wrong date');
    const after = await getBatch(w.id, child.id);
    expect(after?.effective).toMatchObject({ dateKind: 'use_by', deadline: { date: '2026-09-25' } });
    expect(after?.appliedRule?.ruleId).toBe(r.id);
  });

  it('an injected write failure rolls back the parent and every child', async () => {
    const { w, parent, child } = await packWithChild();
    const { child: child2 } = await openBatch({ workspaceId: w.id, parentBatchId: parent.id, quantity: 1, openedAt: '2026-09-24T11:00:00+01:00', direct: { kind: 'internal_cutoff', deadline: { precision: 'date', date: '2026-09-29' } } });
    const real = store.multiSet.getMockImplementation();
    store.multiSet.mockImplementationOnce(async () => { throw new Error('disk full'); });
    await expect(correctDeadline(w.id, parent.id, 'use_by', { precision: 'date', date: '2026-09-26' }, 'Misread')).rejects.toThrow();
    store.multiSet.mockImplementation(real);
    expect((await getBatch(w.id, parent.id))?.printedDate).toBe('2026-09-30');
    expect((await getBatch(w.id, child.id))?.effective).toMatchObject({ deadline: { date: '2026-09-28' } });
    expect((await getBatch(w.id, child2.id))?.effective).toMatchObject({ deadline: { date: '2026-09-29' } });
    expect((await listBatchEvents(w.id, child.id)).some(e => e.type === 'deadline_corrected')).toBe(false);
  });

  it('Today, report and reminder inputs see the corrected child deadline', async () => {
    const { w, parent, child } = await packWithChild();
    await correctDeadline(w.id, parent.id, 'use_by', { precision: 'date', date: '2026-09-26' }, 'Misread pack');
    const { loadWorkspaceView } = require('../../today/workspaceView');
    const { buildExpiryRows } = require('../../reports/reportRows');
    const view = await loadWorkspaceView((await listWorkspaces())[0], Date.parse('2026-09-24T12:00:00Z'));
    expect(view.ranked.find((r: any) => r.batch.id === child.id).batch.effective.deadline).toEqual({ precision: 'date', date: '2026-09-26' });
    const rows = await buildExpiryRows(w.id, {}, Date.parse('2026-09-24T12:00:00Z'));
    expect(rows.rows.find((r: any) => r.batchId === child.id).deadline).toEqual({ precision: 'date', date: '2026-09-26' });
    // Reminders are planned from listBatches (reminderService); the stored child is what they read.
    expect((await listBatches(w.id)).find(b => b.id === child.id)?.effective.deadline).toEqual({ precision: 'date', date: '2026-09-26' });
  });

  it('fails closed when an opened child names a parent that is missing', async () => {
    const { w, parent, child } = await packWithChild();
    await AsyncStorage.removeItem(K.item('batches', parent.id));
    await expect(correctDeadline(w.id, child.id, 'internal_cutoff', { precision: 'date', date: '2026-09-27' }, 'x')).rejects.toMatchObject({ code: 'parentMissing' });
    expect((await getBatch(w.id, child.id))?.effective).toMatchObject({ deadline: { date: '2026-09-28' } });
  });
});

describe('P2-01 a manual correction removes the stale applied rule (kept in history)', () => {
  async function ruled(kind: 'opened' | 'prepared') {
    const w = await ws();
    const r = await saveRule(w.id, { name: kind, appliesTo: kind === 'opened' ? 'after_opening' : 'after_preparation', class: 'hard_cutoff', durationMinutes: 480, sourceText: 'Our plan' });
    const b = kind === 'opened'
      ? (await openBatch({ workspaceId: w.id, productId: (await saveProduct(w.id, { name: 'Soup' })).id, openedAt: '2026-09-24T10:00:00+01:00', ruleId: r.id })).child
      : await prepareBatch({ workspaceId: w.id, newProduct: { name: 'Sandwich' }, preparedAt: '2026-09-24T10:00:00+01:00', ruleId: r.id });
    expect(b.appliedRule?.ruleId).toBe(r.id);
    return { w, b, r };
  }
  for (const kind of ['opened', 'prepared'] as const) {
    it(`${kind}: rule → manual direct correction clears appliedRule; history keeps the old rule`, async () => {
      const { w, b, r } = await ruled(kind);
      const next = await correctDeadline(w.id, b.id, 'internal_cutoff', { precision: 'datetime', at: '2026-09-24T20:00:00+01:00' }, 'Chef decided');
      expect(next.appliedRule).toBeUndefined();
      const ev = (await listBatchEvents(w.id, b.id)).find(e => e.type === 'deadline_corrected');
      expect((ev?.before as any).appliedRule.ruleId).toBe(r.id);
    });
    it(`${kind}: rule → no-date correction clears appliedRule`, async () => {
      const { w, b } = await ruled(kind);
      const next = await correctDeadline(w.id, b.id, 'none', undefined, 'Unknown');
      expect(next.appliedRule).toBeUndefined();
      expect(next.effective.dateKind).toBe('none');
    });
  }
});
