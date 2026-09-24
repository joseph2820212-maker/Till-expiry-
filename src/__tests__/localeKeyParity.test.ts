import en from '../locales/en.json';
import ar from '../locales/ar.json';
import de from '../locales/de.json';
import es from '../locales/es.json';
import fr from '../locales/fr.json';
import tr from '../locales/tr.json';

// Every locale must carry exactly the English key set. With fallbackLng 'en' a
// missing key falls back silently, so this is the only thing that catches an
// untranslated string before it ships.
const LOCALES: Record<string, unknown> = { ar, de, es, fr, tr };

function leafKeys(obj: unknown, prefix = ''): string[] {
  if (obj === null || typeof obj !== 'object') return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    leafKeys(v, prefix ? `${prefix}.${k}` : k),
  );
}

const enKeys = new Set(leafKeys(en));

describe('locale key parity with en.json', () => {
  it('en.json has keys', () => {
    expect(enKeys.size).toBeGreaterThan(100);
  });

  for (const [lang, bundle] of Object.entries(LOCALES)) {
    it(`${lang}.json has exactly the en.json key set`, () => {
      const keys = new Set(leafKeys(bundle));
      const missing = [...enKeys].filter(k => !keys.has(k));
      const extra = [...keys].filter(k => !enKeys.has(k));
      expect({ missing, extra }).toEqual({ missing: [], extra: [] });
    });

    it(`${lang}.json has no empty strings`, () => {
      const empties = leafKeys(bundle).filter(k => {
        const v = k.split('.').reduce<any>((acc, p) => (acc == null ? undefined : acc[p]), bundle);
        return typeof v === 'string' && v.trim() === '';
      });
      expect(empties).toEqual([]);
    });
  }
});
