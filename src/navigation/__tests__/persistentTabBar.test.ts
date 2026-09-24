// Owner request (post-audit): the bottom navigation must stay visible on every screen,
// and settings must not be reachable twice from the same place.
import fs from 'fs';
import path from 'path';
import { tabTarget } from '../tabs';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8');

describe('persistent bottom tab bar', () => {
  it('the root stack holds ONLY the tab navigator — no screen is pushed above the tab bar', () => {
    const root = read('AppNavigator.tsx');
    const rootScreens = [...root.matchAll(/<Stack\.Screen name="([A-Za-z]+)"/g)].map(m => m[1]);
    expect(rootScreens).toEqual(['Tabs']);
  });
  it('every feature screen is registered once in the shared list and each of the four tabs mounts that list in its own stack', () => {
    const shared = read('sharedScreens.tsx');
    const names = [...shared.matchAll(/<Stack\.Screen name="([A-Za-z]+)"/g)].map(m => m[1]);
    expect(names.length).toBe(15);
    expect(new Set(names).size).toBe(names.length);
    const tabs = read('TabNavigator.tsx');
    for (const root of ['Home', 'Dates', 'Products', 'More']) expect(tabs).toContain(`makeTabStack('${root}'`);
    expect(tabs).toContain('{sharedScreens(S)}');
    expect((tabs.match(/<Tab\.Screen name="[A-Za-z]+Tab"/g) ?? []).length).toBe(4);
  });
  it('tabTarget addresses a tab root through its stack, so direct "screen: Products" style calls do not exist', () => {
    expect(tabTarget('Products')).toEqual({ screen: 'ProductsTab', params: { screen: 'Products', params: undefined } });
    expect(tabTarget('Dates', { filter: 'expired' })).toEqual({ screen: 'DatesTab', params: { screen: 'Dates', params: { filter: 'expired' } } });
    const srcDir = path.resolve(__dirname, '../../modules');
    const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
    const offenders = walk(srcDir).filter(f => /\.tsx?$/.test(f) && !/__tests__/.test(f)).filter(f => /navigate\('Tabs', \{ screen: '(Home|Dates|Products|More)'/.test(fs.readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});

describe('settings are not duplicated', () => {
  it('Home has no second gear button to More; More lists Offline & Private once (under About), and rows use Ionicons', () => {
    const home = fs.readFileSync(path.resolve(__dirname, '../../modules/home/screens/HomeScreen.tsx'), 'utf8');
    expect(home).not.toMatch(/settings-outline/);
    const more = fs.readFileSync(path.resolve(__dirname, '../../modules/more/screens/MoreScreen.tsx'), 'utf8');
    expect(more).not.toMatch(/SettingsOfflinePrivate/);
    expect(more).not.toMatch(/<SettingsRow icon="/);
    const about = fs.readFileSync(path.resolve(__dirname, '../../modules/more/screens/AboutScreen.tsx'), 'utf8');
    expect(about).toMatch(/SettingsOfflinePrivate/);
    expect(about).not.toMatch(/<SettingsRow icon="/);
  });
});
