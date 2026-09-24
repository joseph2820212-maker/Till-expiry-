// F10 (audit): every screen that holds text inputs scrolls inside the keyboard-aware
// container (react-native-keyboard-controller), never a plain react-native ScrollView
// whose iOS-only `automaticallyAdjustKeyboardInsets` does nothing on Android.
import fs from 'fs';
import path from 'path';

const SCREENS_DIR = path.resolve(__dirname, '..', 'modules');
const listScreens = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
  const p = path.join(dir, e.name);
  if (e.isDirectory()) return listScreens(p);
  return /screens\/.*Screen\.tsx$/.test(p) ? [p] : [];
});

// Screens whose only inputs live in a bottom sheet (its own keyboard handling) or in a
// header search bar above the fold, so the page scroll never has to lift a field.
// Empty at G1: every future form screen must use AppKeyboardScrollView.
// ProductsScreen: its only input is the search bar above the list; the ScrollView is the horizontal filter chips.
const ALLOWED_PLAIN_SCROLL = new Set<string>(['ProductsScreen.tsx']);

describe('keyboard avoidance', () => {
  const screens = listScreens(SCREENS_DIR);
  it('finds the screens', () => { expect(screens.length).toBeGreaterThanOrEqual(11); });

  it.each(screens.map(p => [path.basename(p), p]))('%s: a screen with inputs uses AppKeyboardScrollView, not a plain ScrollView', (name, file) => {
    const src = fs.readFileSync(file, 'utf8');
    const hasInputs = /<InputField|<TextInput|<AppTextInput|<TaxRateField|<ApplyTaxControl/.test(src);
    const plainScroll = /<ScrollView[\s>]/.test(src);
    if (hasInputs && !ALLOWED_PLAIN_SCROLL.has(name)) {
      expect({ name, plainScroll }).toEqual({ name, plainScroll: false });
    }
    if (plainScroll) expect(src).not.toMatch(/automaticallyAdjustKeyboardInsets/);
  });

});
