import { createInstance, type i18n as I18nInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import translation files
import enTranslations from '../locales/en/common.json';
import jaTranslations from '../locales/ja/common.json';

const resources = {
  en: {
    common: enTranslations,
  },
  ja: {
    common: jaTranslations,
  },
};

/**
 * Build one i18n instance per provider/render.
 *
 * A module-global instance is shared by concurrent server requests. When an
 * English and Japanese request overlap, each provider can flip that singleton
 * while the other tree is rendering, producing mixed SSR text and React #418
 * during hydration. A request-scoped instance keeps the server render and the
 * client's first render deterministic.
 */
export function createI18nInstance(initialLanguage: 'en' | 'ja'): I18nInstance {
  const instance = createInstance();

  void instance
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources,
      lng: initialLanguage,
      fallbackLng: 'en',
      debug: process.env.NODE_ENV === 'development',
      // All resources are bundled, so initialization can finish synchronously.
      // This matters for SSR and the first hydration render.
      initAsync: false,

      // Default namespace
      defaultNS: 'common',

      // Key separator
      keySeparator: '.',

      // Interpolation options
      interpolation: {
        escapeValue: false, // React already escapes values
      },

      // Language detection options.
      // `cookie` is in `caches` so server components (e.g. /games landing) can
      // read the user's chosen language on first paint via the i18nextLng
      // cookie, avoiding a hydration-time text swap when JA users land on
      // SSR'd pages.
      detection: {
        order: ['cookie', 'localStorage', 'navigator', 'htmlTag'],
        caches: ['cookie', 'localStorage'],
        lookupCookie: 'i18nextLng',
        cookieMinutes: 60 * 24 * 365,
        cookieOptions: {
          path: '/',
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
        },
      },
    });

  return instance;
}
