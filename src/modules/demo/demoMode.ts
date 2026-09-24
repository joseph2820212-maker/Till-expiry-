/**
 * Isolated demo "Demo Shop & Kitchen" (§27). All demo records live under the `demo:` key prefix (storage/scope.ts):
 * entering the demo switches the scope, so every repository reads and writes only demo keys; leaving switches back.
 * Reset deletes every `demo:` key and seeds again. Real keys are never touched (T65–T66).
 * Seeded dates are relative to today, so the demo always shows something due. No shelf-life values are invented as
 * rules for the user: the demo rules are labelled as demo examples with a demo source.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from '../../i18n';
import { getScope, setScope } from '../../storage/scope';
import { addDays, deviceTimeZone, isoInZone, todayIn } from '../../domain/expiry/datePrecision';
import { createWorkspace, loadActiveWorkspace } from '../workspaces/workspaceStore';
import { saveLocation } from '../locations/locationStore';
import { saveRule } from '../rules/ruleStore';
import { saveProduct } from '../products/productStore';
import { createDatedBatch, openBatch, prepareBatch, recordRemoval } from '../batches/batchStore';
import { loadSettings } from '../settings/settingsStore';
import { notifyDataChanged } from '../../storage/changeBus';

export function isDemo(): boolean { return getScope() === 'demo'; }

async function demoKeys(): Promise<string[]> {
  return ((await AsyncStorage.getAllKeys()) as string[]).filter(k => k.startsWith('demo:'));
}

/** Build the demo data inside the demo scope. */
export async function seedDemo(now: number = Date.now()): Promise<void> {
  if (getScope() !== 'demo') throw new Error('seedDemo outside the demo scope');
  const t = i18n.t.bind(i18n);
  const tz = deviceTimeZone();
  const today = todayIn(tz, now);
  const ws = await createWorkspace({ name: t('demo.workspaceName'), mode: 'mixed', currency: 'GBP', timeZone: tz });
  const fridge = await saveLocation(ws.id, { name: t('demo.fridge'), kind: 'fridge' });
  const freezer = await saveLocation(ws.id, { name: t('demo.freezer'), kind: 'freezer' });
  const shelf = await saveLocation(ws.id, { name: t('demo.shelf'), kind: 'shelf' });
  const openRule = await saveRule(ws.id, { name: t('demo.ruleOpened'), appliesTo: 'after_opening', class: 'hard_cutoff', durationMinutes: 3 * 1440, sourceText: t('demo.ruleSource') });
  const prepRule = await saveRule(ws.id, { name: t('demo.rulePrepared'), appliesTo: 'after_preparation', class: 'hard_cutoff', durationMinutes: 8 * 60, sourceText: t('demo.ruleSource') });

  const milk = await saveProduct(ws.id, { name: t('demo.milk'), barcodes: [{ code: '5000000000017' }], defaultLocationId: fridge.id, defaultDateKind: 'use_by', costPerTrackingUnit: { minor: 95, currency: 'GBP' }, sellingPrice: { minor: 145, currency: 'GBP' } });
  await createDatedBatch({ workspaceId: ws.id, kind: 'bought_in', productId: milk.id, dateKind: 'use_by', deadline: { precision: 'date', date: today }, quantity: 4, lotNumber: 'L2401', locationId: fridge.id });
  await createDatedBatch({ workspaceId: ws.id, kind: 'bought_in', productId: milk.id, dateKind: 'use_by', deadline: { precision: 'date', date: addDays(today, 5) }, quantity: 6, lotNumber: 'L2405', locationId: fridge.id });

  const biscuits = await saveProduct(ws.id, { name: t('demo.biscuits'), defaultLocationId: shelf.id, defaultDateKind: 'best_before', sellingPrice: { minor: 120, currency: 'GBP' } });
  await createDatedBatch({ workspaceId: ws.id, kind: 'bought_in', productId: biscuits.id, dateKind: 'best_before', deadline: { precision: 'date', date: addDays(today, -3) }, quantity: 3, locationId: shelf.id });

  const sauce = await saveProduct(ws.id, { name: t('demo.sauce'), defaultLocationId: shelf.id, defaultRuleId: openRule.id });
  const sauceBatch = await createDatedBatch({ workspaceId: ws.id, kind: 'bought_in', productId: sauce.id, dateKind: 'best_before', deadline: { precision: 'month', month: addDays(today, 200).slice(0, 7) }, quantity: 6, locationId: shelf.id });
  await openBatch({ workspaceId: ws.id, parentBatchId: sauceBatch.id, quantity: 1, openedAt: isoInZone(now - 26 * 3600000, tz), ruleId: openRule.id, locationId: fridge.id });

  const sandwich = await saveProduct(ws.id, { name: t('demo.sandwich'), isPrepared: true, defaultLocationId: fridge.id, defaultRuleId: prepRule.id });
  await prepareBatch({ workspaceId: ws.id, productId: sandwich.id, preparedAt: isoInZone(now - 3 * 3600000, tz), ruleId: prepRule.id, quantity: 8, locationId: fridge.id });

  const peas = await saveProduct(ws.id, { name: t('demo.peas'), defaultLocationId: freezer.id });
  await createDatedBatch({ workspaceId: ws.id, kind: 'bought_in', productId: peas.id, dateKind: 'none', quantity: 2, locationId: freezer.id });

  const yoghurt = await saveProduct(ws.id, { name: t('demo.yoghurt'), defaultLocationId: fridge.id, costPerTrackingUnit: { minor: 60, currency: 'GBP' } });
  const y = await createDatedBatch({ workspaceId: ws.id, kind: 'bought_in', productId: yoghurt.id, dateKind: 'use_by', deadline: { precision: 'date', date: addDays(today, -1) }, quantity: 2, locationId: fridge.id });
  await recordRemoval(ws.id, y.id, 'wasted', { quantity: 2, reason: 'past_deadline' });
}

/** Switch to the demo, seeding it on first use. Real data is untouched. */
export async function enterDemo(): Promise<void> {
  const hadDemo = (await demoKeys()).some(k => k.startsWith('demo:workspaces:'));
  await setScope('demo');
  try {
    if (!hadDemo) await seedDemo();
  } catch (e) {
    await wipeDemoKeys();
    await setScope('real');
    throw e;
  }
  await loadSettings();
  await loadActiveWorkspace();
  notifyDataChanged();
}

export async function exitDemo(): Promise<void> {
  await setScope('real');
  await loadSettings();
  await loadActiveWorkspace();
  notifyDataChanged();
}

async function wipeDemoKeys(): Promise<void> {
  const keys = await demoKeys();
  if (keys.length) await AsyncStorage.multiRemove(keys);
}

/** Back to the seed state. Only `demo:` keys are removed (T66). */
export async function resetDemo(): Promise<void> {
  if (getScope() !== 'demo') throw new Error('resetDemo outside the demo');
  await wipeDemoKeys();
  await seedDemo();
  await loadSettings();
  await loadActiveWorkspace();
  notifyDataChanged();
}
