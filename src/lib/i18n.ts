import i18n from 'i18next';
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

// Get the initial language from the i18nextLng cookie (set by either
// the server or the detector below) or localStorage. Checking the
// cookie first matches what server components see, so SSR and client
// agree on the initial render.
const getInitialLanguage = (): 'en' | 'ja' => {
  if (typeof document !== 'undefined') {
    const match = document.cookie.match(/(?:^|;\s*)i18nextLng=([^;]+)/);
    const cookieLang = match?.[1];
    if (cookieLang === 'en' || cookieLang === 'ja') return cookieLang;
  }
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('i18nextLng');
    if (stored === 'en' || stored === 'ja') return stored;
  }
  return 'en';
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    lng: getInitialLanguage(),
    fallbackLng: 'en',
    debug: process.env.NODE_ENV === 'development',

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

// Keep <html lang> in sync after client-side language switches; the server
// only sets it for the initial document, so without this a JA session keeps
// lang="en" (wrong signal for screen readers, translators, and crawlers).
if (typeof document !== 'undefined') {
  i18n.on('languageChanged', (lng) => {
    document.documentElement.lang = lng;
  });
}

export default i18n;
