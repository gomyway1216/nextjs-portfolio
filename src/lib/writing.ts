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

// Built-in entries shown before/alongside Firestore data, so the live section
// never goes blank before the admin adds entries. Firestore entries with the
// same URL override these defaults through mergeDefaultWritings().
export const DEFAULT_WRITINGS: Writing[] = [
  {
    id: 'fast-secure-support',
    title: 'Building Fast, Secure Support in Credit-Building Fintech Products',
    source: 'Atlas Engineering',
    url: 'https://www.atlasfin.com/post/building-fast-secure-support-credit-building',
    date: '2026-06-25',
    summaryEn:
      'How short-lived, support-scoped tokens help WebView support flows stay fast while keeping access narrow, temporary, and recoverable.',
    summaryJa:
      '短時間だけ有効なサポート用トークンで、WebView上のサポート体験を速く保ちながら、アクセス範囲を狭く一時的に保つ設計について。',
    isPublic: true,
    order: 0,
  },
  {
    id: 'fintech-internal-tools',
    title: 'Why Fintech Internal Tools Must Be Treated as Risk Systems',
    source: 'Atlas Engineering',
    url: 'https://www.atlasfin.com/post/fintech-internal-tools-risk-systems',
    date: '2026-06-23',
    summaryEn:
      'Why internal fintech tools need the same rigor as risk systems: least privilege, approvals, audit trails, request IDs, and reversible operations.',
    summaryJa:
      '社内向けフィンテックツールにも、最小権限、承認、監査ログ、リクエストID、巻き戻せる操作といったリスクシステム並みの設計が必要な理由。',
    isPublic: true,
    order: 1,
  },
  {
    id: 'explainable-states',
    title: 'Why Financial Products Need Explainable States',
    source: 'Atlas Engineering',
    url: 'https://www.atlasfin.com/post/why-financial-products-need-explainable-states',
    date: '2026-06-25',
    summaryEn:
      "Why modeling a financial product's status as explicit, explainable states improves reliability, support, and user trust.",
    summaryJa:
      '金融プロダクトの状態を明示的で説明可能なステートとして設計することが、信頼性・サポート・ユーザーの信頼をどう高めるか。',
    isPublic: true,
    order: 2,
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
 * Keep the authored Atlas articles visible even before/alongside Firestore
 * entries. Firestore wins for matching URLs, so admins can override copy,
 * order, or hide a built-in entry by saving a document with the same URL.
 */
export function mergeDefaultWritings(writings: Writing[] | null): Writing[] {
  if (writings === null) return publicWritings(DEFAULT_WRITINGS);

  const byUrlOrId = new Map<string, Writing>();
  const keyFor = (writing: Writing) => (writing.url ? writing.url.replace(/\/+$/, '') : writing.id);

  DEFAULT_WRITINGS.forEach((writing) => byUrlOrId.set(keyFor(writing), writing));
  writings.forEach((writing) => byUrlOrId.set(keyFor(writing), writing));

  return publicWritings(Array.from(byUrlOrId.values()));
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
