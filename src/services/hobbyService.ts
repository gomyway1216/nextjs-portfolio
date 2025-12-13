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

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error('Failed to fetch hobby categories');
  }
  return response.json();
}

export async function getHobbyCategory(hobbyId: string): Promise<HobbyCategory> {
  const response = await fetch(`${BASE_URL}/${hobbyId}`);
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Hobby not found');
    }
    throw new Error('Failed to fetch hobby category');
  }
  return response.json();
}

export async function getHobbyCategoryBySlug(slug: string): Promise<HobbyCategory | null> {
  const { categories } = await getHobbyCategories(true);
  return categories.find((c) => c.slug === slug) || null;
}

export async function createHobbyCategory(
  input: CreateHobbyCategoryInput
): Promise<{ id: string }> {
  const response = await fetch(BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create hobby category');
  }
  return response.json();
}

export async function updateHobbyCategory(
  hobbyId: string,
  input: UpdateHobbyCategoryInput
): Promise<void> {
  const response = await fetch(`${BASE_URL}/${hobbyId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update hobby category');
  }
}

export async function deleteHobbyCategory(hobbyId: string): Promise<void> {
  const response = await fetch(`${BASE_URL}/${hobbyId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete hobby category');
  }
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

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error('Failed to fetch hobby items');
  }
  return response.json();
}

export async function getHobbyItem(itemId: string): Promise<HobbyItem> {
  const response = await fetch(`${BASE_URL}/items/${itemId}`);
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Item not found');
    }
    throw new Error('Failed to fetch hobby item');
  }
  return response.json();
}

export async function createHobbyItem(
  input: CreateHobbyItemInput
): Promise<{ id: string }> {
  const response = await fetch(`${BASE_URL}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create hobby item');
  }
  return response.json();
}

export async function updateHobbyItem(
  itemId: string,
  input: UpdateHobbyItemInput
): Promise<void> {
  const response = await fetch(`${BASE_URL}/items/${itemId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update hobby item');
  }
}

export async function deleteHobbyItem(itemId: string): Promise<void> {
  const response = await fetch(`${BASE_URL}/items/${itemId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete hobby item');
  }
}
