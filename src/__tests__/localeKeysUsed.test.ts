/**
 * T58 / T59: every translation key the source asks for exists in all six languages, so no screen can show a raw key.
 * Literal keys (t('a.b')) are checked one by one; template keys (t(`a.${x}`)) must at least have their namespace.
 */
import fs from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '..');
const LOCALES = ['en', 'ar', 'tr', 'fr', 'es', 'de'];
const bundles: Record<string, any> = Object.fromEntries(LOCALES.map(l => [l, JSON.parse(fs.readFileSync(path.join(SRC, 'locales', `${l}.json`), 'utf8'))]));

const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => {
  const p = path.join(d, e.name);
  if (e.isDirectory()) return e.name === '__tests__' || e.name === 'locales' ? [] : walk(p);
  return /\.(ts|tsx)$/.test(e.name) ? [p] : [];
});
const get = (obj: any, dotted: string): unknown => dotted.split('.').reduce((acc, k) => (acc == null ? undefined : acc[k]), obj);

const literal = new Map<string, string>();
const templates = new Map<string, string>();
for (const file of walk(SRC)) {
  const src = fs.readFileSync(file, 'utf8');
  const rel = path.relative(SRC, file);
  for (const m of src.matchAll(/\bt\(\s*'([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)+)'/g)) literal.set(m[1], rel);
  for (const m of src.matchAll(/\bt\(\s*`([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)*)\.\$\{/g)) templates.set(m[1], rel);
}

describe('translation keys used by the source', () => {
  it('finds the keys (sanity)', () => {
    expect(literal.size).toBeGreaterThan(400);
  });
  it('every literal key exists as text in all six languages', () => {
    const missing: string[] = [];
    for (const [key, file] of literal) for (const l of LOCALES) {
      const v = get(bundles[l], key);
      if (v === undefined || v === '') missing.push(`${l}:${key} (${file})`);
    }
    expect(missing).toEqual([]);
  });
  it('every template key namespace exists in all six languages', () => {
    const missing: string[] = [];
    for (const [ns, file] of templates) for (const l of LOCALES) {
      const v = get(bundles[l], ns);
      if (!v || typeof v !== 'object') missing.push(`${l}:${ns}.* (${file})`);
    }
    expect(missing).toEqual([]);
  });
});
