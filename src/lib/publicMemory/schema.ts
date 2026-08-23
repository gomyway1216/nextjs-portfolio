export interface PublicMemoryItem {
  id: string;
  title: string;
  summary: string;
  category: string;
  occurredAt: string;
  tags: string[];
}

export type PublicMemoryResult =
  | { status: 'ready'; items: PublicMemoryItem[] }
  | { status: 'empty'; items: [] }
  | { status: 'unavailable'; items: [] };

const MAX_ITEMS = 200;
const MAX_TAGS = 8;

const LIMITS = {
  id: 120,
  title: 160,
  summary: 600,
  category: 60,
  tag: 40,
} as const;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cleanString(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function firstString(record: UnknownRecord, keys: string[], maxLength: number): string {
  for (const key of keys) {
    const value = cleanString(record[key], maxLength);
    if (value) return value;
  }
  return '';
}

function normalizeDate(value: unknown): string {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .map((tag) => cleanString(tag, LIMITS.tag))
        .filter(Boolean),
    ),
  ).slice(0, MAX_TAGS);
}

function normalizeItem(value: unknown): PublicMemoryItem | null {
  if (!isRecord(value)) return null;

  // The aliases make the public projection resilient to harmless naming
  // differences. Unknown fields are deliberately discarded so a backend
  // regression cannot forward private memory attributes into the page props.
  const id = firstString(value, ['id', 'slug'], LIMITS.id);
  const title = firstString(value, ['title', 'name', 'label'], LIMITS.title);
  const summary = firstString(value, ['summary', 'description', 'excerpt'], LIMITS.summary);
  const category = firstString(value, ['category', 'theme', 'type'], LIMITS.category);
  const occurredAt = normalizeDate(value.occurredAt ?? value.date ?? value.publishedAt);

  if (!id || !title || !summary || !category || !occurredAt) return null;

  return {
    id,
    title,
    summary,
    category,
    occurredAt,
    tags: normalizeTags(value.tags),
  };
}

function findItems(payload: unknown): unknown[] | null {
  if (Array.isArray(payload)) return payload;
  if (!isRecord(payload)) return null;
  if (Array.isArray(payload.items)) return payload.items;

  const data = payload.data;
  return isRecord(data) && Array.isArray(data.items) ? data.items : null;
}

/**
 * Converts an untrusted public API payload into the only fields the browser is
 * allowed to receive. A null return means the envelope itself was invalid;
 * invalid individual rows are omitted.
 */
export function parsePublicMemoryPayload(payload: unknown): PublicMemoryItem[] | null {
  const rawItems = findItems(payload);
  if (!rawItems) return null;

  const seenIds = new Set<string>();
  return rawItems
    .slice(0, MAX_ITEMS)
    .flatMap((item) => {
      const normalized = normalizeItem(item);
      if (!normalized || seenIds.has(normalized.id)) return [];
      seenIds.add(normalized.id);
      return [normalized];
    })
    .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt));
}
