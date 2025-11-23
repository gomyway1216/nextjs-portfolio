import { auth } from '@/lib/firebaseConnect';

export interface Post {
  id: string;
  title: string;
  body: string;
  isPublic: boolean;
  category: string;
  image?: string;
  language?: string;
  created: string;
  lastUpdated: string;
}

async function getAuthHeaders() {
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
} = {}) {
  const {
    category = 'all',
    isPublic = true,
    page = 1,
    limit = 10,
    lastVisibleTimestamp,
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

  const headers = !isPublic ? await getAuthHeaders() : {};

  const response = await fetch(`/api/post?${queryParams}`, {
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return await response.json();
}

export async function getPostsByCategory(category: string, isPublic?: boolean) {
  const queryParams = new URLSearchParams();
  if (isPublic !== undefined) {
    queryParams.append('isPublic', String(isPublic));
  }

  const headers = isPublic === false || isPublic === undefined ? await getAuthHeaders() : {};

  const response = await fetch(`/api/post/${category}?${queryParams}`, {
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  return data.posts;
}

export async function getPostByCategory(id: string, category: string) {
  const response = await fetch(`/api/post/${category}/${id}`, {
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  return data.post;
}

export async function getPostCategories() {
  const response = await fetch('/api/post/categories', {
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  return data.categories;
}

export async function getTop4Posts() {
  const response = await fetch('/api/post/top', {
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  return data.posts;
}

export async function createPost(post: {
  title: string;
  body: string;
  category: string;
  isPublic?: boolean;
  image?: string;
  language?: string;
}) {
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
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  return data.id;
}

export async function updatePost(
  id: string,
  category: string,
  post: {
    title: string;
    body: string;
    isPublic?: boolean;
    image?: string;
    language?: string;
  }
) {
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
    throw new Error(`HTTP error! status: ${response.status}`);
  }
}

export async function deletePostByCategory(id: string, category: string) {
  const headers = await getAuthHeaders();

  const response = await fetch(`/api/post/${category}/${id}`, {
    method: 'DELETE',
    headers: {
      ...headers,
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return true;
}
