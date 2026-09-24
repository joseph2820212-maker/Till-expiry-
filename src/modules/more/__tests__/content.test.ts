import fs from 'fs';
import path from 'path';
import { GUIDE_CHAPTER_IDS, FAQ_CHAPTER_IDS, getGuideChapters, getFaqChapters } from '../content/helpContent';
import { getLegalDoc, LEGAL_DOC_IDS } from '../content/legalContent';

const LOCALES = ['en', 'ar', 'tr', 'fr', 'es', 'de'];
const localeDir = path.join(__dirname, '../../../locales');
const bundles: Record<string, any> = Object.fromEntries(LOCALES.map(l => [l, JSON.parse(fs.readFileSync(path.join(localeDir, `${l}.json`), 'utf8'))]));

function makeT(lang: string) {
  const missing: string[] = [];
  const t = (key: string, opts?: Record<string, unknown>) => {
    let node: any = bundles[lang];
    for (const part of key.split('.')) { node = node?.[part]; }
    if (typeof node !== 'string') { missing.push(key); return key; }
    return node.replace(/\{\{(\w+)\}\}/g, (_m, k) => String(opts?.[k] ?? `{{${k}}}`));
  };
  return { t, missing };
}

describe('help & legal content', () => {
  for (const lang of LOCALES) {
    it(`every chapter and legal document resolves in ${lang} with no missing key`, () => {
      const { t, missing } = makeT(lang);
      const guide = getGuideChapters(t);
      const faq = getFaqChapters(t);
      const docs = LEGAL_DOC_IDS.map(d => getLegalDoc(t, d));
      expect(guide.map(c => c.id)).toEqual(GUIDE_CHAPTER_IDS);
      expect(faq.map(c => c.id)).toEqual(FAQ_CHAPTER_IDS);
      expect(faq.every(c => c.blocks.length >= 2 && c.blocks.length % 2 === 0)).toBe(true);
      expect(docs.every(d => d.blocks.length > 0 && d.title.length > 0)).toBe(true);
      expect(missing).toEqual([]);
      const all = [...guide, ...faq, ...docs].flatMap(d => [d.title, d.intro ?? '', ...d.blocks.map(b => b.t)]);
      expect(all.filter(x => /\{\{/.test(x))).toEqual([]);
    });
  }

  it('describes TillExpiry, not a pricing calculator (identity check)', () => {
    const { t } = makeT('en');
    const text = [...getGuideChapters(t), ...getFaqChapters(t), ...LEGAL_DOC_IDS.filter(d => d !== 'licences').map(d => getLegalDoc(t, d))].flatMap(d => [d.title, ...d.blocks.map(b => b.t)]).join(' ');
    expect(text).not.toMatch(/TillCalc|calculator|calculation|margin|markup|scenario/i);
  });

  it('never uses payroll wording (no PAYE / National Insurance / net pay) in any language', () => {
    const raw = JSON.stringify(bundles);
    expect(raw).not.toMatch(/\bPAYE\b|National Insurance|\bnet pay\b/i);
  });
});
