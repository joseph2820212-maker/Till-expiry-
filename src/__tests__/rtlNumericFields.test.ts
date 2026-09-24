/**
 * T62: numbers, dates, codes and times stay usable under RTL. Every form field that takes a number (decimal / number
 * pad) is marked `ltr`, which FormBits turns into left-to-right text alignment when the app runs in Arabic.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => {
  const p = path.join(d, e.name);
  if (e.isDirectory()) return e.name === '__tests__' ? [] : walk(p);
  return /\.tsx$/.test(e.name) ? [p] : [];
});

describe('RTL numeric fields (T62)', () => {
  it('FormBits applies left-to-right text to ltr fields under RTL', () => {
    const src = fs.readFileSync(path.join(ROOT, 'components/forms/FormBits.tsx'), 'utf8');
    expect(src).toMatch(/ltr && I18nManager\.isRTL \? s\.ltr/);
    expect(src).toMatch(/ltr: \{[^}]*writingDirection: 'ltr'|ltr: \{[^}]*textAlign: 'left'/);
  });
  it('every numeric <Field> is marked ltr', () => {
    const offenders: string[] = [];
    for (const file of walk(ROOT)) {
      const src = fs.readFileSync(file, 'utf8');
      for (const m of src.matchAll(/<Field\b[^>]*?keyboardType="(decimal-pad|number-pad)"[^>]*?\/>/gs)) {
        if (!/\bltr\b/.test(m[0])) offenders.push(`${path.relative(ROOT, file)}: ${m[0].slice(0, 80)}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
