import {
  PUBLIC_MEMORY_CATEGORIES,
  type PublicMemoryCategory,
} from './publicMemory';

export const PRIVATE_MEMORY_SENSITIVITIES = ['normal', 'sensitive', 'restricted'] as const;
export const PRIVATE_MEMORY_VISIBILITIES = ['private', 'publishable'] as const;
export const PRIVATE_MEMORY_KINDS = ['untyped', 'episode', 'current_state', 'lesson'] as const;

export type PrivateMemorySensitivity = typeof PRIVATE_MEMORY_SENSITIVITIES[number];
export type PrivateMemoryVisibility = typeof PRIVATE_MEMORY_VISIBILITIES[number];
export type PrivateMemoryKind = typeof PRIVATE_MEMORY_KINDS[number];

export interface PrivateMemoryIndexItem {
  id: string;
  title: string;
  indexSummary?: string;
  category: PublicMemoryCategory;
  sensitivity: PrivateMemorySensitivity;
  visibility: PrivateMemoryVisibility;
  tags: string[];
  revision: number;
  memoryKind?: PrivateMemoryKind;
  validFrom?: string;
  validTo?: string;
  happenedAt?: string;
  updatedAt: string;
  lastAccessedAt?: string;
}

export interface PrivateMemoryRevision {
  id: string;
  memoryId: string;
  lineageId: string;
  revision: number;
  committedAt: string;
  snapshot: {
    title: string;
    canonicalSummaryJa: string;
    category: PublicMemoryCategory;
    sensitivity: PrivateMemorySensitivity;
    visibility: PrivateMemoryVisibility;
    tags: string[];
    revision: number;
    memoryKind?: PrivateMemoryKind;
    validFrom?: string;
    validTo?: string;
    happenedAt?: string;
    updatedAt: string;
  };
}

const CATEGORY_SET = new Set<string>(PUBLIC_MEMORY_CATEGORIES);
const SENSITIVITY_SET = new Set<string>(PRIVATE_MEMORY_SENSITIVITIES);
const VISIBILITY_SET = new Set<string>(PRIVATE_MEMORY_VISIBILITIES);
const KIND_SET = new Set<string>(PRIVATE_MEMORY_KINDS);
const MAX_INDEX_ITEMS = 1_000;
const MAX_HISTORY_ITEMS = 100;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedString(value: unknown, maximum: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maximum ? normalized : null;
}

function optionalString(value: unknown, maximum: number): string | undefined | null {
  if (value === undefined) return undefined;
  return boundedString(value, maximum);
}

function isoDate(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 64 || Number.isNaN(Date.parse(value))) return null;
  return value;
}

function optionalIsoDate(value: unknown): string | undefined | null {
  if (value === undefined) return undefined;
  return isoDate(value);
}

function positiveRevision(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 ? value : null;
}

function tags(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 20) return null;
  const parsed: string[] = [];
  for (const candidate of value) {
    const tag = boundedString(candidate, 40)?.toLowerCase();
    if (!tag) return null;
    if (!parsed.includes(tag)) parsed.push(tag);
  }
  return parsed;
}

function enumValue<T extends string>(value: unknown, allowed: Set<string>): T | null {
  return typeof value === 'string' && allowed.has(value) ? value as T : null;
}

function optionalKind(value: unknown): PrivateMemoryKind | undefined | null {
  if (value === undefined) return undefined;
  return enumValue<PrivateMemoryKind>(value, KIND_SET);
}

function parseIndexItem(value: unknown): PrivateMemoryIndexItem | null {
  if (!isRecord(value)) return null;
  const id = boundedString(value.id, 128);
  const title = boundedString(value.title, 240);
  const indexSummary = optionalString(value.indexSummary, 320);
  const category = enumValue<PublicMemoryCategory>(value.category, CATEGORY_SET);
  const sensitivity = enumValue<PrivateMemorySensitivity>(value.sensitivity, SENSITIVITY_SET);
  const visibility = enumValue<PrivateMemoryVisibility>(value.visibility, VISIBILITY_SET);
  const parsedTags = tags(value.tags);
  const revision = positiveRevision(value.revision);
  const memoryKind = optionalKind(value.memoryKind);
  const validFrom = optionalIsoDate(value.validFrom);
  const validTo = optionalIsoDate(value.validTo);
  const happenedAt = optionalIsoDate(value.happenedAt);
  const updatedAt = isoDate(value.updatedAt);
  const lastAccessedAt = optionalIsoDate(value.lastAccessedAt);

  if (!id || !title || indexSummary === null || !category || !sensitivity || !visibility ||
    !parsedTags || !revision || memoryKind === null || validFrom === null || validTo === null ||
    happenedAt === null || !updatedAt || lastAccessedAt === null) return null;

  return {
    id,
    title,
    ...(indexSummary ? { indexSummary } : {}),
    category,
    sensitivity,
    visibility,
    tags: parsedTags,
    revision,
    ...(memoryKind ? { memoryKind } : {}),
    ...(validFrom ? { validFrom } : {}),
    ...(validTo ? { validTo } : {}),
    ...(happenedAt ? { happenedAt } : {}),
    updatedAt,
    ...(lastAccessedAt ? { lastAccessedAt } : {}),
  };
}

