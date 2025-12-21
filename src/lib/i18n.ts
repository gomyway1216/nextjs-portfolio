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

// Get the initial language from localStorage to prevent flashing
const getInitialLanguage = () => {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('i18nextLng');
    if (stored && (stored === 'en' || stored === 'ja')) {
      return stored;
    }
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

    // Language detection options
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
    },
  });

export default i18n;
