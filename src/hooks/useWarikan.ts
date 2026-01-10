'use client';

import { useState, useEffect, useCallback } from 'react';
import * as warikanService from '@/services/warikanService';
import type {
  WarikanGroup,
  Payment,
  SettlementCalculation,
  UserHistory,
  CreateGroupInput,
  UpdateGroupInput,
  CreateMemberInput,
  UpdateMemberInput,
  CreatePaymentInput,
  UpdatePaymentInput,
  QRCodeResponse,
} from '@/types/warikan';

// ============================================================================
// useWarikanGroup - Single group management
// ============================================================================

interface UseWarikanGroupResult {
  group: WarikanGroup | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useWarikanGroup(groupId: string | null): UseWarikanGroupResult {
  const [group, setGroup] = useState<WarikanGroup | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchGroup = useCallback(async () => {
    if (!groupId) {
      setGroup(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await warikanService.getGroup(groupId);
      setGroup(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch group');
      setGroup(null);
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    fetchGroup();
  }, [fetchGroup]);

  return { group, loading, error, refetch: fetchGroup };
}

// ============================================================================
// useWarikanGroupByShareCode - Get group by share code
// ============================================================================

export function useWarikanGroupByShareCode(
  shareCode: string | null
): UseWarikanGroupResult {
  const [group, setGroup] = useState<WarikanGroup | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchGroup = useCallback(async () => {
    if (!shareCode) {
      setGroup(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await warikanService.getGroupByShareCode(shareCode);
      setGroup(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch group');
      setGroup(null);
    } finally {
      setLoading(false);
    }
  }, [shareCode]);

  useEffect(() => {
    fetchGroup();
  }, [fetchGroup]);

  return { group, loading, error, refetch: fetchGroup };
}

// ============================================================================
// useWarikanPayments - Payments for a group
// ============================================================================

interface UseWarikanPaymentsResult {
  payments: Payment[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useWarikanPayments(groupId: string | null): UseWarikanPaymentsResult {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPayments = useCallback(async () => {
    if (!groupId) {
      setPayments([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await warikanService.getPayments(groupId);
      setPayments(data.payments);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch payments');
      setPayments([]);
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  return { payments, loading, error, refetch: fetchPayments };
}

// ============================================================================
// useWarikanSettlements - Settlement calculation
// ============================================================================

interface UseWarikanSettlementsResult {
  settlements: SettlementCalculation | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useWarikanSettlements(
  groupId: string | null
): UseWarikanSettlementsResult {
  const [settlements, setSettlements] = useState<SettlementCalculation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSettlements = useCallback(async () => {
    if (!groupId) {
      setSettlements(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await warikanService.calculateSettlements(groupId);
      setSettlements(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to calculate settlements');
      setSettlements(null);
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    fetchSettlements();
  }, [fetchSettlements]);

  return { settlements, loading, error, refetch: fetchSettlements };
}

// ============================================================================
// useWarikanHistory - User history (logged in)
// ============================================================================

interface UseWarikanHistoryResult {
  history: UserHistory[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useWarikanHistory(): UseWarikanHistoryResult {
  const [history, setHistory] = useState<UserHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await warikanService.getUserHistory();
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
// useWarikanMutations - CRUD operations
// ============================================================================

interface UseWarikanMutationsResult {
  // Groups
  createGroup: (input: CreateGroupInput) => Promise<{ id: string; shareCode: string }>;
  updateGroup: (groupId: string, input: UpdateGroupInput) => Promise<void>;
  deleteGroup: (groupId: string) => Promise<void>;

  // Members
  addMember: (groupId: string, input: CreateMemberInput) => Promise<{ id: string }>;
  updateMember: (groupId: string, memberId: string, input: UpdateMemberInput) => Promise<void>;
  removeMember: (groupId: string, memberId: string) => Promise<void>;

  // Payments
  createPayment: (input: CreatePaymentInput) => Promise<{ id: string }>;
  updatePayment: (groupId: string, paymentId: string, input: UpdatePaymentInput) => Promise<void>;
  deletePayment: (groupId: string, paymentId: string) => Promise<void>;

  // QR Code
  generateQRCode: (groupId: string) => Promise<QRCodeResponse>;

  // State
  loading: boolean;
  error: string | null;
}

export function useWarikanMutations(): UseWarikanMutationsResult {
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

  // Groups
  const createGroup = useCallback(
    async (input: CreateGroupInput) => {
      const result = await wrapMutation(() => warikanService.createGroup(input));
      return { id: result.id, shareCode: result.shareCode };
    },
    [wrapMutation]
  );

  const updateGroup = useCallback(
    async (groupId: string, input: UpdateGroupInput) => {
      await wrapMutation(() => warikanService.updateGroup(groupId, input));
    },
    [wrapMutation]
  );

  const deleteGroup = useCallback(
    async (groupId: string) => {
      await wrapMutation(() => warikanService.deleteGroup(groupId));
    },
    [wrapMutation]
  );

  // Members
  const addMember = useCallback(
    async (groupId: string, input: CreateMemberInput) => {
      const result = await wrapMutation(() =>
        warikanService.addMember(groupId, input)
      );
      return { id: result.id };
    },
    [wrapMutation]
  );

  const updateMember = useCallback(
    async (groupId: string, memberId: string, input: UpdateMemberInput) => {
      await wrapMutation(() =>
        warikanService.updateMember(groupId, memberId, input)
      );
    },
    [wrapMutation]
  );

  const removeMember = useCallback(
    async (groupId: string, memberId: string) => {
      await wrapMutation(() => warikanService.removeMember(groupId, memberId));
    },
    [wrapMutation]
  );

  // Payments
  const createPayment = useCallback(
    async (input: CreatePaymentInput) => {
      const result = await wrapMutation(() =>
        warikanService.createPayment(input)
      );
      return { id: result.id };
    },
    [wrapMutation]
  );

  const updatePayment = useCallback(
    async (groupId: string, paymentId: string, input: UpdatePaymentInput) => {
      await wrapMutation(() =>
        warikanService.updatePayment(groupId, paymentId, input)
      );
    },
    [wrapMutation]
  );

  const deletePayment = useCallback(
    async (groupId: string, paymentId: string) => {
      await wrapMutation(() => warikanService.deletePayment(groupId, paymentId));
    },
    [wrapMutation]
  );

  // QR Code
  const generateQRCode = useCallback(
    async (groupId: string) => {
      return await wrapMutation(() => warikanService.generateQRCode(groupId));
    },
    [wrapMutation]
  );

  return {
    createGroup,
    updateGroup,
    deleteGroup,
    addMember,
    updateMember,
    removeMember,
    createPayment,
    updatePayment,
    deletePayment,
    generateQRCode,
    loading,
    error,
  };
}
