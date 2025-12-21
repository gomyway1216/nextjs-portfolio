// Anime/Hobby Search and Sort Utilities

import type { HobbyItem } from '@/types/hobby';

// ============================================================================
// SORT TYPES
// ============================================================================

export type SortType =
  | 'alphabetical'      // English name A-Z
  | 'alphabetical-desc' // English name Z-A
  | 'gojuon'           // Japanese 五十音順 (using nameKana)
  | 'gojuon-desc'      // Reverse 五十音順
  | 'score-desc'       // Score high to low
  | 'score-asc'        // Score low to high
  | 'updated-desc'     // Recently updated first
  | 'updated-asc';     // Oldest updated first

// ============================================================================
// SORT FUNCTIONS
// ============================================================================

/**
 * Get the value of a custom field from an item
 */
function getCustomFieldValue(item: HobbyItem, fieldName: string): unknown {
  return item.customFields[fieldName];
}

/**
 * Sort by English name (alphabetical)
 */
export function sortByAlphabetical(items: HobbyItem[], order: 'asc' | 'desc' = 'asc'): HobbyItem[] {
  return [...items].sort((a, b) => {
    const nameA = (getCustomFieldValue(a, 'nameEnglish') as string || a.title).toLowerCase();
    const nameB = (getCustomFieldValue(b, 'nameEnglish') as string || b.title).toLowerCase();
    const comparison = nameA.localeCompare(nameB);
    return order === 'asc' ? comparison : -comparison;
  });
}

/**
 * Sort by Japanese 五十音順 (using nameKana field)
 */
export function sortByGojuon(items: HobbyItem[], order: 'asc' | 'desc' = 'asc'): HobbyItem[] {
  return [...items].sort((a, b) => {
    const kanaA = (getCustomFieldValue(a, 'nameKana') as string || '').toLowerCase();
    const kanaB = (getCustomFieldValue(b, 'nameKana') as string || '').toLowerCase();
    // Use localeCompare with Japanese locale for proper 五十音 ordering
    const comparison = kanaA.localeCompare(kanaB, 'ja');
    return order === 'asc' ? comparison : -comparison;
  });
}

/**
 * Sort by score
 */
export function sortByScore(items: HobbyItem[], order: 'asc' | 'desc' = 'desc'): HobbyItem[] {
  return [...items].sort((a, b) => {
    const scoreA = (getCustomFieldValue(a, 'score') as number) || 0;
    const scoreB = (getCustomFieldValue(b, 'score') as number) || 0;
    return order === 'desc' ? scoreB - scoreA : scoreA - scoreB;
  });
}

/**
 * Sort by updated date
 */
export function sortByUpdated(items: HobbyItem[], order: 'asc' | 'desc' = 'desc'): HobbyItem[] {
  return [...items].sort((a, b) => {
    const dateA = new Date(a.updatedAt).getTime();
    const dateB = new Date(b.updatedAt).getTime();
    return order === 'desc' ? dateB - dateA : dateA - dateB;
  });
}

/**
 * Main sort function that handles all sort types
 */
export function sortItems(items: HobbyItem[], sortType: SortType): HobbyItem[] {
  switch (sortType) {
    case 'alphabetical':
      return sortByAlphabetical(items, 'asc');
    case 'alphabetical-desc':
      return sortByAlphabetical(items, 'desc');
    case 'gojuon':
      return sortByGojuon(items, 'asc');
    case 'gojuon-desc':
      return sortByGojuon(items, 'desc');
    case 'score-desc':
      return sortByScore(items, 'desc');
    case 'score-asc':
      return sortByScore(items, 'asc');
    case 'updated-desc':
      return sortByUpdated(items, 'desc');
    case 'updated-asc':
      return sortByUpdated(items, 'asc');
    default:
      return items;
  }
}

// ============================================================================
// SEARCH FUNCTIONS
// ============================================================================

/**
 * Check if a string contains Japanese characters
 */
