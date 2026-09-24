// Regression guard: Android edge-to-edge bottom safe-area.
//
// With android.edgeToEdgeEnabled=true the Samsung 3-button nav bar overlays
// the bottom of the app unless every bottom action bar accounts for
// insets.bottom.
//
// This test scans every ACTIVE TillExpiry screen file for the combination:
//   1. SafeAreaView edges={['top']} only — bottom not protected at SAV level
//   2. paddingBottom: 28 (the footer-bar constant)
//   3. no AppBottomActions / AppBottomContentGap
//   4. no useSafeAreaInsets
//
// If ALL four are true the bottom bar can be clipped by the Android nav bar.

import * as fs from 'fs';
import * as path from 'path';



const root = path.resolve(__dirname, '../../..');
/** Every screen file of the app (found on disk, so a new screen can never be forgotten here). */
function screenFiles(): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== '__tests__') walk(p); }
      else if (/Screen\.tsx$/.test(e.name)) out.push(path.relative(root, p).split(path.sep).join('/'));
    }
  };
  walk(path.resolve(root, 'src/modules'));
  return out.sort();
}
const ACTIVE_SCREENS = screenFiles();


describe('Android edge-to-edge bottom safe-area regression', () => {
  it('finds the screen register on disk (E01–E44 minus sheets)', () => {
    expect(ACTIVE_SCREENS.length).toBeGreaterThanOrEqual(40);
  });

  it('no active screen has an unprotected footer-bar paddingBottom: 28', () => {
    const violations: string[] = [];

    for (const rel of ACTIVE_SCREENS) {
      const abs = path.resolve(root, rel);
      const src = fs.readFileSync(abs, 'utf8');

      const hasTopOnlySafeArea = /edges=\{?\[['"]top['"]\]\}?/.test(src);
      const hasFooterPaddingBottom = /paddingBottom:\s*28\b/.test(src);
      const hasSharedSafe = /AppBottomActions|AppBottomContentGap/.test(src);
      const hasSafeInset = /useSafeAreaInsets/.test(src);

      if (hasTopOnlySafeArea && hasFooterPaddingBottom && !hasSharedSafe && !hasSafeInset) {
        violations.push(rel);
      }
    }

    expect(violations).toEqual([]);
  });
});
