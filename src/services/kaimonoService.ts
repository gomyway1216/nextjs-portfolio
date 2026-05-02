import { auth } from '@/lib/firebaseConnect';
import type {
  ShoppingList,
  ShoppingListsResponse,
  CreateShoppingListInput,
  UpdateShoppingListInput,
  CreateShoppingListResponse,
  CreateShoppingItemInput,
  UpdateShoppingItemInput,
  HistoryResponse,
  FrequentItemsResponse,
  RecurringItemsResponse,
  CreateRecurringItemInput,
  UpdateRecurringItemInput,
  QRCodeResponse,
} from '@/types/kaimono';

const BASE_URL = '/api/kaimono';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) return {};
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

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
// LISTS
// ============================================================================

export async function getLists(): Promise<ShoppingListsResponse> {
  return apiCall<ShoppingListsResponse>(`${BASE_URL}/lists`);
}

export async function getList(listId: string, verified = false): Promise<ShoppingList> {
  const url = verified ? `${BASE_URL}/lists/${listId}?verified=true` : `${BASE_URL}/lists/${listId}`;
  return apiCall<ShoppingList>(url);
}

export async function getListByShareCode(shareCode: string): Promise<ShoppingList> {
  return apiCall<ShoppingList>(`${BASE_URL}/share/${shareCode}`);
}

export async function createList(input: CreateShoppingListInput): Promise<CreateShoppingListResponse> {
  return apiCall<CreateShoppingListResponse>(`${BASE_URL}/lists`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateList(
  listId: string,
  input: UpdateShoppingListInput
): Promise<{ message: string }> {
  return apiCall<{ message: string }>(`${BASE_URL}/lists/${listId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export async function deleteList(listId: string): Promise<{ message: string }> {
  return apiCall<{ message: string }>(`${BASE_URL}/lists/${listId}`, {
    method: 'DELETE',
  });
}

export async function verifyPasscode(
  listId: string,
  passcode: string
): Promise<{ verified: boolean }> {
  return apiCall<{ verified: boolean }>(`${BASE_URL}/lists/${listId}/verify`, {
    method: 'POST',
    body: JSON.stringify({ passcode }),
  });
}

// ============================================================================
// ITEMS
// ============================================================================

export async function addItems(
  listId: string,
  items: CreateShoppingItemInput[]
): Promise<{ ids: string[]; message: string }> {
  return apiCall<{ ids: string[]; message: string }>(
    `${BASE_URL}/lists/${listId}/items`,
    {
      method: 'POST',
      body: JSON.stringify({ items }),
    }
  );
}

export async function updateItem(
  listId: string,
  itemId: string,
  input: UpdateShoppingItemInput
): Promise<{ message: string }> {
  return apiCall<{ message: string }>(
    `${BASE_URL}/lists/${listId}/items/${itemId}`,
    {
      method: 'PUT',
      body: JSON.stringify(input),
    }
  );
}

export async function deleteItem(
  listId: string,
  itemId: string
): Promise<{ message: string }> {
  return apiCall<{ message: string }>(
    `${BASE_URL}/lists/${listId}/items/${itemId}`,
    {
      method: 'DELETE',
    }
  );
}

export async function toggleItem(
  listId: string,
  itemId: string
): Promise<{ isPurchased: boolean; message: string }> {
  return apiCall<{ isPurchased: boolean; message: string }>(
    `${BASE_URL}/lists/${listId}/items/${itemId}/toggle`,
    {
      method: 'PATCH',
    }
  );
}

// ============================================================================
// HISTORY
// ============================================================================

export async function getHistory(): Promise<HistoryResponse> {
  return apiCall<HistoryResponse>(`${BASE_URL}/history`);
}

// ============================================================================
// FREQUENT ITEMS
// ============================================================================

export async function getFrequentItems(): Promise<FrequentItemsResponse> {
  return apiCall<FrequentItemsResponse>(`${BASE_URL}/frequent-items`);
}

// ============================================================================
// RECURRING ITEMS
// ============================================================================

export async function getRecurringItems(): Promise<RecurringItemsResponse> {
  return apiCall<RecurringItemsResponse>(`${BASE_URL}/recurring`);
}

export async function getDueRecurringItems(): Promise<RecurringItemsResponse> {
  return apiCall<RecurringItemsResponse>(`${BASE_URL}/recurring/due`);
}

export async function createRecurringItem(
  input: CreateRecurringItemInput
): Promise<{ id: string; message: string }> {
  return apiCall<{ id: string; message: string }>(`${BASE_URL}/recurring`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateRecurringItem(
  itemId: string,
  input: UpdateRecurringItemInput
): Promise<{ message: string }> {
  return apiCall<{ message: string }>(`${BASE_URL}/recurring/${itemId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export async function deleteRecurringItem(
  itemId: string
): Promise<{ message: string }> {
  return apiCall<{ message: string }>(`${BASE_URL}/recurring/${itemId}`, {
    method: 'DELETE',
  });
}

// ============================================================================
// QR CODE
// ============================================================================

export async function generateQRCode(listId: string): Promise<QRCodeResponse> {
  return apiCall<QRCodeResponse>(`${BASE_URL}/qrcode`, {
    method: 'POST',
    body: JSON.stringify({ groupId: listId }),
  });
}
