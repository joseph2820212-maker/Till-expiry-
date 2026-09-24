/** EXP-REV-06: a workspace currency change never relabels recorded money. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createWorkspace, updateWorkspace, countMoneyAffectedByCurrency, __resetWorkspaceCache } from '../workspaceStore';
import { saveProduct, getProduct } from '../../products/productStore';
import { createDatedBatch } from '../../batches/batchStore';
import { buildExpiryRows } from '../../reports/reportRows';

beforeEach(() => { (AsyncStorage as any).clear(); __resetWorkspaceCache(); });

async function gbpShop() {
  const w = await createWorkspace({ name: 'Shop', mode: 'retail', currency: 'GBP', timeZone: 'Europe/London' });
  const p = await saveProduct(w.id, { name: 'Tea', costPerTrackingUnit: { minor: 100, currency: 'GBP' }, sellingPrice: { minor: 250, currency: 'GBP' } });
  return { w, p };
}

describe('workspace currency policy', () => {
  it('without money-bearing products the currency can change freely', async () => {
    const w = await createWorkspace({ name: 'Shop', mode: 'retail', currency: 'GBP', timeZone: 'Europe/London' });
    await saveProduct(w.id, { name: 'No prices' });
    expect((await updateWorkspace(w.id, { name: 'Shop', mode: 'retail', currency: 'EUR', timeZone: 'Europe/London' })).currency).toBe('EUR');
  });

  it('GBP product + switch to EUR is refused; the product stays GBP until an explicit decision', async () => {
    const { w, p } = await gbpShop();
    expect(await countMoneyAffectedByCurrency(w.id, 'EUR')).toBe(1);
    await expect(updateWorkspace(w.id, { name: 'Shop', mode: 'retail', currency: 'EUR', timeZone: 'Europe/London' })).rejects.toMatchObject({ code: 'currencyInUse', detail: '1' });
    expect((await getProduct(w.id, p.id))?.costPerTrackingUnit).toEqual({ minor: 100, currency: 'GBP' });
  });

  it('the explicit decision clears the old amounts to unknown — never converted, never relabelled, never 0', async () => {
    const { w, p } = await gbpShop();
    await updateWorkspace(w.id, { name: 'Shop', mode: 'retail', currency: 'EUR', timeZone: 'Europe/London' }, { clearMoney: true });
    const after = await getProduct(w.id, p.id);
    expect(after?.costPerTrackingUnit).toBeUndefined();
    expect(after?.sellingPrice).toBeUndefined();
  });

  it('reports never add unlike currencies together', async () => {
    const { w, p } = await gbpShop();
    const eur = await saveProduct(w.id, { name: 'Coffee', costPerTrackingUnit: { minor: 300, currency: 'EUR' } });
    await createDatedBatch({ workspaceId: w.id, kind: 'bought_in', productId: p.id, dateKind: 'use_by', deadline: { precision: 'date', date: '2026-10-01' }, quantity: 2 });
    await createDatedBatch({ workspaceId: w.id, kind: 'bought_in', productId: eur.id, dateKind: 'use_by', deadline: { precision: 'date', date: '2026-10-01' }, quantity: 1 });
    const report: any = await buildExpiryRows(w.id, {});
    const totals = report.summary?.costTotals ?? report.summary?.totals ?? report.totals;
    const list = Array.isArray(totals) ? totals : Object.entries(totals ?? {}).map(([currency, minor]) => ({ currency, minor }));
    const byCur = Object.fromEntries(list.map((x: any) => [x.currency, x.minor]));
    expect(byCur).toEqual({ GBP: 200, EUR: 300 });
  });
});
