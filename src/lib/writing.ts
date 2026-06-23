// Shared "external published writing" types + helpers, used by both the
// server (app/page.tsx firebase-admin fetch) and the client (service,
// section component, admin panel). Keep this free of firebase imports so it
// is safe in any runtime.

export interface Writing {
  id: string;
  /** Article title as published — stays in the original language. */
  title: string;
  /** Publisher, e.g. "Atlas Engineering". */
  source: string;
  url: string;
  /** Optional ISO date string; shown on the card and used as datePublished. */
  date?: string;
  /** Localized one-line summary. */
  summaryEn: string;
  summaryJa: string;
  /** Hidden entries are kept out of the public section. */
  isPublic: boolean;
  /** Ascending sort order (lower first). */
  order: number;
}

// Fallback shown when the `writing` collection has no documents yet — mirrors
// DEFAULT_SOCIAL_LINKS so the live section never goes blank before the admin
// adds entries. Once any entry exists in Firestore, the data takes over.
export const DEFAULT_WRITINGS: Writing[] = [
  {
    id: 'explainable-states',
    title: 'Why Financial Products Need Explainable States',
    source: 'Atlas Engineering',
    url: 'https://www.atlasfin.com/post/why-financial-products-need-explainable-states',
    summaryEn:
      "Why modeling a financial product's status as explicit, explainable states improves reliability, support, and user trust.",
    summaryJa:
      '金融プロダクトの状態を明示的で説明可能なステートとして設計することが、信頼性・サポート・ユーザーの信頼をどう高めるか。',
    isPublic: true,
    order: 0,
  },
];

/** Pick the summary for the active locale, falling back to the other. */
export function writingSummary(writing: Writing, language: string): string {
  const ja = language.startsWith('ja');
  return (ja ? writing.summaryJa : writing.summaryEn) || writing.summaryEn || writing.summaryJa || '';
}

/**
 * Normalize a raw Firestore document into a Writing. Handles both Admin-SDK
 * Timestamps (server) and ISO strings (API responses) for `date`.
 */
export function parseWritingDoc(id: string, data: Record<string, unknown>): Writing {
  const rawDate = data.date as { toDate?: () => Date } | string | undefined;
  let date: string | undefined;
  if (rawDate && typeof rawDate === 'object' && typeof rawDate.toDate === 'function') {
    date = rawDate.toDate().toISOString();
  } else if (typeof rawDate === 'string' && rawDate) {
    date = rawDate;
  }

  return {
    id,
    title: typeof data.title === 'string' ? data.title : '',
    source: typeof data.source === 'string' ? data.source : '',
    url: typeof data.url === 'string' ? data.url : '',
    date,
    summaryEn: typeof data.summaryEn === 'string' ? data.summaryEn : '',
    summaryJa: typeof data.summaryJa === 'string' ? data.summaryJa : '',
    // Default-visible: only an explicit `false` hides an entry.
    isPublic: data.isPublic !== false,
    order: typeof data.order === 'number' ? data.order : 0,
  };
}

/** Public, ordered view used by the home section. */
export function publicWritings(writings: Writing[]): Writing[] {
  return writings
    .filter((w) => w.isPublic)
    .sort((a, b) => a.order - b.order);
}

/**
 * Parse an incoming date value to a valid Date, or null. Guards against
 * `new Date('garbage')` (Invalid Date), which the Firestore Admin SDK would
 * reject with a serialization error on write.
 */
export function toWritingDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * A url safe to render as a public `<a href>` — only http(s), never
 * `javascript:`/`data:`. Mirrors the intent of isValidSocialLink.
 */
export function isSafeHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const { protocol } = new URL(value);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}
