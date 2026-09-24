// i18n.ts — offline i18next configuration
// All translation resources are bundled; no HTTP backend, no network calls.
// Financial/bookkeeping terms in ar.json and tr.json are machine-translated
// and must be human-reviewed before public release.

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DevSettings, I18nManager } from 'react-native';
import { reloadAppAsync } from 'expo';

import en from './locales/en.json';
import ar from './locales/ar.json';
import tr from './locales/tr.json';
import fr from './locales/fr.json';
import es from './locales/es.json';
import de from './locales/de.json';

export type AppLanguage = 'en' | 'ar' | 'tr' | 'fr' | 'es' | 'de';
export const SUPPORTED_LANGUAGES: AppLanguage[] = ['en', 'ar', 'tr', 'fr', 'es', 'de'];
const LANGUAGE_KEY = 'app:language';
const LANGUAGE_TRANSITION_KEY = 'app:languageTransition';
const RELOAD_TIMEOUT_MS = 8_000;

export type LanguageTransitionState = {
  previous: AppLanguage;
  target: AppLanguage;
  reloadAttempts: number;
  startedAtIso: string;
};

export type LanguageStartupResult = {
  status: 'ready';
  notice?: 'transitionRolledBack' | 'stateRecovered';
};

export type LanguageChangeResult = {
  reloaded: boolean;
  rolledBack: boolean;
};

function detectDeviceLanguage(): AppLanguage {
  try {
    const locales = getLocales();
    const tag = locales[0]?.languageTag ?? '';
    const code = tag.split('-')[0].toLowerCase() as AppLanguage;
    if (SUPPORTED_LANGUAGES.includes(code)) return code;
  } catch {}
  return 'en';
}

export async function loadSavedLanguage(): Promise<AppLanguage> {
  try {
    return await loadSavedLanguageStrict();
  } catch {}
  return detectDeviceLanguage();
}

async function loadSavedLanguageStrict(): Promise<AppLanguage> {
  const saved = await AsyncStorage.getItem(LANGUAGE_KEY);
  if (saved && SUPPORTED_LANGUAGES.includes(saved as AppLanguage)) return saved as AppLanguage;
  return detectDeviceLanguage();
}

export async function saveLanguage(lang: AppLanguage): Promise<void> {
  await AsyncStorage.setItem(LANGUAGE_KEY, lang);
}

async function readTransition(): Promise<LanguageTransitionState | null> {
  const raw = await AsyncStorage.getItem(LANGUAGE_TRANSITION_KEY);
  if (!raw) return null;
  const value = JSON.parse(raw) as Partial<LanguageTransitionState>;
  if (
    !SUPPORTED_LANGUAGES.includes(value.previous as AppLanguage)
    || !SUPPORTED_LANGUAGES.includes(value.target as AppLanguage)
    || !Number.isInteger(value.reloadAttempts)
    || typeof value.startedAtIso !== 'string'
  ) {
    throw new Error('Invalid language transition state.');
  }
  return value as LanguageTransitionState;
}

async function writeLanguageAndTransition(
  language: AppLanguage,
  transition: LanguageTransitionState,
): Promise<void> {
  await AsyncStorage.multiSet([
    [LANGUAGE_KEY, language],
    [LANGUAGE_TRANSITION_KEY, JSON.stringify(transition)],
  ]);
}

// forceRTL changes native state, but a full app reload is required before
// direction-sensitive module constants and styles are rebuilt.
async function reloadApp(): Promise<boolean> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race<boolean>([
      reloadAppAsync('TillExpiry language direction changed').then(() => true),
      new Promise(resolve => { timeout = setTimeout(() => resolve(false), RELOAD_TIMEOUT_MS); }),
    ]);
    if (result) return true;
  } catch {
    // Dev clients without the native Expo reload hook fall through below.
  } finally {
    if (timeout) clearTimeout(timeout);
  }
  if (__DEV__ && typeof DevSettings?.reload === 'function') {
    DevSettings.reload();
    return true;
  }
  return false;
}

async function restorePreviousLanguage(transition: LanguageTransitionState): Promise<void> {
  await AsyncStorage.setItem(LANGUAGE_KEY, transition.previous);
  await i18n.changeLanguage(transition.previous);
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(transition.previous === 'ar');
  await AsyncStorage.removeItem(LANGUAGE_TRANSITION_KEY);
}

async function recoverToCurrentDirection(): Promise<AppLanguage> {
  const fallback: AppLanguage = I18nManager.isRTL ? 'ar' : 'en';
  await AsyncStorage.setItem(LANGUAGE_KEY, fallback).catch(() => undefined);
  await AsyncStorage.removeItem(LANGUAGE_TRANSITION_KEY).catch(() => undefined);
  await i18n.changeLanguage(fallback);
  return fallback;
}

