/**
 * Compatibility shim — the old enums are kept so existing API routes that
 * pass `severity: ErrorSeverity.HIGH` etc. keep compiling. The shim in
 * `app/api/utils/errorLogger.ts` maps these values to the atlas-style
 * `'warning' | 'error' | 'critical'` severity stored in `activity_logs`.
 *
 * For new code, prefer importing from `@/services/activityLogService`:
 *   import type { ActivitySeverity } from '@/services/activityLogService';
 */

export enum ErrorSource {
  FRONTEND = 'frontend',
  CLOUD_FUNCTION = 'cloud_function',
  API_ROUTE = 'api_route',
}

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}
