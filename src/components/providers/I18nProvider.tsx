'use client';

import { useEffect, useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import { createI18nInstance } from '@/lib/i18n';

interface I18nProviderProps {
  children: React.ReactNode;
  /**
   * Language detected on the server (read from the i18nextLng cookie in
   * `app/layout.tsx`). Used to create a request-scoped i18n instance
   * so that the very first SSR pass of client components uses the same
   * locale as the eventual client-side render. Without this, the server
   * always picks 'en' (no document/window during SSR) while the client
   * picks whatever the cookie says — every t() call produces a text
   * hydration mismatch for JA visitors.
   */
  initialLang?: 'en' | 'ja';
}

export function I18nProvider({ children, initialLang }: I18nProviderProps) {
  const language = initialLang ?? 'en';
  const [i18n] = useState(() => createI18nInstance(language));

  useEffect(() => {
    const syncDocumentLanguage = (nextLanguage: string) => {
      document.documentElement.lang = nextLanguage.startsWith('ja') ? 'ja' : 'en';
    };

    syncDocumentLanguage(i18n.language);
    i18n.on('languageChanged', syncDocumentLanguage);
    return () => {
      i18n.off('languageChanged', syncDocumentLanguage);
    };
  }, [i18n]);

  return (
    <I18nextProvider i18n={i18n}>
      {children}
    </I18nextProvider>
  );
}
