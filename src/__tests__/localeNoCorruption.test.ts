import en from '../locales/en.json';
import ar from '../locales/ar.json';
import de from '../locales/de.json';
import es from '../locales/es.json';
import fr from '../locales/fr.json';
import tr from '../locales/tr.json';

// Guard against encoding corruption where accented / non-Latin characters
// (e a u s I Arabic, the GBP symbol, the em-dash) are replaced with literal '?'.
const LOCALES: Record<string, any> = { en, ar, de, es, fr, tr };

const GUARDED_KEYS = [
  'onboarding.disclaimer',
  'dateKindHelp.best_before',
  'deadlineInput.monthHint',
  'status.past.use_by',
  'workspace.zoneChangeHint',
];

const get = (obj: any, path: string): unknown =>
  path.split('.').reduce((acc, k) => (acc == null ? undefined : acc[k]), obj);

describe('locale strings are not encoding-corrupted', () => {
  for (const lang of Object.keys(LOCALES)) {
    for (const key of GUARDED_KEYS) {
      it(`${lang}: ${key} has no '?' corruption`, () => {
        const value = get(LOCALES[lang], key);
        expect(value).toBeDefined();
        expect(typeof value).toBe('string');
        // A literal question mark here means a non-ASCII char was destroyed.
        expect(value as string).not.toContain('?');
      });
    }
  }
});
