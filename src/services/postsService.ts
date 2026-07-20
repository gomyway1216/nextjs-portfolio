import type { User } from 'firebase/auth';
import { auth } from '@/lib/firebaseConnect';
import type { PostLanguage, PostTranslations } from '@/lib/blog/postTranslations';

// Try to surface the API's error message instead of just the HTTP status,
// so the user sees something useful in the toast / error UI. When the API
// included a `details` field (e.g. a Firestore "needs an index" message
// with a clickable URL), include it after the headline.
async function throwApiError(response: Response): Promise<never> {
  let message = `HTTP error! status: ${response.status}`;
  try {
    const data = await response.json();
    const parts: string[] = [];
    if (data && typeof data.error === 'string') parts.push(data.error);
    if (data && typeof data.details === 'string') parts.push(data.details);
    if (
      data &&
      typeof data.indexUrl === 'string' &&
      !parts.some((part) => part.includes(data.indexUrl))
    ) {
      parts.push(data.indexUrl);
    }
    if (parts.length > 0) message = parts.join('\n');
  } catch {
    // body not JSON; keep status-based message
  }
  throw new Error(message);
}

// A "listing post" is a Firestore post flattened to a single locale by the
// server. The full translations map is not included to keep responses small.
export interface ListingPost {
  id: string;
  // Canonical URL slug; equals the id for posts without an English title.
  // Optional because cached/older API responses may predate the field.
  slug?: string;
  title: string;
  body: string;
  isPublic: boolean;
  category: string;
  tags: string[];
  image?: string;
  language: PostLanguage;
  availableLanguages: PostLanguage[];
  viewCount?: number;
  likeCount?: number;
  created: string;
  lastUpdated: string;
}

// A "detail post" includes the full translations map so the client can
// switch languages without an extra round-trip.
export interface DetailPost {
  id: string;
  isPublic: boolean;
  category: string;
  tags: string[];
  image?: string;
  translations: PostTranslations;
  availableLanguages: PostLanguage[];
  relatedPostIds?: string[];
  viewCount?: number;
  created: string;
  lastUpdated: string;
}

// Flattened summary used by the related-posts strip under an article.
export interface RelatedPostSummary {
  id: string;
  slug?: string;
  title: string;
  language: PostLanguage;
  category: string;
  image?: string;
  created: string;
}

// Backwards-compatible alias for code that imports `Post`. Treat it as a
// listing post for now.
export type Post = ListingPost;

export interface PostsResponse {
  posts: ListingPost[];
  hasMore?: boolean;
  lastVisibleTimestamp?: number | null;
}

export type PostTaxonomyType = 'category' | 'tag';

export interface PostTaxonomyItem {
  slug: string;
  postCount: number;
  configured: boolean;
  seeded: boolean;
}

export interface PostTaxonomyResponse {
  categories: PostTaxonomyItem[];
  tags: PostTaxonomyItem[];
}

// On a fresh page load `auth.currentUser` is `null` until the Firebase
// auth listener has restored the session from local storage. Hooks that
// fire on mount (like usePosts) hit this window and would otherwise send
// the request with no auth header, getting a 401 from admin-gated
// endpoints. Wait briefly for the auth state to settle before reading.
async function waitForAuthUser(timeoutMs = 3000): Promise<User | null> {
  if (auth.currentUser) return auth.currentUser;
  return await new Promise<User | null>((resolve) => {
    const timer = setTimeout(() => {
      unsubscribe();
      resolve(auth.currentUser);
    }, timeoutMs);
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        clearTimeout(timer);
        unsubscribe();
        resolve(user);
      }
    });
  });
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const user = await waitForAuthUser();
  if (!user) return {};

  const token = await user.getIdToken();
  return {
    'Authorization': `Bearer ${token}`,
  };
}

export async function getPosts(params: {
  category?: string;
  // boolean -> filter to that value; null -> no filter (admin only,
  // returns drafts + public); undefined -> defaults to `true` (public only)
  isPublic?: boolean | null;
  page?: number;
  limit?: number;
  lastVisibleTimestamp?: number;
  language?: PostLanguage;
  // Skip post bodies in the response (each comes back as ''). For lists
  // that only render metadata, e.g. the admin tables.
  excludeBody?: boolean;
  // Public listing calls normally omit auth. Set this when an admin-facing
  // screen wants API diagnostic details such as Firestore index URLs.
  includeAdminDiagnostics?: boolean;
} = {}): Promise<PostsResponse> {
  const {
    category = 'all',
    isPublic = true,
    page = 1,
    limit = 10,
    lastVisibleTimestamp,
    language,
    excludeBody,
    includeAdminDiagnostics,
  } = params;

  const queryParams = new URLSearchParams({
    category,
    page: String(page),
    limit: String(limit),
  });

  if (isPublic !== null) {
    queryParams.append('isPublic', String(isPublic));
  }

  if (lastVisibleTimestamp) {
    queryParams.append('lastVisibleTimestamp', String(lastVisibleTimestamp));
  }

  if (language) {
    queryParams.append('language', language);
  }

  if (excludeBody) {
    queryParams.append('excludeBody', 'true');
  }

  // Admin auth is needed unless the caller is explicitly asking for
  // public-only posts. Both `null` (no filter) and `false` require it.
  const headers = isPublic === true && !includeAdminDiagnostics ? {} : await getAuthHeaders();

  const response = await fetch(`/api/post?${queryParams}`, {
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });

  if (!response.ok) {
    await throwApiError(response);
  }

  return await response.json() as PostsResponse;
}

