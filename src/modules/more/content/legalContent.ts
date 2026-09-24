import type { ContentBlock, ContentDoc } from '../../../components/DocBlocks';
import { APP_NAME, PUBLISHER, EMAILS, COMPANY_DETAILS, EFFECTIVE_DATE } from '../../../appMeta';
import { OSS_COUNT, OSS_GENERATED_AT } from './openSourceLicenses';

type T = (key: string, opts?: Record<string, unknown>) => string;
export type LegalDocId = 'privacy' | 'terms' | 'dataStorage' | 'licences';
export const LEGAL_DOC_IDS: readonly LegalDocId[] = ['privacy', 'terms', 'dataStorage', 'licences'] as const;

type Spec = { k: ContentBlock['k']; key: string };
/** `key: 'companyNote'` is the shared legal.companyNote line (publisher, company number, registered office, VAT status). */
const COMPANY: Spec = { k: 'note', key: 'companyNote' };

/**
 * Legal texts are locale keys (legal.*) so all six languages stay complete; company facts come from appMeta.
 * Section order mirrors the family documents (parity guarded by legalParity.test.ts); the wording is the app's own:
 * records stay on the device, files leave only when the user exports / shares / prints / backs up, notifications are
 * local, code updates are not downloaded, and this review build has no purchases or billing.
 */
const PRIVACY: Spec[] = [
  { k: 'h', key: 'h1' }, { k: 'p', key: 'p1' },                                  // Offline by design
  { k: 'h', key: 'h2' }, { k: 'p', key: 'p2' },                                  // No tracking
  { k: 'h', key: 'h3' }, { k: 'li', key: 'l1' }, { k: 'li', key: 'l2' }, { k: 'li', key: 'l3' }, { k: 'li', key: 'l4' }, { k: 'li', key: 'l5' }, { k: 'li', key: 'l6' }, // Device features
  { k: 'h', key: 'h8' }, { k: 'p', key: 'p7' },                                  // Your responsibilities
  { k: 'h', key: 'h4' }, { k: 'p', key: 'p3' },                                  // Your control
  { k: 'h', key: 'h5' }, { k: 'p', key: 'p4' },                                  // Backups
  { k: 'h', key: 'h6' }, { k: 'p', key: 'p5' },                                  // Children
  { k: 'h', key: 'h9' }, { k: 'p', key: 'p8' },                                  // Contacting support
  { k: 'h', key: 'h10' }, { k: 'p', key: 'p9' },                                 // Changes to this policy
  { k: 'h', key: 'h7' }, { k: 'p', key: 'p6' },                                  // Privacy questions and data requests
  COMPANY,
];
const TERMS: Spec[] = [
  { k: 'h', key: 'h7' }, { k: 'p', key: 'p7' },                                  // Acceptance
  { k: 'h', key: 'h8' }, { k: 'p', key: 'p8' },                                  // Eligibility
  { k: 'h', key: 'h9' }, { k: 'p', key: 'p9' }, COMPANY,                         // Provider
  { k: 'h', key: 'h1' }, { k: 'p', key: 'p1' },                                  // What the app is
  { k: 'h', key: 'h16' }, { k: 'p', key: 'p16' }, { k: 'p', key: 'p17' },       // Dates, rules and labels (the §36 disclaimer)
  { k: 'h', key: 'h10' }, { k: 'p', key: 'p10' },                                // Accuracy of your records
  { k: 'h', key: 'h2' }, { k: 'p', key: 'p2' }, { k: 'note', key: 'n1' },        // No professional advice
  { k: 'h', key: 'h11' }, { k: 'p', key: 'p11' },                                // Provided "as is"
  { k: 'h', key: 'h5' }, { k: 'p', key: 'p5' },                                  // Liability
  { k: 'h', key: 'h12' }, { k: 'p', key: 'p12' },                                // Data loss
  { k: 'h', key: 'h3' }, { k: 'p', key: 'p3' },                                  // Your data
  { k: 'h', key: 'h4' }, { k: 'p', key: 'p4' },                                  // Review build (no purchases, no billing)
  { k: 'h', key: 'h13' }, { k: 'p', key: 'p13' },                                // Intellectual property
  { k: 'h', key: 'h14' }, { k: 'p', key: 'p14' },                                // Changes to the app and these Terms
  { k: 'h', key: 'h6' }, { k: 'p', key: 'p6' },                                  // Governing law
  { k: 'h', key: 'h15' }, { k: 'p', key: 'p15' },                                // Legal and terms questions
];
const DATA_STORAGE: Spec[] = [
  { k: 'p', key: 'p1' }, { k: 'li', key: 'l1' }, { k: 'li', key: 'l2' }, { k: 'li', key: 'l3' }, { k: 'li', key: 'l4' }, { k: 'li', key: 'l5' }, { k: 'li', key: 'l6' }, { k: 'note', key: 'n1' },
  { k: 'h', key: 'h1' }, { k: 'p', key: 'p2' },                                  // Reporting a security concern
];
const SPECS: Record<Exclude<LegalDocId, 'licences'>, Spec[]> = { privacy: PRIVACY, terms: TERMS, dataStorage: DATA_STORAGE };

/** Interpolation values shared by every legal / help / support string. */
export function legalVars(t: T): Record<string, string | number> {
  return {
    app: APP_NAME,
    publisher: PUBLISHER,
    email: EMAILS.support,
    supportEmail: EMAILS.support,
    privacyEmail: EMAILS.privacy,
    legalEmail: EMAILS.legal,
    securityEmail: EMAILS.security,
    companyNumber: COMPANY_DETAILS.registrationNumber,
    registeredOffice: COMPANY_DETAILS.registeredOffice,
    vatStatus: t('legal.vatNotRegistered'),
    date: EFFECTIVE_DATE,
  };
}

export function getLegalDoc(t: T, id: LegalDocId): ContentDoc {
  const vars = legalVars(t);
  if (id === 'licences') {
    const v = { ...vars, count: OSS_COUNT, date: OSS_GENERATED_AT };
    return { id, title: t('legal.licences.title'), intro: t('legal.licences.intro', v), blocks: [{ k: 'p', t: t('legal.licences.p1', v) }] };
  }
  const blocks = SPECS[id].map(b => ({ k: b.k, t: b.key === 'companyNote' ? t('legal.companyNote', vars) : t(`legal.${id}.${b.key}`, vars) }));
  const lastUpdated = t('legal.lastUpdated', vars);
  // Privacy and Terms carry an intro sentence + "Last updated"; the two notices show only the date line.
  const intro = id === 'privacy' || id === 'terms' ? `${t(`legal.${id}.intro`, vars)} ${lastUpdated}` : lastUpdated;
  return { id, title: t(`legal.${id}.title`), intro, blocks };
}
