/**
 * Owner decision (23 Sep 2026): the family's legal, help and support content matches Till Note —
 * same publisher details, same document set, same section structure — with app-specific wording (TillExpiry; inherited from TillExpiry and TillCalc).
 * This test pins that parity against the Till Note heading list so a future edit cannot drop a section,
 * and guards against Till Note vocabulary that does not apply to TillExpiry.
 */
import fs from 'fs';
import path from 'path';
import { getLegalDoc, LEGAL_DOC_IDS, legalVars } from '../content/legalContent';
import { getFaqChapters, getGuideChapters, FAQ_CHAPTER_IDS, GUIDE_CHAPTER_IDS } from '../content/helpContent';
import { COMPANY_DETAILS, EFFECTIVE_DATE, EMAILS, PUBLISHER } from '../../../appMeta';

const LOCALES = ['en', 'ar', 'tr', 'fr', 'es', 'de'];
const localeDir = path.join(__dirname, '../../../locales');
const bundles: Record<string, any> = Object.fromEntries(LOCALES.map(l => [l, JSON.parse(fs.readFileSync(path.join(localeDir, `${l}.json`), 'utf8'))]));

function makeT(lang: string) {
  return (key: string, opts?: Record<string, unknown>) => {
    let node: any = bundles[lang];
    for (const part of key.split('.')) node = node?.[part];
    if (typeof node !== 'string') return key;
    return node.replace(/\{\{(\w+)\}\}/g, (_m, k) => String(opts?.[k] ?? `{{${k}}}`));
  };
}
const t = makeT('en');
const headings = (id: (typeof LEGAL_DOC_IDS)[number]) => getLegalDoc(t, id).blocks.filter(b => b.k === 'h').map(b => b.t);

/** Till Note privacy section → the TillExpiry heading that carries the same obligation. */
const PRIVACY_MAP: [string, string][] = [
  ['Offline-first by design', 'Offline by design'],
  ['No cloud bookkeeping server', 'No tracking'],
  ['Device services the app may use', 'Device features the app may use'],
  ['Your responsibilities', 'Your responsibilities'],
  ['Your control over your data', 'Your control'],
  ['Children', 'Children'],
  ['Contacting support safely', 'Contacting support safely'],
  ['Changes to this policy', 'Changes to this policy'],
  ['Privacy questions and data requests', 'Privacy questions and data requests'],
];
const TERMS_MAP: [string, string][] = [
  ['Acceptance of these Terms', 'Acceptance of these Terms'],
  ['Eligibility', 'Eligibility'],
  ['Provider', 'Provider'],
  ['Accuracy of your records', 'Accuracy of your figures'],
  ['Not professional advice', 'No professional advice'],
  ['Provided "as is"', 'Provided "as is"'],
  ['Limitation of liability', 'Liability'],
  ['Data loss', 'Data loss'],
  ['Intellectual property', 'Intellectual property'],
  ['Changes to the app and these Terms', 'Changes to the app and these Terms'],
  ['Governing law', 'Governing law'],
  ['Legal and terms questions', 'Legal and terms questions'],
];

