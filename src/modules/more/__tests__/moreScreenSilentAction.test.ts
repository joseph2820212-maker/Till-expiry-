import * as fs from 'fs';
import * as path from 'path';

const moreScreenPath = path.resolve(__dirname, '../screens/MoreScreen.tsx');

describe('MoreScreen silent-action regression', () => {
  const src = fs.readFileSync(moreScreenPath, 'utf8');

  it('is built on SettingsRow / SettingsSection (no bespoke MenuRow)', () => {
    expect(src).not.toContain('<MenuRow');
    expect(src).toContain('<SettingsSection');
    expect((src.match(/<SettingsRow\b/g) || []).length).toBeGreaterThan(10);
  });

  it('every SettingsRow declares an onPress (rows without one must say so explicitly)', () => {
    // Inline <Ionicons … /> icon nodes are removed first so a row's own `/>` is what ends the match.
    const rows = src.replace(/iconNode=\{<Ionicons[\s\S]*?\/>\}/g, '').match(/<SettingsRow\b[\s\S]*?\/>/g) || [];
    expect(rows.length).toBeGreaterThan(0);
    const violations = rows.filter(row => !/\bonPress\b/.test(row));
    expect(violations).toEqual([]);
  });

  it('has no "coming later" placeholders left', () => {
    expect(src).not.toContain('comingLater');
    expect(src).not.toContain('disabled');
  });
});
