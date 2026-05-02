/**
 * Compatibility shim — forwards legacy `logApiError` / `logCloudFunctionError`
 * calls into the new unified `activity_logs` system via the
 * `logClientActivity` Cloud Function with `source: 'next_api'`.
 *
 * Existing API routes that import from this file keep working unchanged.
 * For new code, import `logActivity` from `@/lib/activityLog` (client-side)
 * or call `logClientActivity` directly (server-side).
 */

import { getCloudFunctionUrl } from '../constants';
import { ErrorSeverity, ErrorSource } from '@/types/errors';

interface LogErrorParams {
  source?: ErrorSource;
  severity?: ErrorSeverity;
  errorType: string;
  message: string;
  details?: string;
  stack?: string;
  functionName?: string;
  endpoint?: string;
  metadata?: Record<string, unknown>;
  request_id?: string;
}

/** Map legacy 4-level severity → atlas-style 3-level severity. */
function mapSeverity(s?: ErrorSeverity): 'warning' | 'error' | 'critical' {
  switch (s) {
    case ErrorSeverity.LOW: return 'warning';
    case ErrorSeverity.CRITICAL: return 'critical';
    default: return 'error';
  }
}

function generateRequestId(): string {
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return Math.random().toString(16).slice(2, 14).padEnd(12, '0');
}

/**
 * Log an error from a Next.js API route. Fire-and-forget.
 */
export async function logApiError(params: LogErrorParams): Promise<void> {
  try {
    const action = params.functionName
      ? `next_api.${params.functionName}`
      : params.endpoint
        ? `next_api.${params.endpoint}`
        : 'next_api.unknown';

    fetch(getCloudFunctionUrl('logClientActivity'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        source: 'next_api',
        result: 'error',
        severity: mapSeverity(params.severity),
        request_id: params.request_id ?? generateRequestId(),
        params: {
          errorType: params.errorType,
          endpoint: params.endpoint,
          ...params.metadata,
        },
        error_message: params.message,
        error_details: {
          details: params.details,
          stack: params.stack,
          legacy_source: params.source,
        },
      }),
    }).catch((err) => {
      console.error('[errorLogger shim] forward failed:', err);
    });
  } catch (err) {
    console.error('[errorLogger shim] failed:', err);
  }
}

/**
 * Log a Cloud Function error response from a Next.js API route.
 */
export async function logCloudFunctionError(params: {
  functionName: string;
  endpoint: string;
  response: { status: number; error?: string; details?: string; message?: string };
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await logApiError({
    source: ErrorSource.CLOUD_FUNCTION,
    severity: params.response.details?.includes('index') ? ErrorSeverity.HIGH : ErrorSeverity.MEDIUM,
    errorType: `CloudFunction:${params.functionName}`,
    message: params.response.error || 'Cloud Function error',
    details: params.response.details || params.response.message,
    endpoint: params.endpoint,
    functionName: params.functionName,
    metadata: { status: params.response.status, ...params.metadata },
  });
}

/**
 * Wrap a route handler with automatic error logging on unhandled rejection.
 */
export function withErrorLogging<T>(endpoint: string, handler: () => Promise<T>): Promise<T> {
  return handler().catch(async (error) => {
    await logApiError({
      severity: ErrorSeverity.HIGH,
      errorType: 'APIRoute:UnhandledException',
      message: error instanceof Error ? error.message : 'Unknown error',
      details: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      endpoint,
    });
    throw error;
  });
}
