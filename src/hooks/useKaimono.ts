'use client';

import { useState, useEffect, useCallback } from 'react';
import * as kaimonoService from '@/services/kaimonoService';
import type {
  ShoppingList,
  KaimonoUserHistory,
  FrequentItem,
  RecurringItem,
  CreateShoppingListInput,
  UpdateShoppingListInput,
  CreateShoppingItemInput,
  UpdateShoppingItemInput,
  CreateRecurringItemInput,
  UpdateRecurringItemInput,
  QRCodeResponse,
} from '@/types/kaimono';

type PasscodeRequiredList = Pick<ShoppingList, 'id' | 'name'> & {
  requiresPasscode?: boolean;
};

// ============================================================================
// useKaimonoList - Single list management
// ============================================================================

interface UseKaimonoListResult {
  list: ShoppingList | null;
  loading: boolean;
  error: string | null;
  requiresPasscode: boolean;
  verifyPasscode: (passcode: string) => Promise<boolean>;
  refetch: () => Promise<void>;
}

export function useKaimonoList(listId: string | null): UseKaimonoListResult {
  const [list, setList] = useState<ShoppingList | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requiresPasscode, setRequiresPasscode] = useState(false);
  const [verified, setVerified] = useState(false);

  const fetchList = useCallback(async () => {
    if (!listId) {
      setList(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await kaimonoService.getList(listId, verified);
      const passcodeData = data as ShoppingList | PasscodeRequiredList;
      if ('requiresPasscode' in passcodeData && passcodeData.requiresPasscode) {
        setRequiresPasscode(true);
        setList({ id: passcodeData.id, name: passcodeData.name, hasPasscode: true } as ShoppingList);
      } else {
        setRequiresPasscode(false);
        setList(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch list');
      setList(null);
    } finally {
      setLoading(false);
    }
  }, [listId, verified]);

  const handleVerifyPasscode = useCallback(async (passcode: string): Promise<boolean> => {
    if (!listId) return false;
    try {
      const result = await kaimonoService.verifyPasscode(listId, passcode);
      if (result.verified) {
        setVerified(true);
        setRequiresPasscode(false);
        const data = await kaimonoService.getList(listId, true);
        setList(data);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [listId]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  return {
    list,
    loading,
    error,
    requiresPasscode,
    verifyPasscode: handleVerifyPasscode,
    refetch: fetchList,
  };
}

// ============================================================================
// useKaimonoListByShareCode
// ============================================================================

export function useKaimonoListByShareCode(
  shareCode: string | null
): Omit<UseKaimonoListResult, 'requiresPasscode' | 'verifyPasscode'> {
  const [list, setList] = useState<ShoppingList | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchList = useCallback(async () => {
    if (!shareCode) {
      setList(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await kaimonoService.getListByShareCode(shareCode);
      setList(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch list');
      setList(null);
    } finally {
      setLoading(false);
    }
  }, [shareCode]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  return { list, loading, error, refetch: fetchList };
}

// ============================================================================
// useKaimonoHistory
// ============================================================================

interface UseKaimonoHistoryResult {
  history: KaimonoUserHistory[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useKaimonoHistory(): UseKaimonoHistoryResult {
  const [history, setHistory] = useState<KaimonoUserHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await kaimonoService.getHistory();
      setHistory(data.history);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch history');
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return { history, loading, error, refetch: fetchHistory };
}

// ============================================================================
// useKaimonoFrequentItems
// ============================================================================

interface UseKaimonoFrequentItemsResult {
  items: FrequentItem[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useKaimonoFrequentItems(): UseKaimonoFrequentItemsResult {
  const [items, setItems] = useState<FrequentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await kaimonoService.getFrequentItems();
      setItems(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch frequent items');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  return { items, loading, error, refetch: fetchItems };
}

// ============================================================================
// useKaimonoRecurring
// ============================================================================

interface UseKaimonoRecurringResult {
  items: RecurringItem[];
  dueItems: RecurringItem[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useKaimonoRecurring(): UseKaimonoRecurringResult {
  const [items, setItems] = useState<RecurringItem[]>([]);
  const [dueItems, setDueItems] = useState<RecurringItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [allData, dueData] = await Promise.all([
        kaimonoService.getRecurringItems(),
        kaimonoService.getDueRecurringItems(),
      ]);
      setItems(allData.items);
      setDueItems(dueData.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch recurring items');
      setItems([]);
      setDueItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  return { items, dueItems, loading, error, refetch: fetchItems };
}

// ============================================================================
// useKaimonoMutations
// ============================================================================

interface UseKaimonoMutationsResult {
  // Lists
  createList: (input: CreateShoppingListInput) => Promise<{ id: string; shareCode: string }>;
  updateList: (listId: string, input: UpdateShoppingListInput) => Promise<void>;
  deleteList: (listId: string) => Promise<void>;
  // Items
  addItems: (listId: string, items: CreateShoppingItemInput[]) => Promise<{ ids: string[] }>;
  updateItem: (listId: string, itemId: string, input: UpdateShoppingItemInput) => Promise<void>;
  deleteItem: (listId: string, itemId: string) => Promise<void>;
  toggleItem: (listId: string, itemId: string) => Promise<{ isPurchased: boolean }>;
  // Recurring
  createRecurring: (input: CreateRecurringItemInput) => Promise<{ id: string }>;
  updateRecurring: (itemId: string, input: UpdateRecurringItemInput) => Promise<void>;
  deleteRecurring: (itemId: string) => Promise<void>;
  // QR Code
  generateQRCode: (listId: string) => Promise<QRCodeResponse>;
  // State
  loading: boolean;
  error: string | null;
}

export function useKaimonoMutations(): UseKaimonoMutationsResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wrapMutation = useCallback(
    async <T>(fn: () => Promise<T>): Promise<T> => {
      setLoading(true);
      setError(null);
      try {
        const result = await fn();
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Operation failed';
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const createList = useCallback(
    async (input: CreateShoppingListInput) => {
      const result = await wrapMutation(() => kaimonoService.createList(input));
      return { id: result.id, shareCode: result.shareCode };
    },
    [wrapMutation]
  );

  const updateList = useCallback(
    async (listId: string, input: UpdateShoppingListInput) => {
      await wrapMutation(() => kaimonoService.updateList(listId, input));
    },
    [wrapMutation]
  );

  const deleteList = useCallback(
    async (listId: string) => {
      await wrapMutation(() => kaimonoService.deleteList(listId));
    },
    [wrapMutation]
  );

  const addItems = useCallback(
    async (listId: string, items: CreateShoppingItemInput[]) => {
      const result = await wrapMutation(() => kaimonoService.addItems(listId, items));
      return { ids: result.ids };
    },
    [wrapMutation]
  );

  const updateItem = useCallback(
    async (listId: string, itemId: string, input: UpdateShoppingItemInput) => {
      await wrapMutation(() => kaimonoService.updateItem(listId, itemId, input));
    },
    [wrapMutation]
  );

  const deleteItem = useCallback(
    async (listId: string, itemId: string) => {
      await wrapMutation(() => kaimonoService.deleteItem(listId, itemId));
    },
    [wrapMutation]
  );

  const toggleItem = useCallback(
    async (listId: string, itemId: string) => {
      const result = await wrapMutation(() => kaimonoService.toggleItem(listId, itemId));
      return { isPurchased: result.isPurchased };
    },
    [wrapMutation]
  );

  const createRecurring = useCallback(
    async (input: CreateRecurringItemInput) => {
      const result = await wrapMutation(() => kaimonoService.createRecurringItem(input));
      return { id: result.id };
    },
    [wrapMutation]
  );

  const updateRecurring = useCallback(
    async (itemId: string, input: UpdateRecurringItemInput) => {
      await wrapMutation(() => kaimonoService.updateRecurringItem(itemId, input));
    },
    [wrapMutation]
  );

  const deleteRecurring = useCallback(
    async (itemId: string) => {
      await wrapMutation(() => kaimonoService.deleteRecurringItem(itemId));
    },
    [wrapMutation]
  );

  const generateQRCode = useCallback(
    async (listId: string) => {
      return await wrapMutation(() => kaimonoService.generateQRCode(listId));
    },
    [wrapMutation]
  );

  return {
    createList,
    updateList,
    deleteList,
    addItems,
    updateItem,
    deleteItem,
    toggleItem,
    createRecurring,
    updateRecurring,
    deleteRecurring,
    generateQRCode,
    loading,
    error,
  };
}
