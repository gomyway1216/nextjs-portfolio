import { auth } from '@/lib/firebaseConnect';
import type { PostLanguage, PostTranslations } from '@/lib/blog/postTranslations';

// Try to surface the API's error message instead of just the HTTP status,
// so the user sees something useful in the toast.
async function throwApiError(response: Response): Promise<never> {
  let message = `HTTP error! status: ${response.status}`;
  try {
    const data = await response.json();
    if (data && typeof data.error === 'string') {
      message = data.error;
    }
  } catch {
    // body not JSON; keep status-based message
  }
  throw new Error(message);
}

// A "listing post" is a Firestore post flattened to a single locale by the
// server. The full translations map is not included to keep responses small.
export interface ListingPost {
  id: string;
  title: string;
  body: string;
  isPublic: boolean;
  category: string;
  image?: string;
  language: PostLanguage;
  availableLanguages: PostLanguage[];
  created: string;
  lastUpdated: string;
}

// A "detail post" includes the full translations map so the client can
// switch languages without an extra round-trip.
export interface DetailPost {
  id: string;
  isPublic: boolean;
  category: string;
  image?: string;
  translations: PostTranslations;
  availableLanguages: PostLanguage[];
  created: string;
  lastUpdated: string;
}

// Backwards-compatible alias for code that imports `Post`. Treat it as a
// listing post for now.
export type Post = ListingPost;

async function getAuthHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) return {};

  const token = await user.getIdToken();
  return {
    'Authorization': `Bearer ${token}`,
  };
}

export async function getPosts(params: {
  category?: string;
  isPublic?: boolean;
  page?: number;
  limit?: number;
  lastVisibleTimestamp?: number;
  language?: PostLanguage;
} = {}) {
  const {
    category = 'all',
    isPublic = true,
    page = 1,
    limit = 10,
    lastVisibleTimestamp,
    language,
  } = params;

  const queryParams = new URLSearchParams({
    category,
    isPublic: String(isPublic),
    page: String(page),
    limit: String(limit),
  });

  if (lastVisibleTimestamp) {
    queryParams.append('lastVisibleTimestamp', String(lastVisibleTimestamp));
  }

  if (language) {
    queryParams.append('language', language);
  }

  const headers = !isPublic ? await getAuthHeaders() : {};

  const response = await fetch(`/api/post?${queryParams}`, {
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });

  if (!response.ok) {
    await throwApiError(response);
  }

  return await response.json();
}

export async function getPostsByCategory(category: string, isPublic?: boolean, language?: PostLanguage): Promise<ListingPost[]> {
  const queryParams = new URLSearchParams();
  if (isPublic !== undefined) {
    queryParams.append('isPublic', String(isPublic));
  }
  if (language) {
    queryParams.append('language', language);
  }

  const headers = isPublic === false || isPublic === undefined ? await getAuthHeaders() : {};

  const response = await fetch(`/api/post/${category}?${queryParams}`, {
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });

  if (!response.ok) {
    await throwApiError(response);
  }

  const data = await response.json();
  return data.posts;
}

export async function getPostByCategory(id: string, category: string): Promise<DetailPost> {
  const response = await fetch(`/api/post/${category}/${id}`, {
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    await throwApiError(response);
  }

  const data = await response.json();
  return data.post;
}

export async function getPostCategories(): Promise<string[]> {
  const response = await fetch('/api/post/categories', {
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    await throwApiError(response);
  }

  const data = await response.json();
  return data.categories;
}

export async function getTop4Posts(language?: PostLanguage): Promise<ListingPost[]> {
  const queryParams = new URLSearchParams();
  if (language) {
    queryParams.append('language', language);
  }
  const qs = queryParams.toString();
  const url = qs ? `/api/post/top?${qs}` : '/api/post/top';

  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    await throwApiError(response);
  }

  const data = await response.json();
  return data.posts;
}

export async function createPost(post: {
  category: string;
  translations: PostTranslations;
  isPublic?: boolean;
  image?: string;
}): Promise<string> {
  const headers = await getAuthHeaders();

  const response = await fetch('/api/post', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(post),
  });

  if (!response.ok) {
    await throwApiError(response);
  }

  const data = await response.json();
  return data.id;
}

export async function updatePost(
  id: string,
  category: string,
  post: {
    translations: PostTranslations;
    isPublic?: boolean;
    image?: string;
  }
): Promise<void> {
  const headers = await getAuthHeaders();

  const response = await fetch(`/api/post/${category}/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(post),
  });

  if (!response.ok) {
    await throwApiError(response);
  }
}

export async function deletePostByCategory(id: string, category: string): Promise<boolean> {
  const headers = await getAuthHeaders();

  const response = await fetch(`/api/post/${category}/${id}`, {
    method: 'DELETE',
    headers: {
      ...headers,
    },
  });

  if (!response.ok) {
    await throwApiError(response);
  }

  return true;
}
