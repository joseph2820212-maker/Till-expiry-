import type { ContentBlock, ContentDoc } from '../../../components/DocBlocks';
import { legalVars } from './legalContent';

type T = (key: string, opts?: Record<string, unknown>) => string;

/**
 * Help: the how-to guide and the questions shop owners ask. The structure lives
 * here; every sentence is a locale key (help.*), so the six languages are
 * guaranteed complete by the locale parity test. The texts describe what the app records and reminds;
 * they never say an item is safe and never promise a shelf life.
 */
/** How-to chapters, in the order a new business meets them. */
const GUIDE_CHAPTERS: { id: string; items: number }[] = [
  { id: 'start', items: 6 },
  { id: 'adding', items: 6 },
  { id: 'rules', items: 6 },
  { id: 'today', items: 6 },
  { id: 'labelsPrice', items: 5 },
  { id: 'reports', items: 5 },
  { id: 'reminders', items: 5 },
  { id: 'backup', items: 4 },
  { id: 'support', items: 3 },
];

/** Questions & answers. The family chapter set (shared with the other Till apps) comes first, in its order; TillExpiry's own chapters follow. */
const FAQ_CHAPTERS: { id: string; questions: number }[] = [
  { id: 'gettingStarted', questions: 2 },
  { id: 'dataPrivacy', questions: 2 },
  { id: 'permissions', questions: 1 },
  { id: 'troubleshooting', questions: 2 },
  { id: 'support', questions: 2 },
  { id: 'dates', questions: 3 },
  { id: 'reminders', questions: 2 },
];

export const GUIDE_CHAPTER_IDS = GUIDE_CHAPTERS.map(c => c.id);
export const FAQ_CHAPTER_IDS = FAQ_CHAPTERS.map(c => c.id);

export function getGuideChapters(t: T): ContentDoc[] {
  const vars = legalVars(t);
  return GUIDE_CHAPTERS.map(c => ({
    id: c.id,
    title: t(`help.guide.${c.id}.title`, vars),
    blocks: Array.from({ length: c.items }, (_, i) => ({ k: 'li' as const, t: t(`help.guide.${c.id}.l${i + 1}`, vars) })),
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

