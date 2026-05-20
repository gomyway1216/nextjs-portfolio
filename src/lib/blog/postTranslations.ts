export type PostLanguage = 'en' | 'ja';

export const POST_LANGUAGES: readonly PostLanguage[] = ['en', 'ja'] as const;

export interface Translation {
  title: string;
  body: string;
}

export type PostTranslations = Partial<Record<PostLanguage, Translation>>;

export function isPostLanguage(value: unknown): value is PostLanguage {
  return value === 'en' || value === 'ja';
}

export function normalizeLanguage(value: unknown): PostLanguage {
  return isPostLanguage(value) ? value : 'en';
}

// List the languages that actually have content (non-empty title or body).
export function availableLanguages(translations: PostTranslations): PostLanguage[] {
  return POST_LANGUAGES.filter((lang) => {
    const t = translations[lang];
    return !!t && (!!t.title?.trim() || !!t.body?.trim());
  });
}

// Pick the best translation for the requested locale, falling back to any
// other available language so the post is never hidden when only one
// translation exists. Returns null only when no translations have content.
export function pickTranslation(
  translations: PostTranslations,
  requested: PostLanguage,
): { translation: Translation; language: PostLanguage } | null {
  const available = availableLanguages(translations);
  if (available.length === 0) return null;
  const chosen = available.includes(requested) ? requested : available[0];
  return { translation: translations[chosen]!, language: chosen };
}
