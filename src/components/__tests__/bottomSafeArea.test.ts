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

const ACTIVE_SCREENS = [
  'src/modules/backup/screens/BackupScreen.tsx',
  'src/modules/home/screens/HomeScreen.tsx',
  'src/modules/more/screens/AboutScreen.tsx',
  'src/modules/more/screens/CurrencyScreen.tsx',
  'src/modules/more/screens/HelpScreen.tsx',
  'src/modules/more/screens/LanguageScreen.tsx',
  'src/modules/more/screens/LegalScreen.tsx',
  'src/modules/more/screens/MoreScreen.tsx',
  'src/modules/more/screens/OfflinePrivateScreen.tsx',
  'src/modules/products/screens/ProductsScreen.tsx',
  'src/modules/products/screens/ProductDetailScreen.tsx',
  'src/modules/dates/screens/DatesScreen.tsx',
  'src/modules/dates/screens/AddDateScreen.tsx',
  'src/modules/dates/screens/DateDetailScreen.tsx',
  'src/modules/dates/screens/DateCheckScreen.tsx',
  'src/modules/reports/screens/ReportsScreen.tsx',
  'src/modules/settings/screens/DatesSettingsScreen.tsx',
  'src/modules/import/screens/ImportScreen.tsx',
];

const root = path.resolve(__dirname, '../../..');

describe('Android edge-to-edge bottom safe-area regression', () => {
  it('all expected active screens exist on disk', () => {
    const missing = ACTIVE_SCREENS.filter(
      rel => !fs.existsSync(path.resolve(root, rel)),
    );
    expect(missing).toEqual([]);
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
