/**
 * Owner correction (24 Sep 2026): TillLabel is international. No source file may fall back to a
 * particular currency. The only place a currency code or symbol may appear as a literal is the
 * currency catalogue itself (utils/currency.ts SYMBOL_MAP) and the exponent table (utils/currencyUnits.ts).
 */
import fs from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '..');
const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => {
  const p = path.join(d, e.name);
  if (e.isDirectory()) return e.name === '__tests__' || e.name === 'locales' ? [] : walk(p);
  return /\.(ts|tsx)$/.test(e.name) ? [p] : [];
});
const CATALOGUES = new Set(['utils/currency.ts', 'utils/currencyUnits.ts']);

describe('no assumed currency in source', () => {
  it('no GBP / £ (or any other hard-coded currency) outside the currency catalogues', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const rel = path.relative(SRC, file).split(path.sep).join('/');
      if (CATALOGUES.has(rel) || rel.startsWith('modules/more/content/openSource')) continue;
      const src = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      if (/['"`](GBP|EUR|USD|AED|TRY)['"`]|£/.test(src)) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });
  it('the currency module starts unset', () => {
    const src = fs.readFileSync(path.join(SRC, 'utils/currency.ts'), 'utf8');
    expect(src).toMatch(/let _code = '';/);
    expect(src).toMatch(/let _symbol = '';/);
  });
  it('the label money formatter takes an explicit currency and label language and never reads app state', () => {
    const src = fs.readFileSync(path.join(SRC, 'domain/formatMoney.ts'), 'utf8');
    expect(src).toMatch(/export function formatMoney\(amountMinor: number, currencyCode: string, labelLanguage: LanguageCode(, extraDecimals: 0 \| 1 \| 2 = 0)?\)/);
    expect(src).not.toMatch(/getCurrencyCode|getCurrencySymbol|currencyAfter\(|i18n/);
  });
});