async function changeLanguageOnce(lang: AppLanguage): Promise<LanguageChangeResult> {
  const pending = await readTransition();
  if (pending && I18nManager.isRTL !== (pending.target === 'ar')) {
    if (lang === pending.target) {
      return { reloaded: true, rolledBack: false };
    }
    if (I18nManager.isRTL === (lang === 'ar')) {
      await AsyncStorage.setItem(LANGUAGE_KEY, lang);
      await i18n.changeLanguage(lang);
      await AsyncStorage.removeItem(LANGUAGE_TRANSITION_KEY);
      return { reloaded: false, rolledBack: false };
    }
  } else if (pending) {
    await AsyncStorage.removeItem(LANGUAGE_TRANSITION_KEY);
  }

  const previous = pending?.previous ?? await loadSavedLanguageStrict();
  const shouldUseRTL = lang === 'ar';
  const directionChanges = I18nManager.isRTL !== shouldUseRTL;
  const transition: LanguageTransitionState = {
    previous,
    target: lang,
    reloadAttempts: directionChanges ? 1 : 0,
    startedAtIso: new Date().toISOString(),
  };

  // Persist the complete transition before changing live language or native
  // direction. A failed write therefore leaves the running app untouched.
  await writeLanguageAndTransition(lang, transition);
  await i18n.changeLanguage(lang);

  if (!directionChanges) {
    await AsyncStorage.removeItem(LANGUAGE_TRANSITION_KEY);
    return { reloaded: false, rolledBack: false };
  }

  // allowRTL MUST be asserted before forceRTL or forceRTL can be a silent no-op.
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(shouldUseRTL);
  // If the native app reload cannot start, restore the last known-good language
  // immediately. The user stays in a working layout and receives a localized
  // notice instead of being left in a half-applied transition.
  const reloaded = await reloadApp();
  if (reloaded) return { reloaded: true, rolledBack: false };
  await restorePreviousLanguage(transition);
  return { reloaded: false, rolledBack: true };
}

let languageChangeQueue: Promise<void> = Promise.resolve();
const queuedLanguageChanges = new Map<AppLanguage, Promise<LanguageChangeResult>>();

export function changeLanguage(lang: AppLanguage): Promise<LanguageChangeResult> {
  const queued = queuedLanguageChanges.get(lang);
  if (queued) return queued;

  const core = languageChangeQueue.then(() => changeLanguageOnce(lang));
  let operation: Promise<LanguageChangeResult>;
  operation = core.then(
    result => {
      if (queuedLanguageChanges.get(lang) === operation) queuedLanguageChanges.delete(lang);
      return result;
    },
    error => {
      if (queuedLanguageChanges.get(lang) === operation) queuedLanguageChanges.delete(lang);
      throw error;
    },
  );
  languageChangeQueue = operation.then(() => undefined, () => undefined);
  queuedLanguageChanges.set(lang, operation);
  return operation;
}

export async function initializeLanguage(): Promise<LanguageStartupResult> {
  try {
    const [language, transition] = await Promise.all([loadSavedLanguageStrict(), readTransition()]);
    await i18n.changeLanguage(language);
    const desiredRTL = language === 'ar';

    if (I18nManager.isRTL === desiredRTL) {
      if (transition) await AsyncStorage.removeItem(LANGUAGE_TRANSITION_KEY);
      return { status: 'ready' };
    }

    // A completed reload that did not apply its target direction is rolled back
    // automatically. Since Arabic is the only RTL language, the current native
    // direction is the previous transition's known-good direction.
    if (transition && transition.reloadAttempts >= 1) {
      if (transition.previous !== transition.target) {
        await restorePreviousLanguage(transition);
        return { status: 'ready', notice: 'transitionRolledBack' };
      }
      await recoverToCurrentDirection();
      return { status: 'ready', notice: 'stateRecovered' };
    }

    const next: LanguageTransitionState = transition ?? {
      previous: language,
      target: language,
      reloadAttempts: 0,
      startedAtIso: new Date().toISOString(),
    };
    next.reloadAttempts += 1;
    await writeLanguageAndTransition(language, next);
    I18nManager.allowRTL(true);
    I18nManager.forceRTL(desiredRTL);
    const reloaded = await reloadApp();
    if (reloaded) return { status: 'ready' };
    if (next.previous !== next.target) {
      await restorePreviousLanguage(next);
      return { status: 'ready', notice: 'transitionRolledBack' };
    }
    await recoverToCurrentDirection();
    return { status: 'ready', notice: 'stateRecovered' };
  } catch {
    await recoverToCurrentDirection();
    return { status: 'ready', notice: 'stateRecovered' };
  }
}

export async function retryLanguageTransition(): Promise<boolean> {
  const language = await loadSavedLanguageStrict();
  const prior = await readTransition();
  const next: LanguageTransitionState = prior ?? {
    previous: language,
    target: language,
    reloadAttempts: 0,
    startedAtIso: new Date().toISOString(),
  };
  next.reloadAttempts += 1;
  await writeLanguageAndTransition(language, next);
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(language === 'ar');
  return reloadApp();
}

export async function rollbackLanguageTransition(): Promise<boolean> {
  const transition = await readTransition();
  if (!transition || transition.previous === transition.target) return false;
  await restorePreviousLanguage(transition);
  return true;
}

// Initialise i18next synchronously with English as default.
// The saved/device language is applied asynchronously in App.tsx after
// AsyncStorage is read — this keeps startup fast.
i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ar: { translation: ar },
      tr: { translation: tr },
      fr: { translation: fr },
      es: { translation: es },
      de: { translation: de },
    },
    lng: 'en',
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
    compatibilityJSON: 'v4',
  });

export default i18n;
