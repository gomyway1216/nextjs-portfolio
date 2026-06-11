'use client';

import { useState, useEffect, useCallback } from 'react';
import * as settliService from '@/services/settliService';
import type {
  SettliGroup,
  Payment,
  MultiCurrencySettlement,
  UserHistory,
  CreateGroupInput,
  UpdateGroupInput,
  CreateMemberInput,
  UpdateMemberInput,
  CreatePaymentInput,
  UpdatePaymentInput,
  QRCodeResponse,
} from '@/types/settli';

type PasscodeRequiredGroup = Pick<SettliGroup, 'id' | 'name'> & {
  requiresPasscode?: boolean;
};

// ============================================================================
// useSettliGroup - Single group management
// ============================================================================

interface UseSettliGroupResult {
  group: SettliGroup | null;
  loading: boolean;
  error: string | null;
  requiresPasscode: boolean;
  verifyPasscode: (passcode: string) => Promise<boolean>;
  refetch: () => Promise<void>;
}

export function useSettliGroup(groupId: string | null): UseSettliGroupResult {
  const [group, setGroup] = useState<SettliGroup | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requiresPasscode, setRequiresPasscode] = useState(false);
  // The verified passcode itself is the access proof the server checks
  // on every fetch (a boolean claim was bypassable).
  const [knownPasscode, setKnownPasscode] = useState<string | null>(null);

  const fetchGroup = useCallback(async () => {
    if (!groupId) {
      setGroup(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await settliService.getGroup(groupId, knownPasscode);

      // Check if passcode verification is required
      const passcodeData = data as SettliGroup | PasscodeRequiredGroup;
      if ('requiresPasscode' in passcodeData && passcodeData.requiresPasscode) {
        setRequiresPasscode(true);
        setGroup({
          id: passcodeData.id,
          name: passcodeData.name,
          hasPasscode: true,
        } as SettliGroup);
      } else {
        setRequiresPasscode(false);
        setGroup(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch group');
      setGroup(null);
    } finally {
      setLoading(false);
    }
  }, [groupId, knownPasscode]);

  const handleVerifyPasscode = useCallback(async (passcode: string): Promise<boolean> => {
    if (!groupId) return false;

    try {
      const result = await settliService.verifyPasscode(groupId, passcode);
      if (result.verified) {
        setKnownPasscode(passcode);
        setRequiresPasscode(false);
        // Refetch, proving the passcode to the server
        const data = await settliService.getGroup(groupId, passcode);
        setGroup(data);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [groupId]);

  useEffect(() => {
    fetchGroup();
  }, [fetchGroup]);

  return {
    group,
    loading,
    error,
    requiresPasscode,
    verifyPasscode: handleVerifyPasscode,
    refetch: fetchGroup
  };
}

// ============================================================================
// useSettliGroupByShareCode - Get group by share code
// ============================================================================

export function useSettliGroupByShareCode(
  shareCode: string | null
): UseSettliGroupResult {
  const [group, setGroup] = useState<SettliGroup | null>(null);
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
      const data = await settliService.getGroupByShareCode(shareCode);
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

  // Share code access doesn't require passcode verification (for now)
  const noOpVerify = useCallback(async (): Promise<boolean> => true, []);

  return {
    group,
    loading,
    error,
    requiresPasscode: false,
    verifyPasscode: noOpVerify,
    refetch: fetchGroup,
  };
}

// ============================================================================
// useSettliPayments - Payments for a group
// ============================================================================

interface UseSettliPaymentsResult {
  payments: Payment[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useSettliPayments(groupId: string | null): UseSettliPaymentsResult {
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
      const data = await settliService.getPayments(groupId);
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
// useSettliSettlements - Settlement calculation
// ============================================================================

interface UseSettliSettlementsResult {
  settlements: MultiCurrencySettlement | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useSettliSettlements(
  groupId: string | null
): UseSettliSettlementsResult {
  const [settlements, setSettlements] = useState<MultiCurrencySettlement | null>(null);
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
      const data = await settliService.calculateSettlements(groupId);
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
// useSettliHistory - User history (logged in)
// ============================================================================

interface UseSettliHistoryResult {
  history: UserHistory[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useSettliHistory(): UseSettliHistoryResult {
  const [history, setHistory] = useState<UserHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await settliService.getUserHistory();
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
// useSettliMutations - CRUD operations
// ============================================================================

interface UseSettliMutationsResult {
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

export function useSettliMutations(): UseSettliMutationsResult {
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
      const result = await wrapMutation(() => settliService.createGroup(input));
      return { id: result.id, shareCode: result.shareCode };
    },
    [wrapMutation]
  );

  const updateGroup = useCallback(
    async (groupId: string, input: UpdateGroupInput) => {
      await wrapMutation(() => settliService.updateGroup(groupId, input));
    },
    [wrapMutation]
  );

  const deleteGroup = useCallback(
    async (groupId: string) => {
      await wrapMutation(() => settliService.deleteGroup(groupId));
    },
    [wrapMutation]
  );

  // Members
  const addMember = useCallback(
    async (groupId: string, input: CreateMemberInput) => {
      const result = await wrapMutation(() =>
        settliService.addMember(groupId, input)
      );
      return { id: result.id };
    },
    [wrapMutation]
  );

  const updateMember = useCallback(
    async (groupId: string, memberId: string, input: UpdateMemberInput) => {
      await wrapMutation(() =>
        settliService.updateMember(groupId, memberId, input)
      );
    },
    [wrapMutation]
  );

  const removeMember = useCallback(
    async (groupId: string, memberId: string) => {
      await wrapMutation(() => settliService.removeMember(groupId, memberId));
    },
    [wrapMutation]
  );

  // Payments
  const createPayment = useCallback(
    async (input: CreatePaymentInput) => {
      const result = await wrapMutation(() =>
        settliService.createPayment(input)
      );
      return { id: result.id };
    },
    [wrapMutation]
  );

  const updatePayment = useCallback(
    async (groupId: string, paymentId: string, input: UpdatePaymentInput) => {
      await wrapMutation(() =>
        settliService.updatePayment(groupId, paymentId, input)
      );
    },
    [wrapMutation]
  );

  const deletePayment = useCallback(
    async (groupId: string, paymentId: string) => {
      await wrapMutation(() => settliService.deletePayment(groupId, paymentId));
    },
    [wrapMutation]
  );

  // QR Code
  const generateQRCode = useCallback(
    async (groupId: string) => {
      return await wrapMutation(() => settliService.generateQRCode(groupId));
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
