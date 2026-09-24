import fs from 'fs';
import path from 'path';

/**
 * i18n completion guard: every language ships, button-length keys stay short
 * enough for a full-width button at the 0.75 minimum font scale, and every
 * interpolation placeholder used in English exists in the translation.
 */
const LOCALES = ['en', 'ar', 'tr', 'fr', 'es', 'de'];
const dir = path.join(__dirname, '../locales');
const bundles: Record<string, any> = Object.fromEntries(LOCALES.map(l => [l, JSON.parse(fs.readFileSync(path.join(dir, `${l}.json`), 'utf8'))]));

function flatten(obj: any, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out[key] = v;
    else if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, flatten(v, key));
  }
  return out;
}
const flat = Object.fromEntries(LOCALES.map(l => [l, flatten(bundles[l])]));

// Keys rendered on full-width AppButtons / tab labels / chips. Longest tolerated: 34 chars (DE/FR at 0.75 scale).
const BUTTON_KEYS = ['common.save', 'common.cancel', 'common.continue', 'common.done', 'common.retry', 'legal.contact.emailButton',
  'nav.today', 'nav.items', 'nav.add', 'nav.reports', 'nav.more', 'today.startCheck', 'today.quickAdd', 'check.confirm', 'check.wrongDate', 'check.skip',
  'removal.action.used', 'removal.action.sold', 'removal.action.wasted', 'removal.action.returned', 'move.save', 'correct.saveDate', 'correct.saveQty',
  'onboarding.start', 'onboarding.tryDemo', 'onboarding.create', 'demo.enter', 'demo.exit', 'items.newProduct', 'items.clearFilters', 'workspace.add'];

describe('locale completeness', () => {
  it('all six languages are present and non-empty', () => {
    for (const l of LOCALES) expect(Object.keys(flat[l]).length).toBeGreaterThan(250);
  });
  it('T61 button and tab labels fit a full-width button in every language', () => {
    const tooLong: string[] = [];
    for (const l of LOCALES) for (const k of BUTTON_KEYS) {
      const v = flat[l][k];
      expect(v).toBeDefined();
      if (v.length > 34) tooLong.push(`${l}:${k} (${v.length}) ${v}`);
    }
    expect(tooLong).toEqual([]);
  });
  it('every {{placeholder}} used in English appears in each translation of that key', () => {
    const problems: string[] = [];
    for (const [k, en] of Object.entries(flat.en)) {
      const vars = [...en.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]);
      if (!vars.length) continue;
      for (const l of LOCALES.slice(1)) {
        const v = flat[l][k] ?? '';
        for (const name of vars) if (!v.includes(`{{${name}}}`)) problems.push(`${l}:${k} missing {{${name}}}`);
      }
    }
    expect(problems).toEqual([]);
  });
  it('no English text leaked into another language for the new modules (spot check on long keys)', () => {
    const suspects: string[] = [];
    const prefixes = ['today.', 'items.', 'batch.', 'product.', 'check.', 'reminders.', 'reports.', 'backup.', 'onboarding.', 'workspace.', 'more.', 'help.', 'legal.', 'import.', 'export.', 'add.', 'rules.', 'locations.', 'label.', 'markdown.', 'dateKindHelp.', 'status.'];
    for (const l of ['ar', 'tr', 'fr', 'es', 'de']) for (const [k, en] of Object.entries(flat.en)) {
      if (!prefixes.some(p => k.startsWith(p)) || en.length < 25) continue;
      if (!/[A-Za-z]{3,}/.test(en.replace(/\{\{\w+\}\}/g, ''))) continue; // placeholder-only lines are identical in every language
      if (flat[l][k] === en) suspects.push(`${l}:${k}`);
    }
    expect(suspects).toEqual([]);
  });
});
