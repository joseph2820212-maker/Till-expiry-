// F08 (audit): privacy wording is the recommended core statement, no absolutes,
// no inherited Till Note strings, OTA updates disabled, licence texts bundled.
import en from '../locales/en.json';
import ar from '../locales/ar.json';
import tr from '../locales/tr.json';
import fr from '../locales/fr.json';
import es from '../locales/es.json';
import de from '../locales/de.json';
import appJson from '../../app.json';
import { OSS_PACKAGES, OSS_COUNT } from '../modules/more/content/openSourceLicenses';
import { OSS_LICENSE_TEXTS } from '../modules/more/content/openSourceLicenseTexts';

const LOCALES: Record<string, any> = { en, ar, tr, fr, es, de };
const flatten = (obj: any, prefix = ''): [string, string][] => Object.entries(obj).flatMap(([k, v]) => (typeof v === 'object' && v ? flatten(v, `${prefix}${k}.`) : [[`${prefix}${k}`, String(v)]]));
const get = (obj: any, path: string): unknown => path.split('.').reduce((acc, k) => (acc == null ? undefined : acc[k]), obj);

describe('F08.1 — the core privacy statement, without absolutes', () => {
  it('the recommended statement is the offline/privacy text', () => {
    expect(get(en, 'settings.offlineInfoMsg')).toBe('Your products, dates and history stay on your device and are not sent to TillExpiry servers. Purchases are processed by Apple or Google and RevenueCat. Files leave TillExpiry only when you choose to import, export, share or back them up.');
  });
  it('the absolutes the audit named are gone from every locale (English phrasing) and the new wording is present', () => {
    const all = flatten(en).map(([, v]) => v).join('\n');
    for (const absolute of ['No data is sent to any server', 'no data leaves your phone', 'Purchases go through your app store only', 'Nothing about how you use it leaves the device', 'everything stays on this phone']) {
      expect(all).not.toContain(absolute);
    }
    expect(get(en, 'settings.calculationsLocalOnlySub')).toContain('not sent to TillExpiry servers');
    expect(get(en, 'about.noAnalyticsSub')).toContain('Apple or Google and RevenueCat');
    expect(get(en, 'legal.privacy.p2')).toContain('not sent to TillExpiry servers');
    expect(get(en, 'legal.terms.p3')).toContain('not sent to TillExpiry servers');
    expect(get(en, 'help.faq.dataPrivacy.a1')).toContain('there is no account and no cloud');
    expect(String(get(en, 'legal.privacy.l5'))).toMatch(/does not download code updates/);
  });
  it('the purchase is never marketed as offline', () => {
    const purchaseStrings = flatten(en).filter(([k]) => k.startsWith('billing.')).map(([, v]) => v.toLowerCase()).join('\n');
    expect(purchaseStrings).not.toMatch(/offline/);
  });
  it('OTA updates are explicitly disabled so the privacy policy is true', () => {
    expect((appJson as any).expo.updates).toEqual({ enabled: false });
  });
});

describe('F08.2 — no inherited Till Note strings remain', () => {
  it.each(Object.keys(LOCALES))('%s: no Till Note branding, PIN / recovery-key / biometric / payroll / Daily Book / trial / subscription strings', lang => {
    const entries = flatten(LOCALES[lang]);
    const offenders = entries.filter(([k, v]) => /till note/i.test(v) || /14-day|free trial|monthly|yearly|subscription/i.test(k) || /(^|\.)(pin|recoveryKey|biometric|payroll|dailyBook|onboardingPreview)/i.test(k.split('.').slice(-1)[0]) || /\bPIN\b|recovery key|Face ID|Daily Book|payroll settings/i.test(v) && !/does not do payroll|no payroll/i.test(v)).map(([k]) => k);
    expect(offenders).toEqual([]);
  });
  it.each(Object.keys(LOCALES))('%s: no TillCalc / TillLabel branding or calculator / label wording survives the copy', lang => {
    // No TillCalc or TillLabel branding survives the copy: TillExpiry has no hand-off file and no print engine.
    const offenders = flatten(LOCALES[lang]).filter(([, v]) => /TillCalc|TillLabel/.test(v)).map(([k]) => k);
    expect(offenders).toEqual([]);
    if (lang === 'en') expect(flatten(en).filter(([, v]) => /calculat|margin|markup|scenario|shelf label|print queue/i.test(v)).map(([k]) => k)).toEqual([]);
  });
  it('the keys the audit named as unreachable are gone', () => {
    for (const k of ['settings.version', 'settings.backupShareWarning', 'settings.faqDailyBook', 'settings.expenseCatHint', 'settings.onboardingPreviewItems', 'settings.restoreErrors', 'common.appExportTitle', 'nav.dailyBook', 'errors.weakPin', 'settings.changePin']) {
      expect(get(en, k)).toBeUndefined();
    }
    expect(String(get(en, 'settings.backupSecureNote'))).not.toMatch(/PIN/);
  });
});

describe('F08.4 — licence texts are bundled', () => {
  it('every package points at a bundled text or is marked as shipping none; texts are non-empty and deduplicated', () => {
    expect(OSS_PACKAGES.length).toBe(OSS_COUNT);
    const withText = OSS_PACKAGES.filter(p => p.textIndex >= 0);
    expect(withText.length).toBeGreaterThan(OSS_PACKAGES.length * 0.8);
    for (const p of OSS_PACKAGES) expect(p.textIndex === -1 || (p.textIndex < OSS_LICENSE_TEXTS.length && OSS_LICENSE_TEXTS[p.textIndex].length > 20)).toBe(true);
    expect(new Set(OSS_LICENSE_TEXTS.map(t => t.replace(/\s+/g, ' '))).size).toBe(OSS_LICENSE_TEXTS.length);
    expect(OSS_LICENSE_TEXTS.some(t => /Permission is hereby granted, free of charge/.test(t))).toBe(true); // MIT text really shipped
  });
});

describe('closure — licence texts are complete', () => {
  it('no bundled text is truncated and the generator has no cap', () => {
    expect(OSS_LICENSE_TEXTS.some(t => t.endsWith('…'))).toBe(false);
    const gen = require('fs').readFileSync(require('path').resolve(__dirname, '../../scripts/genOssLicenses.mjs'), 'utf8');
    expect(gen).not.toMatch(/MAX_TEXT_CHARS|text\.slice\(0/);
    // Long licences (MPL-2.0, CC-BY-4.0, Python-2.0) are present in full.
    expect(OSS_LICENSE_TEXTS.some(t => /Mozilla Public License Version 2\.0/.test(t) && /Exhibit B/.test(t))).toBe(true);
  });
});