// Convenience wrapper around getPosts for category-scoped listings.
export async function getPostsByCategory(category: string, isPublic?: boolean, language?: PostLanguage): Promise<ListingPost[]> {
  const data = await getPosts({
    category,
    isPublic: isPublic ?? true,
    language,
  });
  return data.posts;
}

export async function getPostById(id: string): Promise<DetailPost> {
  const response = await fetch(`/api/post/${id}`, {
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

export async function getPostLikeCount(id: string): Promise<number> {
  const response = await fetch(`/api/post/${encodeURIComponent(id)}/like`, {
    cache: 'no-store',
  });
  if (!response.ok) {
    await throwApiError(response);
  }
  const data = await response.json();
  return typeof data.likeCount === 'number' ? data.likeCount : 0;
}

export async function setPostLike(id: string, action: 'like' | 'unlike'): Promise<number> {
  const response = await fetch(`/api/post/${encodeURIComponent(id)}/like`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  });
  if (!response.ok) {
    await throwApiError(response);
  }
  const data = await response.json();
  return typeof data.likeCount === 'number' ? data.likeCount : 0;
}

export async function getRelatedPosts(
  ids: string[],
  language?: PostLanguage,
): Promise<RelatedPostSummary[]> {
  if (ids.length === 0) return [];

  const queryParams = new URLSearchParams({ ids: ids.join(',') });
  if (language) queryParams.append('language', language);

  const response = await fetch(`/api/post/related?${queryParams}`, {
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    await throwApiError(response);
  }

  const data = await response.json();
  return data.posts as RelatedPostSummary[];
}

// Fire-and-forget view beacon. sendBeacon survives page unloads and never
// throws; the fetch fallback swallows errors — losing a view is fine,
// breaking the reading experience is not.
export function recordPostView(id: string): void {
  const url = `/api/post/${encodeURIComponent(id)}/view`;
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon(url);
      return;
    }
  } catch {
    // fall through to fetch
  }
  void fetch(url, { method: 'POST', keepalive: true }).catch(() => {});
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

export async function getPostTaxonomy(): Promise<PostTaxonomyResponse> {
  const headers = await getAuthHeaders();

  const response = await fetch('/api/post/taxonomy', {
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });

  if (!response.ok) {
    await throwApiError(response);
  }

  return await response.json() as PostTaxonomyResponse;
}

export async function addPostTaxonomyItem(type: PostTaxonomyType, value: string): Promise<PostTaxonomyResponse> {
  const headers = await getAuthHeaders();

  const response = await fetch('/api/post/taxonomy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify({ type, value }),
  });

  if (!response.ok) {
    await throwApiError(response);
  }

  return await response.json() as PostTaxonomyResponse;
}

export async function deletePostTaxonomyItem(type: PostTaxonomyType, value: string): Promise<PostTaxonomyResponse> {
  const headers = await getAuthHeaders();

  const response = await fetch('/api/post/taxonomy', {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify({ type, value }),
  });

  if (!response.ok) {
    await throwApiError(response);
  }

  return await response.json() as PostTaxonomyResponse;
}

export async function getTop4Posts(
  language?: PostLanguage,
  options: { includeAdminDiagnostics?: boolean } = {},
): Promise<ListingPost[]> {
  const queryParams = new URLSearchParams();
  if (language) {
    queryParams.append('language', language);
  }
  const qs = queryParams.toString();
  const url = qs ? `/api/post/top?${qs}` : '/api/post/top';

  const headers = options.includeAdminDiagnostics ? await getAuthHeaders() : {};

  const response = await fetch(url, {
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

export async function createPost(post: {
  category: string;
  tags?: string[];
  translations: PostTranslations;
  isPublic?: boolean;
  image?: string;
  relatedPostIds?: string[];
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
  post: {
    translations: PostTranslations;
    category?: string;
    tags?: string[];
    isPublic?: boolean;
    image?: string;
    relatedPostIds?: string[];
  }
): Promise<void> {
  const headers = await getAuthHeaders();

  const response = await fetch(`/api/post/${id}`, {
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

export async function deletePost(id: string): Promise<boolean> {
  const headers = await getAuthHeaders();

  const response = await fetch(`/api/post/${id}`, {
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
