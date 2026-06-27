export const SEEDED_POST_CATEGORIES = [
  'applied-algorithms',
  'system-design',
  'engineering-practices',
  'fintech-payments',
  'career',
  'life',
] as const;

export function normalizePostCategory(value: unknown): string {
  if (typeof value !== 'string') return '';

  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function normalizePostTags(value: unknown): string[] {
  const rawTags = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];

  const tags = rawTags
    .map((tag) => String(tag).trim().toLowerCase())
    .map((tag) => tag.replace(/\s+/g, '-'))
    .map((tag) => tag.replace(/[^a-z0-9-]/g, ''))
    .map((tag) => tag.replace(/-+/g, '-').replace(/^-|-$/g, ''))
    .filter(Boolean);

  return Array.from(new Set(tags)).slice(0, 20);
}
