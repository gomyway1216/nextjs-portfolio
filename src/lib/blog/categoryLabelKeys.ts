// i18n keys for the blog categories that have a curated label. Anything
// else (a category added in the admin later) falls back to title-casing
// the slug so it still reads as a label rather than "system-design".
export const CATEGORY_LABEL_KEYS: Record<string, string> = {
  all: 'blogPage.index.categories.all',
  'applied-algorithms': 'blogPage.index.categories.appliedAlgorithms',
  'system-design': 'blogPage.index.categories.systemDesign',
  'engineering-practices': 'blogPage.index.categories.engineeringPractices',
  'fintech-payments': 'blogPage.index.categories.fintechPayments',
  career: 'blogPage.index.categories.career',
  technology: 'blogPage.index.categories.technology',
  life: 'blogPage.index.categories.life',
};

export const titleCaseCategory = (value: string) =>
  value
    .split('-')
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');

/** Resolve a category slug to its display label with the caller's `t`. */
export function categoryDisplayLabel(
  category: string,
  t: (key: string) => string,
): string {
  const key = CATEGORY_LABEL_KEYS[category];
  return key ? t(key) : titleCaseCategory(category);
}
