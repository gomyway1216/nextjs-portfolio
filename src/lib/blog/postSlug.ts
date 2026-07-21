import type { PostTranslations } from './postTranslations';

// URL slug derived from a title: lowercase ASCII words joined by hyphens.
// Diacritics are folded, everything else collapses to a single hyphen.
export function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

// Slug for a post. Derived from the English title only, so the URL is
// stable regardless of the viewer's language; posts without a usable
// English title (e.g. Japanese-only) keep their Firestore id as the slug.
export function postSlug(translations: PostTranslations | undefined, id: string): string {
  const title = translations?.en?.title?.trim() || '';
  return slugifyTitle(title) || id;
}
