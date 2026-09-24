// §5 / T64: the bottom navigation stays visible on normal inner screens; settings are reachable from More only.
import fs from 'fs';
import path from 'path';
import { tabTarget, inTab } from '../tabs';
import { SHARED_SCREENS } from '../sharedScreens';
import { FULL_SCREEN } from '../TabNavigator';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8');

jest.mock('../sharedScreens', () => {
  // Static test: read the registry names from source, without importing every screen.
  const src = require('fs').readFileSync(require('path').resolve(__dirname, '..', 'sharedScreens.tsx'), 'utf8');
  const block = src.slice(src.indexOf('export const SHARED_SCREENS = {'), src.indexOf('} satisfies'));
  const names = [...block.matchAll(/^\s+([A-Za-z]+): [A-Za-z]+Screen,$/gm)].map((m: RegExpMatchArray) => m[1]);
  return { SHARED_SCREENS: Object.fromEntries(names.map((n: string) => [n, n])) };
});
jest.mock('../TabNavigator', () => ({ FULL_SCREEN: new Set(['BarcodeScanner', 'ReportPreview', 'InternalLabelPreview']) }));

describe('persistent bottom tab bar (T64)', () => {
  it('the root stack holds ONLY the tab navigator — no screen is pushed above the tab bar', () => {
    const root = read('AppNavigator.tsx');
    const rootScreens = [...root.matchAll(/<Stack\.Screen name="([A-Za-z]+)"/g)].map(m => m[1]);
    expect(rootScreens).toEqual(['Tabs']);
  });

  it('every screen of the register (E06–E44) is in the shared list, which each of the five tab stacks mounts', () => {
    const names = Object.keys(SHARED_SCREENS);
    const paramList = read('AppNavigator.tsx');
    const block = paramList.slice(paramList.indexOf('export type TabStackParamList'), paramList.indexOf('export type RootStackParamList'));
    const routes = [...block.matchAll(/^\s+([A-Za-z]+)\??:/gm)].map(m => m[1]);
    const roots = ['Today', 'AddChoice', 'ReportsHome', 'More'];
    expect(routes.filter(r => !roots.includes(r) && !names.includes(r))).toEqual([]);
    const tabs = read('TabNavigator.tsx');
    for (const root of ['Today', 'Items', 'AddChoice', 'ReportsHome', 'More']) expect(tabs).toContain(`makeTabStack('${root}'`);
    expect(tabs).toContain('{sharedScreens(S, rootName)}');
    expect((tabs.match(/<Tab\.Screen name="[A-Za-z]+Tab"/g) ?? []).length).toBe(5);
  });

  it('only the camera scanner and the native PDF preview may hide the tab bar', () => {
    expect([...FULL_SCREEN].sort()).toEqual(['BarcodeScanner', 'InternalLabelPreview', 'ReportPreview']);
    expect(read('TabNavigator.tsx')).toMatch(/FULL_SCREEN\.has\(getFocusedRouteNameFromRoute\(route\)/);
  });

  it('tabTarget / inTab address screens through their tab stack', () => {
    expect(tabTarget('Items')).toEqual({ screen: 'ItemsTab', params: { screen: 'Items', params: undefined } });
    expect(inTab('Today', 'BatchDetail', { id: 'b1' })).toMatchObject({ screen: 'TodayTab', params: { screen: 'BatchDetail', params: { id: 'b1' } } });
  });
});

describe('settings are not duplicated', () => {
  it('tab root headers carry no settings gear; More is the only settings hub', () => {
    const header = fs.readFileSync(path.resolve(__dirname, '../../components/WorkspaceHeader.tsx'), 'utf8');
    expect(header).not.toMatch(/settings-outline|cog/);
    const more = fs.readFileSync(path.resolve(__dirname, '../../modules/more/screens/MoreScreen.tsx'), 'utf8');
    expect((more.match(/navigate\('SettingsOfflinePrivate'\)/g) ?? []).length).toBe(1);
    expect(more).not.toMatch(/modules\/billing|useBilling|restorePurchases|FreeLimitSheet/);
  });
});