describe('legal parity with Till Note', () => {
  it('privacy policy carries every Till Note section, in Till Note order', () => {
    const got = headings('privacy');
    const expected = PRIVACY_MAP.map(([, tc]) => tc);
    expect(got.filter(h => expected.includes(h))).toEqual(expected);
  });

  it('terms of use carry every Till Note section, in Till Note order', () => {
    const got = headings('terms');
    const expected = TERMS_MAP.map(([, tc]) => tc);
    expect(got.filter(h => expected.includes(h))).toEqual(expected);
  });

  it('ships privacy, terms, data-storage notice and licences (the date-responsibility wording lives in the terms)', () => {
    expect([...LEGAL_DOC_IDS]).toEqual(['privacy', 'terms', 'dataStorage', 'licences']);
    expect(getLegalDoc(t, 'dataStorage').title).toBe('Data Storage & Backup Notice');
  });

  it('uses the same publisher identity as Till Note and dates every document', () => {
    expect(PUBLISHER).toBe('LLILL LTD');
    expect(COMPANY_DETAILS.registrationNumber).toBe('11792206');
    expect(COMPANY_DETAILS.registeredOffice).toBe('20a Southover Street, Brighton, England, BN2 9UD');
    expect(COMPANY_DETAILS.governingJurisdiction).toBe('England and Wales');
    expect(EMAILS).toMatchObject({ support: expect.stringMatching(/@/), privacy: expect.stringMatching(/@/), legal: expect.stringMatching(/@/), security: expect.stringMatching(/@/) });
    for (const id of ['privacy', 'terms', 'dataStorage'] as const) {
      expect(getLegalDoc(t, id).intro).toContain(`Last updated: ${EFFECTIVE_DATE}.`);
    }
    const note = `${PUBLISHER}. Company number: 11792206. Registered office: ${COMPANY_DETAILS.registeredOffice}. VAT status: Not VAT registered.`;
    expect(getLegalDoc(t, 'privacy').blocks.some(b => b.k === 'note' && b.t === note)).toBe(true);
    expect(getLegalDoc(t, 'terms').blocks.some(b => b.k === 'note' && b.t === note)).toBe(true);
  });

  it('routes privacy, legal and security questions to their own addresses (support only for help)', () => {
    const text = (id: (typeof LEGAL_DOC_IDS)[number]) => getLegalDoc(t, id).blocks.map(b => b.t).join('\n');
    expect(text('privacy')).toContain(EMAILS.privacy);
    expect(text('terms')).toContain(EMAILS.legal);
    expect(text('dataStorage')).toContain(EMAILS.security);
    expect(t('legal.contact.body', legalVars(t))).toContain(EMAILS.support);
    expect(t('legal.contact.security', legalVars(t))).toContain(EMAILS.security);
  });

  it('FAQ mirrors the Till Note chapter set and the guide has the safe-support chapter', () => {
    // The family (Till Note) chapter set comes first, unchanged and in order; TillExpiry's date chapters follow.
    expect(FAQ_CHAPTER_IDS.slice(0, 5)).toEqual(['gettingStarted', 'dataPrivacy', 'permissions', 'troubleshooting', 'support']);
    expect(FAQ_CHAPTER_IDS.slice(5)).toEqual(['dates', 'reminders', 'plans']);
    expect(GUIDE_CHAPTER_IDS).toContain('support');
    const faq = getFaqChapters(t);
    expect(faq.flatMap(c => c.blocks).filter(b => b.k === 'h').map(b => b.t).slice(0, 7)).toEqual([
      'Is TillExpiry an online app?',
      'Does TillExpiry send my figures to a server?',
      'Why does the app ask for the camera or files?',
      'What happens if I lose my phone?',
      'Does deleting the app delete my data?',
      'How do I contact support?',
      'What can I safely send to support?',
    ]);
  });

  for (const lang of LOCALES) {
    it(`renders every legal document, FAQ and support string in ${lang} without a leaked placeholder or missing key`, () => {
      const tl = makeT(lang);
      const vars = legalVars(tl);
      const texts = [
        ...LEGAL_DOC_IDS.flatMap(id => { const d = getLegalDoc(tl, id); return [d.title, d.intro ?? '', ...d.blocks.map(b => b.t)]; }),
        ...getFaqChapters(tl).flatMap(c => [c.title, ...c.blocks.map(b => b.t)]),
        ...getGuideChapters(tl).flatMap(c => [c.title, ...c.blocks.map(b => b.t)]),
        tl('legal.contact.title'), tl('legal.contact.body', vars), tl('legal.contact.never'), tl('legal.contact.security', vars), tl('legal.contact.emailButton'),
        tl('about.description', vars), tl('settings.dataStorageNotice'), tl('help.tabFaq'), tl('help.faqIntro'),
        tl('legal.contact.mailBody', { app: 'TillExpiry', version: '0.1.0', platform: 'Android', osVersion: '14' }),
      ];
      expect(texts.filter(x => /\{\{/.test(x))).toEqual([]);
      expect(texts.filter(x => /^[a-z]+\.[a-zA-Z.0-9]+$/.test(x))).toEqual([]); // a raw key means a missing translation
    });
  }

  it('never uses Till Note or TillCalc vocabulary that does not apply to TillExpiry, in any language', () => {
    const en = JSON.stringify([bundles.en.legal, bundles.en.help, bundles.en.about, bundles.en.settings.dataStorageNotice]);
    expect(en).not.toMatch(/\bPIN\b|recovery key|biometric|bookkeeping|accountant pack|Daily Book|Till Note|net pay/i);
    expect(JSON.stringify([bundles.en.legal, bundles.en.help.faq, bundles.en.about])).not.toMatch(/payroll/i);
    for (const lang of LOCALES) {
      const raw = JSON.stringify([bundles[lang].legal, bundles[lang].help, bundles[lang].about]);
      expect(raw).not.toMatch(/Till Note|TillCalc|\bPIN\b/);
    }
  });
});
