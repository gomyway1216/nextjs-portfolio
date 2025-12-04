// Application-wide Error Service
import { auth } from '@/lib/firebaseConnect';
import { AppError, ErrorSource, ErrorSeverity } from '@/types/errors';

// Helper to get auth headers
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

  if (!response.ok || !data.success) {
    throw new Error(data.error || 'API request failed');
  }

  return data;
}

export async function getAppErrors(options: {
  resolved?: boolean;
  source?: ErrorSource;
  severity?: ErrorSeverity;
  limit?: number;
} = {}): Promise<AppError[]> {
  const params = new URLSearchParams();
  if (options.resolved !== undefined) params.set('resolved', String(options.resolved));
  if (options.source) params.set('source', options.source);
  if (options.severity) params.set('severity', options.severity);
  if (options.limit) params.set('limit', String(options.limit));

  const url = `/api/errors${params.toString() ? `?${params}` : ''}`;
  const data = await apiCall<{ success: boolean; errors: AppError[] }>(url);
  return data.errors;
}

export async function logAppError(error: {
  source: ErrorSource;
  severity?: ErrorSeverity;
  errorType: string;
  message: string;
  details?: string;
  stack?: string;
  functionName?: string;
  endpoint?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}): Promise<{ errorId: string; isNew: boolean }> {
  // Log errors without authentication requirement
  const response = await fetch('/api/errors', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(error),
  });

  const data = await response.json();
  if (!response.ok || !data.success) {
    console.error('Failed to log error:', data.error);
    throw new Error(data.error || 'Failed to log error');
  }
  return { errorId: data.errorId, isNew: data.isNew };
}

export async function resolveAppError(id: string): Promise<void> {
  await apiCall('/api/errors', {
    method: 'PUT',
    body: JSON.stringify({ id, action: 'resolve' }),
  });
}

export async function unresolveAppError(id: string): Promise<void> {
  await apiCall('/api/errors', {
    method: 'PUT',
    body: JSON.stringify({ id, action: 'unresolve' }),
  });
}

export async function deleteAppError(id: string): Promise<void> {
  await apiCall('/api/errors', {
    method: 'DELETE',
    body: JSON.stringify({ id }),
  });
}
