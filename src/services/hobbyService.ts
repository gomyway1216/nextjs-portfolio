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

const BASE_URL = '/api/hobby';

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
    offset?: number;
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
  if (options.offset) {
    url.searchParams.set('offset', options.offset.toString());
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
