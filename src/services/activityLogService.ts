/**
 * Activity Log Service — frontend API client.
 * Schema mirrors backend `functions/src/activityLog/types.ts`.
 */
import { auth } from '@/lib/firebaseConnect';

export type ActivitySource = 'cloud_function' | 'next_api' | 'client';
export type ActivityResult = 'success' | 'error';
export type ActivityCategory = 'query' | 'mutation';
export type ActivitySeverity = 'warning' | 'error' | 'critical';
export type ActivityEnv = 'dev' | 'prod';

export interface ActivityLogEntry {
  id: string;
  agent_uid: string;
  agent_email?: string;
  agent_name?: string;
  is_anonymous: boolean;
  session_id?: string;

  action: string;
  category: ActivityCategory;
  params: Record<string, unknown>;
  request_id: string;
  ip_address?: string;
  target_uid?: string;

  result: ActivityResult;
  severity?: ActivitySeverity;
  error_message?: string;
  error_details?: Record<string, unknown>;

  source: ActivitySource;
  env: ActivityEnv;
  app_version?: string;
  app_build_sha?: string;

  created_at: string;
}

export interface ActivityLogFilters {
  agent_uid?: string;
  agent_email?: string;
  session_id?: string;
  action?: string;
  result?: ActivityResult;
  category?: ActivityCategory;
  severity?: ActivitySeverity;
  env?: ActivityEnv;
  source?: ActivitySource;
  is_anonymous?: boolean;
  request_id?: string;
  target_uid?: string;
  start_date?: string;
  end_date?: string;
  limit?: number;
  offset_doc_id?: string;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) return {};
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

export async function getActivityLogs(
  filters: ActivityLogFilters = {}
): Promise<ActivityLogEntry[]> {
  const headers = await getAuthHeaders();
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }

  const url = `/api/activity-logs${params.toString() ? `?${params}` : ''}`;
  const response = await fetch(url, { headers });
  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Failed to fetch activity logs');
  }

  return data.logs;
}

// ---------------------------------------------------------------------------
// Traffic (admin Overview tab)
// ---------------------------------------------------------------------------

export type TrafficGranularity = 'day' | 'week' | 'month' | 'year';

export interface TrafficSeriesPoint {
  bucket: string;
  count: number;
}

export interface TrafficSeries {
  key: string;
  label: string;
  total: number;
  points: TrafficSeriesPoint[];
}

export interface ActivityLogTraffic {
  buckets: Array<{ key: string; label: string }>;
  granularity: TrafficGranularity;
  total: TrafficSeries;
  by_result: TrafficSeries[];
  by_severity: TrafficSeries[];
  by_source: TrafficSeries[];
}

export interface TrafficFilters {
  agent_uid?: string;
  agent_email?: string;
  action?: string;
  category?: ActivityCategory;
  env?: ActivityEnv;
  source?: ActivitySource;
  is_anonymous?: boolean;
  target_uid?: string;
  start_date?: string;
  end_date?: string;
  granularity?: TrafficGranularity;
}

export async function getActivityLogTraffic(
  filters: TrafficFilters = {}
): Promise<ActivityLogTraffic> {
  const headers = await getAuthHeaders();
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const url = `/api/activity-logs/traffic${params.toString() ? `?${params}` : ''}`;
  const response = await fetch(url, { headers });
  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Failed to fetch activity log traffic');
  }
  return data.traffic;
}
