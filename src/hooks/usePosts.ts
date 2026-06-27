'use client';

import { useState, useEffect, useCallback } from 'react';
import * as api from '@/services/postsService';
import type { Post, DetailPost, PostTaxonomyResponse, PostTaxonomyType } from '@/services/postsService';
import type { PostLanguage, PostTranslations } from '@/lib/blog/postTranslations';

export interface CreatePostData {
  category: string;
  tags?: string[];
  translations: PostTranslations;
  isPublic?: boolean;
  image?: string;
}

export interface UpdatePostData {
  translations: PostTranslations;
  category?: string;
  tags?: string[];
  isPublic?: boolean;
  image?: string;
}

export interface GetPostsParams {
  category?: string;
  isPublic?: boolean | null;
  page?: number;
  limit?: number;
  lastVisibleTimestamp?: number;
  language?: PostLanguage;
  /** Skip post bodies — for lists that only render metadata. */
  excludeBody?: boolean;
}

/**
 * Hook to fetch paginated posts
 */
export function usePosts(params: GetPostsParams = {}) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(false);

  // Always fetches the first page. Previously `lastVisibleTimestamp` was
  // part of the callback's dependencies, so every successful fetch updated
  // that state, which re-created the callback, which re-ran the effect,
  // which fetched the next page — an infinite loop that only surfaced
  // once a post actually existed for the cursor to advance past.
  const fetchPosts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getPosts(params);
      setPosts(data.posts);
      setHasMore(!!data.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch posts'));
    } finally {
      setLoading(false);
    }
    // params is intentionally spread into deps by individual fields below
    // so that re-renders with a fresh-but-equivalent `params` object don't
    // trigger an unnecessary refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.category, params.isPublic, params.page, params.limit, params.language, params.excludeBody]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  return { posts, loading, error, hasMore, refetch: fetchPosts };
}

/**
 * Hook to fetch posts by category
 */
export function usePostsByCategory(category: string, isPublic?: boolean) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchPosts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getPostsByCategory(category, isPublic);
      setPosts(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch posts'));
    } finally {
      setLoading(false);
    }
  }, [category, isPublic]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  return { posts, loading, error, refetch: fetchPosts };
}

/**
 * Hook to fetch a single post
 */
export function usePost(id: string | null) {
  const [post, setPost] = useState<DetailPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchPost = useCallback(async () => {
    if (!id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await api.getPostById(id);
      setPost(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch post'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchPost();
  }, [fetchPost]);

  return { post, loading, error, refetch: fetchPost };
}

/**
 * Hook to fetch post categories
 */
export function usePostCategories() {
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchCategories = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getPostCategories();
      setCategories(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch categories'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  return { categories, loading, error, refetch: fetchCategories };
}

export function usePostTaxonomy() {
  const [taxonomy, setTaxonomy] = useState<PostTaxonomyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchTaxonomy = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setTaxonomy(await api.getPostTaxonomy());
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch taxonomy'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTaxonomy();
  }, [fetchTaxonomy]);

  const addItem = useCallback(async (type: PostTaxonomyType, value: string) => {
    try {
      setMutating(true);
      setError(null);
      const next = await api.addPostTaxonomyItem(type, value);
      setTaxonomy(next);
      return next;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to add taxonomy item');
      setError(error);
      throw error;
    } finally {
      setMutating(false);
    }
  }, []);

  const deleteItem = useCallback(async (type: PostTaxonomyType, value: string) => {
    try {
      setMutating(true);
      setError(null);
      const next = await api.deletePostTaxonomyItem(type, value);
      setTaxonomy(next);
      return next;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to delete taxonomy item');
      setError(error);
      throw error;
    } finally {
      setMutating(false);
    }
  }, []);

  return { taxonomy, loading, mutating, error, refetch: fetchTaxonomy, addItem, deleteItem };
}

/**
 * Hook to fetch top posts
 */
export function useTopPosts() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchPosts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getTop4Posts();
      setPosts(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch top posts'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  return { posts, loading, error, refetch: fetchPosts };
}

/**
 * Hook for post mutations (create, update, delete)
 */
export function usePostMutations() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const createPost = async (post: CreatePostData) => {
    try {
      setLoading(true);
      setError(null);
      const id = await api.createPost(post);
      return id;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to create post');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const updatePost = async (id: string, post: UpdatePostData) => {
    try {
      setLoading(true);
      setError(null);
      await api.updatePost(id, post);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to update post');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const deletePost = async (id: string) => {
    try {
      setLoading(true);
      setError(null);
      await api.deletePost(id);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to delete post');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  return {
    createPost,
    updatePost,
    deletePost,
    loading,
    error,
  };
}
