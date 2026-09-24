import * as fs from 'fs';
import * as path from 'path';
import { colors } from '../colors';

const BANNED_BEIGE_VALUES = [
  '#F4ECD6',
  '#F9E3C8',
  '#FBF1E4',
  '#FAEAD5',
  '#FEF5E7',
  '#FAF3DE',
];

const ACTIVE_SOURCE_FILES = [
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
  'src/components/DemoBackArrow.tsx',
  'src/components/ScreenHeader.tsx',
  'src/components/AppButton.tsx',
  'src/components/InputField.tsx',
  'src/components/ToggleSegment.tsx',
  'src/components/HeaderTopBleed.tsx',
  'src/navigation/AppNavigator.tsx',
  'src/navigation/TabNavigator.tsx',
  'src/theme/colors.ts',
  'src/theme/typography.ts',
];

const root = path.resolve(__dirname, '../../..');
const bannedPattern = new RegExp(BANNED_BEIGE_VALUES.map(v => v.replace('#', '#')).join('|'), 'gi');

describe('TillCalc palette regression guard', () => {
  it('does not contain any banned beige surface value in exported tokens', () => {
    const bannedSet = new Set(BANNED_BEIGE_VALUES.map(v => v.toUpperCase()));
    const violations: string[] = [];
    for (const [key, value] of Object.entries(colors)) {
      if (typeof value === 'string' && bannedSet.has(value.toUpperCase())) {
        violations.push(`${key}: ${value}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('every exported token resolves to a non-empty string', () => {
    for (const [key, value] of Object.entries(colors)) {
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
    }
  });

  it('approved core surface tokens are present and correct', () => {
    expect(colors.background).toBe('#F7F3E8');
    expect(colors.card).toBe('#FFFDF8');
    expect(colors.border).toBe('#DDD3BE');
    expect(colors.primaryBlue).toBe('#1A2540');
    expect(colors.navyRaised).toBe('#2A3856');
    expect(colors.warningYellow).toBe('#E8842D');
    expect(colors.successGreen).toBe('#4D8B6E');
    expect(colors.dangerRed).toBe('#B14D38');
    expect(colors.softBlue).toBe('#E3E9F3');
    expect(colors.softGreen).toBe('#DDEDE5');
    expect(colors.softPurple).toBe('#ECE6FF');
  });

  it('active source file list is not empty and all files exist', () => {
    expect(ACTIVE_SOURCE_FILES.length).toBeGreaterThan(0);
    const missing = ACTIVE_SOURCE_FILES.filter(
      rel => !fs.existsSync(path.resolve(root, rel)),
    );
    expect(missing).toEqual([]);
  });

  it('no active source file contains a banned beige hex literal', () => {
    const violations: string[] = [];
    for (const rel of ACTIVE_SOURCE_FILES) {
      const src = fs.readFileSync(path.resolve(root, rel), 'utf8');
      const matches = src.match(bannedPattern);
      if (matches) {
        violations.push(`${rel}: ${[...new Set(matches)].join(', ')}`);
      }
    }
    expect(violations).toEqual([]);
  });
});
