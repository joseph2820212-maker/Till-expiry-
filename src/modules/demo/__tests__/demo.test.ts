/** §27 demo isolation: T65 the demo never reads or writes real records; T66 resetting the demo leaves real data alone. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createWorkspace, getActiveWorkspace, __resetWorkspaceCache } from '../../workspaces/workspaceStore';
import { saveProduct, listProducts } from '../../products/productStore';
import { listBatches } from '../../batches/batchStore';
import { enterDemo, exitDemo, isDemo, resetDemo } from '../demoMode';
import { __setScopeForTests } from '../../../storage/scope';

const store = AsyncStorage as any;

beforeEach(() => { store.clear(); __resetWorkspaceCache(); __setScopeForTests('real'); });

async function realSnapshot(): Promise<Record<string, string | null>> {
  const keys = ((await AsyncStorage.getAllKeys()) as string[]).filter(k => !k.startsWith('demo:') && !k.startsWith('app:') && !k.startsWith('journal:'));
  return Object.fromEntries(await AsyncStorage.multiGet(keys));
}

describe('demo', () => {
  it('T65 the demo has its own workspace and records; real records are never read or written', async () => {
    const real = await createWorkspace({ name: 'My shop', mode: 'retail', timeZone: 'Europe/London' });
    await saveProduct(real.id, { name: 'Real bread' });
    const before = await realSnapshot();

    await enterDemo();
    expect(isDemo()).toBe(true);
    const demoWs = getActiveWorkspace();
    expect(demoWs?.id).not.toBe(real.id);
    expect((await listProducts(real.id))).toEqual([]); // real workspace's records are not visible from the demo
    const demoBatches = await listBatches(demoWs!.id);
    expect(demoBatches.length).toBeGreaterThanOrEqual(6);
    expect(demoBatches.some(b => b.effective.dateKind === 'none')).toBe(true);
    expect(demoBatches.some(b => b.kind === 'opened')).toBe(true);
    expect(demoBatches.some(b => b.kind === 'prepared')).toBe(true);
    expect(await realSnapshot()).toEqual(before);
    const allKeys = (await AsyncStorage.getAllKeys()) as string[];
    expect(allKeys.filter(k => k.includes(demoWs!.id)).every(k => k.startsWith('demo:'))).toBe(true);

    await exitDemo();
    expect(isDemo()).toBe(false);
    expect(getActiveWorkspace()?.id).toBe(real.id);
    expect((await listProducts(real.id)).map(p => p.name)).toEqual(['Real bread']);
  });

  it('T66 resetting the demo re-seeds it and leaves real data byte-identical', async () => {
    const real = await createWorkspace({ name: 'My shop', mode: 'retail', timeZone: 'Europe/London' });
    await saveProduct(real.id, { name: 'Real bread' });
    await enterDemo();
    const first = getActiveWorkspace()!;
    await saveProduct(first.id, { name: 'Added in demo' });
    const before = await realSnapshot();
    await resetDemo();
    const again = getActiveWorkspace()!;
    expect((await listProducts(again.id)).some(p => p.name === 'Added in demo')).toBe(false);
    expect(await realSnapshot()).toEqual(before);
    await exitDemo();
    expect(getActiveWorkspace()?.id).toBe(real.id);
  });

  it('entering the demo a second time keeps the existing demo data', async () => {
    await enterDemo();
    const id = getActiveWorkspace()!.id;
    await exitDemo();
    await enterDemo();
    expect(getActiveWorkspace()!.id).toBe(id);
  });
});