function containsJapanese(str: string): boolean {
  // Hiragana: \u3040-\u309f
  // Katakana: \u30a0-\u30ff
  // Kanji: \u4e00-\u9faf
  return /[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/.test(str);
}

/**
 * Filter items by search query
 * Supports Japanese (searches nameKanji, nameKana) and English (searches nameEnglish, title)
 */
export function filterItems(items: HobbyItem[], query: string): HobbyItem[] {
  if (!query || query.trim() === '') {
    return items;
  }

  const normalizedQuery = query.toLowerCase().trim();
  const isJapaneseQuery = containsJapanese(normalizedQuery);

  return items.filter((item) => {
    // Always check title
    if (item.title.toLowerCase().includes(normalizedQuery)) {
      return true;
    }

    // Check description
    if (item.description?.toLowerCase().includes(normalizedQuery)) {
      return true;
    }

    // Check tags
    if (item.tags.some(tag => tag.toLowerCase().includes(normalizedQuery))) {
      return true;
    }

    // Check custom fields based on query language
    const nameKanji = (getCustomFieldValue(item, 'nameKanji') as string || '').toLowerCase();
    const nameKana = (getCustomFieldValue(item, 'nameKana') as string || '').toLowerCase();
    const nameEnglish = (getCustomFieldValue(item, 'nameEnglish') as string || '').toLowerCase();

    if (isJapaneseQuery) {
      // For Japanese queries, search in Japanese fields
      return nameKanji.includes(normalizedQuery) || nameKana.includes(normalizedQuery);
    } else {
      // For non-Japanese queries, search in English and also in kana (for romanized input)
      return nameEnglish.includes(normalizedQuery) || nameKana.includes(normalizedQuery);
    }
  });
}

// ============================================================================
// FILTER FUNCTIONS
// ============================================================================

/**
 * Filter items by minimum score
 */
export function filterByMinScore(items: HobbyItem[], minScore: number): HobbyItem[] {
  return items.filter((item) => {
    const score = (getCustomFieldValue(item, 'score') as number) || 0;
    return score >= minScore;
  });
}

/**
 * Filter items by tags
 */
export function filterByTags(items: HobbyItem[], tags: string[]): HobbyItem[] {
  if (tags.length === 0) return items;
  return items.filter((item) => {
    return tags.some(tag => item.tags.includes(tag));
  });
}

// ============================================================================
// COMBINED UTILITIES
// ============================================================================

export interface FilterSortOptions {
  searchQuery?: string;
  sortType?: SortType;
  minScore?: number;
  tags?: string[];
}

/**
 * Apply all filters and sorting to items
 */
export function applyFiltersAndSort(
  items: HobbyItem[],
  options: FilterSortOptions
): HobbyItem[] {
  let result = [...items];

  // Apply search filter
  if (options.searchQuery) {
    result = filterItems(result, options.searchQuery);
  }

  // Apply score filter
  if (options.minScore !== undefined && options.minScore > 0) {
    result = filterByMinScore(result, options.minScore);
  }

  // Apply tag filter
  if (options.tags && options.tags.length > 0) {
    result = filterByTags(result, options.tags);
  }

  // Apply sorting
  if (options.sortType) {
    result = sortItems(result, options.sortType);
  }

  return result;
}

// ============================================================================
// SORT OPTION LABELS
// ============================================================================

export const SORT_OPTIONS: { value: SortType; label: string; labelJa: string }[] = [
  { value: 'alphabetical', label: 'A-Z', labelJa: 'アルファベット順' },
  { value: 'alphabetical-desc', label: 'Z-A', labelJa: 'アルファベット逆順' },
  { value: 'gojuon', label: 'あ-ん', labelJa: '五十音順' },
  { value: 'gojuon-desc', label: 'ん-あ', labelJa: '五十音逆順' },
  { value: 'score-desc', label: 'Score: High to Low', labelJa: 'スコア: 高→低' },
  { value: 'score-asc', label: 'Score: Low to High', labelJa: 'スコア: 低→高' },
  { value: 'updated-desc', label: 'Recently Updated', labelJa: '更新日: 新しい順' },
  { value: 'updated-asc', label: 'Oldest Updated', labelJa: '更新日: 古い順' },
];
