'use client';

import { useState, useEffect, useCallback } from 'react';
import * as api from '@/services/postsService';
import type { Post } from '@/services/postsService';

export interface CreatePostData {
  title: string;
  body: string;
  category: string;
  isPublic?: boolean;
  image?: string;
  language?: string;
}

export interface UpdatePostData {
  title: string;
  body: string;
  isPublic?: boolean;
  image?: string;
  language?: string;
}

export interface GetPostsParams {
  category?: string;
  isPublic?: boolean;
  page?: number;
  limit?: number;
  lastVisibleTimestamp?: number;
}

/**
 * Hook to fetch paginated posts
 */
export function usePosts(params: GetPostsParams = {}) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [lastVisibleTimestamp, setLastVisibleTimestamp] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const fetchPosts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getPosts({
        ...params,
        lastVisibleTimestamp: lastVisibleTimestamp || undefined,
      });
      setPosts(data.posts);
      setLastVisibleTimestamp(data.lastVisibleTimestamp);
      setHasMore(data.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch posts'));
    } finally {
      setLoading(false);
    }
  }, [params.category, params.isPublic, params.page, params.limit, lastVisibleTimestamp]);

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
export function usePost(id: string | null, category: string | null) {
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchPost = useCallback(async () => {
    if (!id || !category) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await api.getPostByCategory(id, category);
      setPost(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch post'));
    } finally {
      setLoading(false);
    }
  }, [id, category]);

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

  useEffect(() => {
    const fetchCategories = async () => {
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
    };

    fetchCategories();
  }, []);

  return { categories, loading, error };
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

  const updatePost = async (id: string, category: string, post: UpdatePostData) => {
    try {
      setLoading(true);
      setError(null);
      await api.updatePost(id, category, post);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to update post');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const deletePost = async (id: string, category: string) => {
    try {
      setLoading(true);
      setError(null);
      await api.deletePostByCategory(id, category);
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
