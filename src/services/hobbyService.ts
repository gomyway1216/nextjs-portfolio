import { auth } from '@/lib/firebaseConnect';
import type {
  HobbyCategory,
  HobbyItem,
  CreateHobbyCategoryInput,
  UpdateHobbyCategoryInput,
  CreateHobbyItemInput,
  UpdateHobbyItemInput,
  HobbyCategoriesResponse,
  HobbyItemsResponse,
} from '@/types/hobby';

const BASE_URL = '/api/hobbies';

// Helper to get auth headers (returns empty object if not logged in)
async function getAuthHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) return {};
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

// Helper for API calls
async function apiCall<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = await getAuthHeaders();

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
      ...options.headers,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'API request failed');
  }

  return data;
}

// ============================================================================
// HOBBY CATEGORIES
// ============================================================================

export async function getHobbyCategories(
  includePrivate = false
): Promise<HobbyCategoriesResponse> {
  const url = new URL(BASE_URL, window.location.origin);
  if (includePrivate) {
    url.searchParams.set('includePrivate', 'true');
  }
  return apiCall<HobbyCategoriesResponse>(url.toString());
}

export async function getHobbyCategory(hobbyId: string): Promise<HobbyCategory> {
  return apiCall<HobbyCategory>(`${BASE_URL}/${hobbyId}`);
}

export async function getHobbyCategoryBySlug(slug: string): Promise<HobbyCategory | null> {
  const { categories } = await getHobbyCategories(true);
  return categories.find((c) => c.slug === slug) || null;
}

export async function createHobbyCategory(
  input: CreateHobbyCategoryInput
): Promise<{ id: string; message: string }> {
  return apiCall<{ id: string; message: string }>(BASE_URL, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateHobbyCategory(
  hobbyId: string,
  input: UpdateHobbyCategoryInput
): Promise<void> {
  await apiCall(`${BASE_URL}/${hobbyId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export async function deleteHobbyCategory(hobbyId: string): Promise<void> {
  await apiCall(`${BASE_URL}/${hobbyId}`, {
    method: 'DELETE',
  });
}

// ============================================================================
// HOBBY ITEMS
// ============================================================================

export async function getHobbyItems(
  hobbyId: string,
  options: {
    includePrivate?: boolean;
    limit?: number;
    lastId?: string;
    sortType?: string;
    search?: string;
  } = {}
): Promise<HobbyItemsResponse> {
  const url = new URL(`${BASE_URL}/items`, window.location.origin);
  url.searchParams.set('hobbyId', hobbyId);

  if (options.includePrivate) {
    url.searchParams.set('includePrivate', 'true');
  }
  if (options.limit) {
    url.searchParams.set('limit', options.limit.toString());
  }
  if (options.lastId) {
    url.searchParams.set('lastId', options.lastId);
  }
  if (options.sortType) {
    url.searchParams.set('sortType', options.sortType);
  }
  if (options.search) {
    url.searchParams.set('search', options.search);
  }

  return apiCall<HobbyItemsResponse>(url.toString());
}

export async function getHobbyItem(itemId: string): Promise<HobbyItem> {
  return apiCall<HobbyItem>(`${BASE_URL}/items/${itemId}`);
}

export async function createHobbyItem(
  input: CreateHobbyItemInput
): Promise<{ id: string; message: string }> {
  return apiCall<{ id: string; message: string }>(`${BASE_URL}/items`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateHobbyItem(
  itemId: string,
  input: UpdateHobbyItemInput
): Promise<void> {
  await apiCall(`${BASE_URL}/items/${itemId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export async function deleteHobbyItem(itemId: string): Promise<void> {
  await apiCall(`${BASE_URL}/items/${itemId}`, {
    method: 'DELETE',
  });
}

// ============================================================================
// RELATED ITEMS (for RELATION type fields)
// ============================================================================

export interface RelatedItemsResponse {
  items: HobbyItem[];
  total: number;
}

/**
 * Get items that reference a specific item via a RELATION field
 * e.g., Get all characters that have animeId = 'some-anime-id'
 */
export async function getRelatedItems(
  hobbyId: string,
  fieldName: string,
  targetItemId: string
): Promise<RelatedItemsResponse> {
  const url = new URL(`${BASE_URL}/items/related`, window.location.origin);
  url.searchParams.set('hobbyId', hobbyId);
  url.searchParams.set('fieldName', fieldName);
  url.searchParams.set('targetItemId', targetItemId);
  return apiCall<RelatedItemsResponse>(url.toString());
}

/**
 * Get a single item by ID (for resolving RELATION references)
 */
export async function getHobbyItemById(itemId: string): Promise<HobbyItem | null> {
  try {
    return await apiCall<HobbyItem>(`${BASE_URL}/items/${itemId}`);
  } catch {
    return null;
  }
}

/**
 * Get multiple items by IDs (for batch resolving RELATION references)
 */
export async function getHobbyItemsByIds(itemIds: string[]): Promise<HobbyItem[]> {
  if (itemIds.length === 0) return [];

  // Fetch items in parallel
  const promises = itemIds.map(id => getHobbyItemById(id));
  const results = await Promise.all(promises);
  return results.filter((item): item is HobbyItem => item !== null);
}
