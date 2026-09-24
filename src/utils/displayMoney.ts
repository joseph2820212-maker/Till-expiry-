/** Money on screen and in exports: the exact formatter with the current app language (never a float). */
import i18n from '../i18n';
import { formatMoney } from '../domain/formatMoney';
import type { LanguageCode } from '../domain/types';
import type { Money } from '../domain/money';

const LANGS: LanguageCode[] = ['en', 'ar', 'tr', 'fr', 'es', 'de'];

export function appLanguageCode(): LanguageCode {
  const l = String(i18n.language || 'en').slice(0, 2) as LanguageCode;
  return LANGS.includes(l) ? l : 'en';
}

export function displayMoney(m: Money | undefined | null): string {
  if (!m) return '';
  try { return formatMoney(m.minor, m.currency, appLanguageCode()); } catch { return ''; }
}
