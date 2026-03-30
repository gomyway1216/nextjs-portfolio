/**
 * Activity Log Service — frontend API client.
 */
import { auth } from '@/lib/firebaseConnect';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ActivityLogEntry {
  id: string;
  user_uid: string;
  user_email: string;
  action: string;
  category: 'query' | 'mutation';
  params: Record<string, unknown>;
  request_id: string;
  result: 'success' | 'error';
  error_message?: string;
  error_details?: Record<string, unknown>;
  ip_address?: string;
  created_at: string;
}

export interface ActivityLogFilters {
  action?: string;
  result?: 'success' | 'error';
  category?: 'query' | 'mutation';
  request_id?: string;
  start_date?: string;
  end_date?: string;
  limit?: number;
  offset_doc_id?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getAuthHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) return {};
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export async function getActivityLogs(
  filters: ActivityLogFilters = {}
): Promise<ActivityLogEntry[]> {
  const headers = await getAuthHeaders();
  const params = new URLSearchParams();

  if (filters.action) params.set('action', filters.action);
  if (filters.result) params.set('result', filters.result);
  if (filters.category) params.set('category', filters.category);
  if (filters.request_id) params.set('request_id', filters.request_id);
  if (filters.start_date) params.set('start_date', filters.start_date);
  if (filters.end_date) params.set('end_date', filters.end_date);
  if (filters.limit) params.set('limit', String(filters.limit));
  if (filters.offset_doc_id) params.set('offset_doc_id', filters.offset_doc_id);

  const url = `/api/activity-logs${params.toString() ? `?${params}` : ''}`;
  const response = await fetch(url, { headers });
  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Failed to fetch activity logs');
  }

  return data.logs;
}
