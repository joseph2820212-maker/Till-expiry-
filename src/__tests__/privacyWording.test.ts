// F08 (audit): privacy wording is the recommended core statement, no absolutes, review build without purchases,
// no inherited Till Note strings (except the backup error that rejects Till Note files), OTA updates disabled,
// licence texts bundled.
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

// These expectations are written against the final English that the help/legal stream hands to the lead
// (help.*, legal.*, and the changed settings.* / about.* keys); they pass once those keys are merged into en.json.
const OFFLINE_INFO = 'Your products, dated items, rules and history are stored on your device and are not sent to TillExpiry servers. This review build has no account, no purchases and no analytics. Files leave TillExpiry only when you choose to export, share, print or back them up.';

/** Keys that must name another Till app so its files can be rejected (the only allowed mentions). */
const OTHER_APP_ALLOWED = new Set(['backup.err.tillNoteBackup', 'backup.err.tillCalcBackup']);

describe('F08.1 — the core privacy statement, without absolutes', () => {
  it('the recommended statement is the offline/privacy text', () => {
    expect(get(en, 'settings.offlineInfoMsg')).toBe(OFFLINE_INFO);
  });
  it('the absolutes the audit named are gone from every locale (English phrasing) and the new wording is present', () => {
    const all = flatten(en).map(([, v]) => v).join('\n');
    for (const absolute of ['No data is sent to any server', 'no data leaves your phone', 'Purchases go through your app store only', 'Nothing about how you use it leaves the device', 'everything stays on this phone']) {
      expect(all).not.toContain(absolute);
    }
    expect(get(en, 'settings.calculationsLocalOnlySub')).toContain('not sent to TillExpiry servers');
    expect(get(en, 'legal.privacy.p2')).toContain('not sent to TillExpiry servers');
    expect(get(en, 'legal.terms.p3')).toContain('not sent to TillExpiry servers');
    expect(get(en, 'help.faq.dataPrivacy.a1')).toContain('there is no account and no cloud');
    expect(String(get(en, 'legal.privacy.l5'))).toMatch(/does not download code updates/);
    expect(String(get(en, 'legal.privacy.l6'))).toMatch(/scheduled on the device/);
  });
  it('help, legal and About never call an item safe, never promise a shelf life, and say the app does not decide', () => {
    const mine = flatten(en).filter(([k]) => /^(help|legal|about)\./.test(k));
    expect(mine.filter(([, v]) => /\bsafe\b|safely|unsafe/i.test(v)).map(([k]) => k)).toEqual([]);
    expect(String(get(en, 'legal.terms.p16'))).toMatch(/does not determine, check or validate the shelf life/);
    expect(String(get(en, 'legal.terms.p16'))).toMatch(/not legal food labels/);
    expect(String(get(en, 'about.description'))).toMatch(/does not decide whether food is fit to eat or sell/);
  });
});

describe('F08.3 — review build: no purchases, no billing, no RevenueCat', () => {
  it('no billing namespace and no purchase wording in any English text', () => {
    expect((en as any).billing).toBeUndefined();
    const offenders = flatten(en).filter(([, v]) => /RevenueCat|in-app purchase|one-time purchase|free plan|\bPro\b|Unlock Pro/i.test(v)).map(([k]) => k);
    expect(offenders).toEqual([]);
  });
  it('help, privacy, terms and About say that this build has no purchases', () => {
    expect(String(get(en, 'help.faq.gettingStarted.a2'))).toMatch(/no purchases, no subscription and no billing/);
    expect(String(get(en, 'legal.privacy.p1'))).toMatch(/no purchases and no billing/);
    expect(String(get(en, 'legal.terms.p4'))).toMatch(/no purchases, subscriptions or billing/);
    expect(String(get(en, 'about.noAnalyticsSub'))).toMatch(/no purchases and no billing/);
  });
  it('no billing or network SDK is installed', () => {
    const pkg = JSON.parse(require('fs').readFileSync(require('path').resolve(__dirname, '../../package.json'), 'utf8'));
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(deps.filter(d => /purchases|revenuecat|iap|billing|analytics|sentry|firebase|amplitude|segment|mixpanel/i.test(d))).toEqual([]);
  });
  it('OTA updates are explicitly disabled so the privacy policy is true', () => {
    expect((appJson as any).expo.updates).toEqual({ enabled: false });
  });
});

describe('F08.2 — no inherited Till Note strings remain', () => {
  it.each(Object.keys(LOCALES))('%s: no Till Note branding, PIN / recovery-key / biometric / payroll / Daily Book / trial / subscription strings', lang => {
    const entries = flatten(LOCALES[lang]).filter(([k]) => !OTHER_APP_ALLOWED.has(k));
    const offenders = entries.filter(([k, v]) => /till note/i.test(v) || /14-day|free trial|monthly|yearly|subscription/i.test(k) || /(^|\.)(pin|recoveryKey|biometric|payroll|dailyBook|onboardingPreview)/i.test(k.split('.').slice(-1)[0]) || /\bPIN\b|recovery key|Face ID|Daily Book|payroll settings/i.test(v) && !/does not do payroll|no payroll/i.test(v)).map(([k]) => k);
    expect(offenders).toEqual([]);
  });
  it('the backup error that rejects Till Note files still names Till Note (the one allowed mention)', () => {
    expect(String(get(en, 'backup.err.tillNoteBackup'))).toMatch(/Till Note/);
  });
  it.each(Object.keys(LOCALES))('%s: no TillCalc / TillLabel branding or calculator / label wording survives the copy', lang => {
    // No TillCalc or TillLabel branding survives the copy (apart from the backup error that rejects a TillCalc file).
    const offenders = flatten(LOCALES[lang]).filter(([k, v]) => !OTHER_APP_ALLOWED.has(k) && /TillCalc|TillLabel/.test(v)).map(([k]) => k);
    expect(offenders).toEqual([]);
    if (lang === 'en') {
      expect(flatten(en).filter(([, v]) => /\bmargin|markup|scenario|shelf label|print queue/i.test(v)).map(([k]) => k)).toEqual([]);
      // Calculator wording is checked in the help / legal / About texts; the price helper may say "price calculation".
      expect(flatten(en).filter(([k, v]) => /^(help|legal|about)\./.test(k) && /calculat/i.test(v)).map(([k]) => k)).toEqual([]);
    }
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