export function parsePrivateMemoryIndexResponse(value: unknown): PrivateMemoryIndexItem[] {
  if (!isRecord(value) || value.view !== 'index' || !Array.isArray(value.items)) {
    throw new Error('Invalid private memory index response');
  }
  const seen = new Set<string>();
  const parsed: PrivateMemoryIndexItem[] = [];
  for (const candidate of value.items.slice(0, MAX_INDEX_ITEMS)) {
    const item = parseIndexItem(candidate);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    parsed.push(item);
  }
  return parsed;
}

function parseSnapshot(value: unknown): PrivateMemoryRevision['snapshot'] | null {
  if (!isRecord(value)) return null;
  const title = boundedString(value.title, 240);
  const canonicalSummaryJa = boundedString(value.canonicalSummaryJa, 20_000);
  const category = enumValue<PublicMemoryCategory>(value.category, CATEGORY_SET);
  const sensitivity = enumValue<PrivateMemorySensitivity>(value.sensitivity, SENSITIVITY_SET);
  const visibility = enumValue<PrivateMemoryVisibility>(value.visibility, VISIBILITY_SET);
  const parsedTags = tags(value.tags);
  const revision = positiveRevision(value.revision);
  const memoryKind = optionalKind(value.memoryKind);
  const validFrom = optionalIsoDate(value.validFrom);
  const validTo = optionalIsoDate(value.validTo);
  const happenedAt = optionalIsoDate(value.happenedAt);
  const updatedAt = isoDate(value.updatedAt);
  if (!title || !canonicalSummaryJa || !category || !sensitivity || !visibility || !parsedTags ||
    !revision || memoryKind === null || validFrom === null || validTo === null ||
    happenedAt === null || !updatedAt) return null;
  return {
    title,
    canonicalSummaryJa,
    category,
    sensitivity,
    visibility,
    tags: parsedTags,
    revision,
    ...(memoryKind ? { memoryKind } : {}),
    ...(validFrom ? { validFrom } : {}),
    ...(validTo ? { validTo } : {}),
    ...(happenedAt ? { happenedAt } : {}),
    updatedAt,
  };
}

function parseRevision(value: unknown, memoryId: string): PrivateMemoryRevision | null {
  if (!isRecord(value)) return null;
  const id = boundedString(value.id, 180);
  const parsedMemoryId = boundedString(value.memoryId, 128);
  const lineageId = boundedString(value.lineageId, 128);
  const revision = positiveRevision(value.revision);
  const committedAt = isoDate(value.committedAt);
  const snapshot = parseSnapshot(value.snapshot);
  if (!id || parsedMemoryId !== memoryId || !lineageId || !revision || !committedAt || !snapshot) return null;
  return { id, memoryId, lineageId, revision, committedAt, snapshot };
}

export function parsePrivateMemoryHistoryResponse(
  value: unknown,
  expectedMemoryId: string,
): PrivateMemoryRevision[] {
  if (!isRecord(value) || value.view !== 'history' || value.memoryId !== expectedMemoryId ||
    !Array.isArray(value.items)) {
    throw new Error('Invalid private memory history response');
  }
  return value.items
    .slice(0, MAX_HISTORY_ITEMS)
    .map((candidate) => parseRevision(candidate, expectedMemoryId))
    .filter((item): item is PrivateMemoryRevision => item !== null);
}

export function countPrivateMemoryCategories(items: readonly PrivateMemoryIndexItem[]) {
  const counts = new Map<PublicMemoryCategory, number>();
  for (const item of items) counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
  return PUBLIC_MEMORY_CATEGORIES
    .map((category) => ({ category, count: counts.get(category) ?? 0 }))
    .filter(({ count }) => count > 0)
    .sort((left, right) => right.count - left.count || left.category.localeCompare(right.category));
}
