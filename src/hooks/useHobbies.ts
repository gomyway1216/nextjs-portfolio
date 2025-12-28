'use client';

import { useState, useEffect, useCallback } from 'react';
import type {
  HobbyCategory,
  HobbyItem,
  CreateHobbyCategoryInput,
  UpdateHobbyCategoryInput,
  CreateHobbyItemInput,
  UpdateHobbyItemInput,
} from '@/types/hobby';
import * as hobbyService from '@/services/hobbyService';

// ============================================================================
// HOBBY CATEGORIES HOOKS
// ============================================================================

interface UseHobbyCategoriesOptions {
  includePrivate?: boolean;
}

interface UseHobbyCategoriesResult {
  categories: HobbyCategory[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useHobbyCategories(
  options: UseHobbyCategoriesOptions = {}
): UseHobbyCategoriesResult {
  const [categories, setCategories] = useState<HobbyCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCategories = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await hobbyService.getHobbyCategories(options.includePrivate);
      setCategories(response.categories);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch categories');
    } finally {
      setLoading(false);
    }
  }, [options.includePrivate]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  return { categories, loading, error, refetch: fetchCategories };
}

// ============================================================================
// HOBBY CATEGORY MUTATIONS HOOK
// ============================================================================

interface UseHobbyMutationsResult {
  createCategory: (input: CreateHobbyCategoryInput) => Promise<string>;
  updateCategory: (hobbyId: string, input: UpdateHobbyCategoryInput) => Promise<void>;
  deleteCategory: (hobbyId: string) => Promise<void>;
  loading: boolean;
  error: string | null;
}

