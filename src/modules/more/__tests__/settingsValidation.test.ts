import * as fs from 'fs';
import * as path from 'path';

const screensDir = path.resolve(__dirname, '../screens');

function readScreen(name: string): string {
  return fs.readFileSync(path.join(screensDir, name), 'utf8');
}

describe('CurrencyScreen canonical persistence (A2/A12)', () => {
  const src = readScreen('CurrencyScreen.tsx');

  it('uses setCurrencyOption from currency.ts, not direct AsyncStorage', () => {
    expect(src).toContain('setCurrencyOption');
    expect(src).not.toMatch(/AsyncStorage\.setItem/);
    expect(src).not.toMatch(/import.*AsyncStorage/);
  });
});

describe('LanguageScreen result handling (A5/A12)', () => {
  const src = readScreen('LanguageScreen.tsx');

  it('handles changeLanguage result', () => {
    expect(src).toMatch(/result\.rolledBack/);
  });

  it('has busy/switching state', () => {
    expect(src).toContain('switching');
    expect(src).toContain('setSwitching');
  });

  it('prevents duplicate taps while switching', () => {
    expect(src).toMatch(/disabled.*switching|switching.*return/);
  });
});

describe('HelpScreen content (A6/A12)', () => {
  const src = readScreen('HelpScreen.tsx');

  it('does NOT reference Till Note support email', () => {
    expect(src).not.toContain('tillnote.com');
  });

  it('does NOT reference Daily Book or backups', () => {
    expect(src).not.toContain('faqDailyBook');
    expect(src).not.toContain('faqBackups');
    expect(src).not.toContain('faqRestoreData');
    expect(src).not.toContain('faqPinRecovery');
  });

});

describe('AboutScreen content (A9/A12)', () => {
  const src = readScreen('AboutScreen.tsx');

  it('legal links open the real in-app documents (no placeholder URLs)', () => {
    expect(src).toContain("navigate('SettingsLegal', { doc: 'privacy' })");
    expect(src).toContain("navigate('SettingsLegal', { doc: 'terms' })");
    expect(src).toContain("navigate('SettingsLegal', { doc: 'licences' })");
    expect(src).not.toContain('https://');
  });

  it('does NOT reference backup requirement', () => {
    expect(src).not.toContain('backupRequired');
  });

  it('shows factual app info', () => {
    expect(src).toContain('appTagline');
    expect(src).toContain('noAccountRequired');
  });
});

describe('OfflinePrivateScreen content (A10/A12)', () => {
  const src = readScreen('OfflinePrivateScreen.tsx');

  it('does NOT reference backup requirement', () => {
    expect(src).not.toContain('backupRequired');
  });

  it('contains factual local-calculation claims', () => {
    expect(src).toContain('calculationsLocalOnly');
    expect(src).toContain('offlineInfoMsg');
  });
});

