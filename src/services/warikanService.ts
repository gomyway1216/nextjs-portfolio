import { auth } from '@/lib/firebaseConnect';
import type {
  WarikanGroup,
  GroupsResponse,
  CreateGroupInput,
  UpdateGroupInput,
  CreateGroupResponse,
  CreateMemberInput,
  UpdateMemberInput,
  Payment,
  PaymentsResponse,
  CreatePaymentInput,
  UpdatePaymentInput,
  SettlementCalculation,
  HistoryResponse,
  QRCodeResponse,
} from '@/types/warikan';

const BASE_URL = '/api/warikan';

// Helper to get auth headers (returns empty object if not logged in)
async function getAuthHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) return {};
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

// Helper for API calls
async function apiCall<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = await getAuthHeaders();

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
      ...options.headers,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'API request failed');
  }

  return data;
}

// ============================================================================
// GROUPS
// ============================================================================

export async function getGroups(): Promise<GroupsResponse> {
  return apiCall<GroupsResponse>(`${BASE_URL}/groups`);
}

export async function getGroup(groupId: string): Promise<WarikanGroup> {
  return apiCall<WarikanGroup>(`${BASE_URL}/groups/${groupId}`);
}

export async function getGroupByShareCode(shareCode: string): Promise<WarikanGroup> {
  return apiCall<WarikanGroup>(`${BASE_URL}/groups/share/${shareCode}`);
}

export async function createGroup(input: CreateGroupInput): Promise<CreateGroupResponse> {
  return apiCall<CreateGroupResponse>(`${BASE_URL}/groups`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateGroup(
  groupId: string,
  input: UpdateGroupInput
): Promise<{ message: string }> {
  return apiCall<{ message: string }>(`${BASE_URL}/groups/${groupId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export async function deleteGroup(groupId: string): Promise<{ message: string }> {
  return apiCall<{ message: string }>(`${BASE_URL}/groups/${groupId}`, {
    method: 'DELETE',
  });
}

// ============================================================================
// MEMBERS
// ============================================================================

export async function addMember(
  groupId: string,
  input: CreateMemberInput
): Promise<{ id: string; message: string }> {
  return apiCall<{ id: string; message: string }>(
    `${BASE_URL}/groups/${groupId}/members`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    }
  );
}

export async function updateMember(
  groupId: string,
  memberId: string,
  input: UpdateMemberInput
): Promise<{ message: string }> {
  return apiCall<{ message: string }>(
    `${BASE_URL}/groups/${groupId}/members/${memberId}`,
    {
      method: 'PUT',
      body: JSON.stringify(input),
    }
  );
}

export async function removeMember(
  groupId: string,
  memberId: string
): Promise<{ message: string }> {
  return apiCall<{ message: string }>(
    `${BASE_URL}/groups/${groupId}/members/${memberId}`,
    {
      method: 'DELETE',
    }
  );
}

// ============================================================================
// PAYMENTS
// ============================================================================

export async function getPayments(groupId: string): Promise<PaymentsResponse> {
  return apiCall<PaymentsResponse>(`${BASE_URL}/groups/${groupId}/payments`);
}

export async function getPayment(groupId: string, paymentId: string): Promise<Payment> {
  return apiCall<Payment>(`${BASE_URL}/groups/${groupId}/payments/${paymentId}`);
}

export async function createPayment(
  input: CreatePaymentInput
): Promise<{ id: string; message: string }> {
  return apiCall<{ id: string; message: string }>(
    `${BASE_URL}/groups/${input.groupId}/payments`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    }
  );
}

export async function updatePayment(
  groupId: string,
  paymentId: string,
  input: UpdatePaymentInput
): Promise<{ message: string }> {
  return apiCall<{ message: string }>(
    `${BASE_URL}/groups/${groupId}/payments/${paymentId}`,
    {
      method: 'PUT',
      body: JSON.stringify(input),
    }
  );
}

export async function deletePayment(
  groupId: string,
  paymentId: string
): Promise<{ message: string }> {
  return apiCall<{ message: string }>(
    `${BASE_URL}/groups/${groupId}/payments/${paymentId}`,
    {
      method: 'DELETE',
    }
  );
}

// ============================================================================
// SETTLEMENTS
// ============================================================================

export async function calculateSettlements(
  groupId: string
): Promise<SettlementCalculation> {
  return apiCall<SettlementCalculation>(
    `${BASE_URL}/groups/${groupId}/settlements`
  );
}

// ============================================================================
// HISTORY
// ============================================================================

export async function getUserHistory(): Promise<HistoryResponse> {
  return apiCall<HistoryResponse>(`${BASE_URL}/history`);
}

// ============================================================================
// QR CODE
// ============================================================================

export async function generateQRCode(groupId: string): Promise<QRCodeResponse> {
  return apiCall<QRCodeResponse>(`${BASE_URL}/qrcode`, {
    method: 'POST',
    body: JSON.stringify({ groupId }),
  });
}
