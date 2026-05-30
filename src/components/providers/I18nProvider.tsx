'use client';

import { useEffect } from 'react';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/lib/i18n';

interface I18nProviderProps {
  children: React.ReactNode;
  /**
   * Language detected on the server (read from the i18nextLng cookie in
   * `app/layout.tsx`). Synchronously applied to the shared i18n instance
   * so that the very first SSR pass of client components uses the same
   * locale as the eventual client-side render. Without this, the server
   * always picks 'en' (no document/window during SSR) while the client
   * picks whatever the cookie says — every t() call produces a text
   * hydration mismatch for JA visitors.
   */
  initialLang?: 'en' | 'ja';
}

export function I18nProvider({ children, initialLang }: I18nProviderProps) {
  // Apply the server-detected language *during render* (not in useEffect)
  // so SliderAnimation and other client components see the right locale
  // on their first SSR + first client render. We intentionally accept the
  // small risk that a long-running render could be interrupted by another
  // request flipping the global language — for a portfolio site this race
  // window is tiny, and the alternative (per-request i18n instance) is a
  // much larger refactor.
  if (initialLang && i18n.language !== initialLang) {
    i18n.changeLanguage(initialLang);
  }

  useEffect(() => {
    if (!i18n.isInitialized) {
      i18n.init();
    }
  }, []);

  return (
    <I18nextProvider i18n={i18n}>
      {children}
    </I18nextProvider>
  );
}
