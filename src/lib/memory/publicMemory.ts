export const PUBLIC_MEMORY_CATEGORIES = [
  'profile',
  'strength',
  'preference',
  'goal',
  'challenge',
  'achievement',
  'relationship',
  'career',
  'health',
  'finance',
  'journal',
  'other',
] as const;

export type PublicMemoryCategory = typeof PUBLIC_MEMORY_CATEGORIES[number];

export interface PublicMemoryItem {
  id: string;
  title: string;
  summary: string;
  category: PublicMemoryCategory;
  tags: string[];
  occurredAt?: string;
}

export interface PublicMemoryConnection {
  sourceId: string;
  targetId: string;
  sharedTags: string[];
}

export interface PublicMemoryCategoryCount {
  category: PublicMemoryCategory;
  count: number;
}

const CATEGORY_SET = new Set<string>(PUBLIC_MEMORY_CATEGORIES);
const MAX_PUBLIC_ITEMS = 100;
const MAX_ID_LENGTH = 128;
const MAX_TITLE_LENGTH = 160;
const MAX_SUMMARY_LENGTH = 2_000;
const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 40;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

function parseTags(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_TAGS) return null;

  const tags: string[] = [];
  for (const valueTag of value) {
    const tag = boundedString(valueTag, MAX_TAG_LENGTH)?.toLowerCase();
    if (!tag) return null;
    if (!tags.includes(tag)) tags.push(tag);
  }
  return tags;
}

function parseOccurredAt(value: unknown): string | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > 64 || Number.isNaN(Date.parse(value))) return null;
  return value;
}

function parsePublicMemoryItem(value: unknown): PublicMemoryItem | null {
  if (!isRecord(value)) return null;

  const id = boundedString(value.id, MAX_ID_LENGTH);
  const title = boundedString(value.title, MAX_TITLE_LENGTH);
  const summary = boundedString(value.summary, MAX_SUMMARY_LENGTH);
  const tags = parseTags(value.tags);
  const occurredAt = parseOccurredAt(value.occurredAt);

  if (!id || !title || !summary || tags === null || occurredAt === null) return null;
  if (typeof value.category !== 'string' || !CATEGORY_SET.has(value.category)) return null;

  return {
    id,
    title,
    summary,
    category: value.category as PublicMemoryCategory,
    tags,
    ...(occurredAt ? { occurredAt } : {}),
  };
}

/**
 * Reduces an untrusted API response to the explicit public projection contract.
 * Unknown fields are intentionally discarded so an upstream regression cannot
 * leak private memory fields into React server-component payloads.
 */
export function parsePublicMemoryResponse(value: unknown): PublicMemoryItem[] {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    throw new Error('Invalid public memory response');
  }

  const seenIds = new Set<string>();
  const parsed: PublicMemoryItem[] = [];
  for (const candidate of value.items.slice(0, MAX_PUBLIC_ITEMS)) {
    const item = parsePublicMemoryItem(candidate);
    if (!item || seenIds.has(item.id)) continue;
    seenIds.add(item.id);
    parsed.push(item);
  }
  return parsed;
}

export function sortPublicMemories(items: readonly PublicMemoryItem[]): PublicMemoryItem[] {
  return [...items].sort((left, right) => {
    if (!left.occurredAt && !right.occurredAt) return left.title.localeCompare(right.title);
    if (!left.occurredAt) return 1;
    if (!right.occurredAt) return -1;
    const dateDifference = Date.parse(right.occurredAt) - Date.parse(left.occurredAt);
    return dateDifference || left.title.localeCompare(right.title);
  });
}

export function countPublicMemoryCategories(
  items: readonly PublicMemoryItem[],
): PublicMemoryCategoryCount[] {
  const counts = new Map<PublicMemoryCategory, number>();
  for (const item of items) counts.set(item.category, (counts.get(item.category) ?? 0) + 1);

  return PUBLIC_MEMORY_CATEGORIES
    .map((category) => ({ category, count: counts.get(category) ?? 0 }))
    .filter(({ count }) => count > 0)
    .sort((left, right) => right.count - left.count || left.category.localeCompare(right.category));
}

export function buildPublicMemoryConnections(
  items: readonly PublicMemoryItem[],
): PublicMemoryConnection[] {
  const connections: PublicMemoryConnection[] = [];

  for (let sourceIndex = 0; sourceIndex < items.length; sourceIndex += 1) {
    const source = items[sourceIndex];
    const sourceTags = new Set(source.tags);
    if (sourceTags.size === 0) continue;

    for (let targetIndex = sourceIndex + 1; targetIndex < items.length; targetIndex += 1) {
      const target = items[targetIndex];
      const sharedTags = target.tags.filter((tag) => sourceTags.has(tag));
      if (sharedTags.length === 0) continue;
      connections.push({ sourceId: source.id, targetId: target.id, sharedTags });
    }
  }

  return connections.sort((left, right) =>
    right.sharedTags.length - left.sharedTags.length ||
    left.sourceId.localeCompare(right.sourceId) ||
    left.targetId.localeCompare(right.targetId));
}
