import type { ContentBlock, ContentDoc } from '../../../components/DocBlocks';
import { legalVars } from './legalContent';

type T = (key: string, opts?: Record<string, unknown>) => string;

/**
 * Help: the how-to guide and the questions shop owners ask. The structure lives
 * here; every sentence is a locale key (help.*), so the six languages are
 * guaranteed complete by the locale parity test.
 */
/** How-to chapters, in the order a new shop meets them. */
const GUIDE_CHAPTERS: { id: string; items: number }[] = [
  { id: 'firstDates', items: 4 },
  { id: 'scanning', items: 3 },
  { id: 'dateCheck', items: 4 },
  { id: 'reduceWaste', items: 4 },
  { id: 'reminders', items: 3 },
  { id: 'products', items: 3 },
  { id: 'importing', items: 4 },
  { id: 'reports', items: 3 },
  { id: 'backup', items: 3 },
  { id: 'languages', items: 3 },
  { id: 'support', items: 3 },
];

/** Questions & answers (mirrors Till Note's FAQ set; every answer is app-specific and a locale key). */
const FAQ_CHAPTERS: { id: string; questions: number }[] = [
  { id: 'gettingStarted', questions: 1 },
  { id: 'dataPrivacy', questions: 1 },
  { id: 'permissions', questions: 1 },
  { id: 'troubleshooting', questions: 2 },
  { id: 'support', questions: 2 },
  // TillExpiry's own chapters follow the family (Till Note) set, which stays first and unchanged.
  { id: 'dates', questions: 3 },
  { id: 'reminders', questions: 2 },
  { id: 'plans', questions: 1 },
];

export const GUIDE_CHAPTER_IDS = GUIDE_CHAPTERS.map(c => c.id);
export const FAQ_CHAPTER_IDS = FAQ_CHAPTERS.map(c => c.id);

export function getGuideChapters(t: T): ContentDoc[] {
  return GUIDE_CHAPTERS.map(c => ({
    id: c.id,
    title: t(`help.guide.${c.id}.title`),
    blocks: Array.from({ length: c.items }, (_, i) => ({ k: 'li' as const, t: t(`help.guide.${c.id}.l${i + 1}`) })),
  }));
}

export function getFaqChapters(t: T): ContentDoc[] {
  const vars = legalVars(t);
  return FAQ_CHAPTERS.map(c => ({
    id: c.id,
    title: t(`help.faq.${c.id}.title`, vars),
    blocks: Array.from({ length: c.questions }, (_, i) => i + 1).flatMap(n => [
      { k: 'h' as const, t: t(`help.faq.${c.id}.q${n}`, vars) },
      { k: 'p' as const, t: t(`help.faq.${c.id}.a${n}`, vars) },
    ]),
  }));
}