export function useHobbyMutations(): UseHobbyMutationsResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createCategory = async (input: CreateHobbyCategoryInput): Promise<string> => {
    try {
      setLoading(true);
      setError(null);
      const result = await hobbyService.createHobbyCategory(input);
      return result.id;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create category';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const updateCategory = async (hobbyId: string, input: UpdateHobbyCategoryInput): Promise<void> => {
    try {
      setLoading(true);
      setError(null);
      await hobbyService.updateHobbyCategory(hobbyId, input);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update category';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const deleteCategory = async (hobbyId: string): Promise<void> => {
    try {
      setLoading(true);
      setError(null);
      await hobbyService.deleteHobbyCategory(hobbyId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete category';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { createCategory, updateCategory, deleteCategory, loading, error };
}

// ============================================================================
// HOBBY ITEMS HOOKS
// ============================================================================

interface UseHobbyItemsOptions {
  hobbyId: string;
  includePrivate?: boolean;
  limit?: number;
}

interface UseHobbyItemsResult {
  items: HobbyItem[];
  total: number;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  loadMore: () => Promise<void>;
  hasMore: boolean;
}

export function useHobbyItems(options: UseHobbyItemsOptions): UseHobbyItemsResult {
  const [items, setItems] = useState<HobbyItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const limit = options.limit || 50;

  const fetchItems = useCallback(async (reset = true) => {
    // Skip fetch if hobbyId is empty
    if (!options.hobbyId) {
      setItems([]);
      setTotal(0);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const newOffset = reset ? 0 : offset;
      const response = await hobbyService.getHobbyItems(options.hobbyId, {
        includePrivate: options.includePrivate,
        limit,
        offset: newOffset,
      });

      if (reset) {
        setItems(response.items);
        setOffset(response.items.length);
      } else {
        setItems((prev) => [...prev, ...response.items]);
        setOffset((prev) => prev + response.items.length);
      }
      setTotal(response.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch items');
    } finally {
      setLoading(false);
    }
  }, [options.hobbyId, options.includePrivate, limit, offset]);

  useEffect(() => {
    fetchItems(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.hobbyId, options.includePrivate]);

  const loadMore = async () => {
    if (items.length < total) {
      await fetchItems(false);
    }
  };

  return {
    items,
    total,
    loading,
    error,
    refetch: () => fetchItems(true),
    loadMore,
    hasMore: items.length < total,
  };
}

// ============================================================================
// HOBBY ITEM MUTATIONS HOOK
// ============================================================================

interface UseHobbyItemMutationsResult {
  createItem: (input: CreateHobbyItemInput) => Promise<string>;
  updateItem: (itemId: string, input: UpdateHobbyItemInput) => Promise<void>;
  deleteItem: (itemId: string) => Promise<void>;
  loading: boolean;
  error: string | null;
}

export function useHobbyItemMutations(): UseHobbyItemMutationsResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createItem = async (input: CreateHobbyItemInput): Promise<string> => {
    try {
      setLoading(true);
      setError(null);
      const result = await hobbyService.createHobbyItem(input);
      return result.id;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create item';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const updateItem = async (itemId: string, input: UpdateHobbyItemInput): Promise<void> => {
    try {
      setLoading(true);
      setError(null);
      await hobbyService.updateHobbyItem(itemId, input);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update item';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const deleteItem = async (itemId: string): Promise<void> => {
    try {
      setLoading(true);
      setError(null);
      await hobbyService.deleteHobbyItem(itemId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete item';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { createItem, updateItem, deleteItem, loading, error };
}

// ============================================================================
// SINGLE HOBBY CATEGORY HOOK
// ============================================================================

interface UseHobbyCategoryResult {
  hobby: HobbyCategory | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useHobbyCategory(hobbyIdOrSlug: string, bySlug = false): UseHobbyCategoryResult {
  const [hobby, setHobby] = useState<HobbyCategory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHobby = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      if (bySlug) {
        const result = await hobbyService.getHobbyCategoryBySlug(hobbyIdOrSlug);
        setHobby(result);
      } else {
        const result = await hobbyService.getHobbyCategory(hobbyIdOrSlug);
        setHobby(result);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch hobby');
    } finally {
      setLoading(false);
    }
  }, [hobbyIdOrSlug, bySlug]);

  useEffect(() => {
    if (hobbyIdOrSlug) {
      fetchHobby();
    }
  }, [fetchHobby, hobbyIdOrSlug]);

  return { hobby, loading, error, refetch: fetchHobby };
}

// ============================================================================
// SINGLE HOBBY ITEM HOOK
// ============================================================================

interface UseHobbyItemResult {
  item: HobbyItem | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useHobbyItem(itemId: string): UseHobbyItemResult {
  const [item, setItem] = useState<HobbyItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchItem = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await hobbyService.getHobbyItem(itemId);
      setItem(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch item');
    } finally {
      setLoading(false);
    }
  }, [itemId]);

  useEffect(() => {
    if (itemId) {
      fetchItem();
    }
  }, [fetchItem, itemId]);

  return { item, loading, error, refetch: fetchItem };
}

// ============================================================================
// RELATED ITEMS HOOKS
// ============================================================================

interface UseRelatedItemsOptions {
  hobbyId: string;
  fieldName: string;
  targetItemId: string;
}

interface UseRelatedItemsResult {
  items: HobbyItem[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useRelatedItems(options: UseRelatedItemsOptions): UseRelatedItemsResult {
  const [items, setItems] = useState<HobbyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    if (!options.hobbyId || !options.fieldName || !options.targetItemId) {
      setItems([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await hobbyService.getRelatedItems(
        options.hobbyId,
        options.fieldName,
        options.targetItemId
      );
      setItems(response.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch related items');
    } finally {
      setLoading(false);
    }
  }, [options.hobbyId, options.fieldName, options.targetItemId]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  return { items, loading, error, refetch: fetchItems };
}

// ============================================================================
// RESOLVED RELATION HOOK
// ============================================================================

interface UseResolvedRelationResult {
  item: HobbyItem | null;
  loading: boolean;
  error: string | null;
}

export function useResolvedRelation(itemId: string | null | undefined): UseResolvedRelationResult {
  const [item, setItem] = useState<HobbyItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!itemId) {
      setItem(null);
      setLoading(false);
      return;
    }

    const fetchItem = async () => {
      try {
        setLoading(true);
        setError(null);
        const result = await hobbyService.getHobbyItemById(itemId);
        setItem(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch related item');
      } finally {
        setLoading(false);
      }
    };

    fetchItem();
  }, [itemId]);

  return { item, loading, error };
}
