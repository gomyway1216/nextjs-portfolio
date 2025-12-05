// Server-side Error Logger for API Routes
import { getCloudFunctionUrl } from '../constants';
import { ErrorSource, ErrorSeverity } from '@/types/errors';

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
}

/**
 * Log an error to the error tracking system from an API route.
 * This is a fire-and-forget operation - it won't block the response.
 */
export async function logApiError(params: LogErrorParams): Promise<void> {
  try {
    const url = getCloudFunctionUrl('logAppError');

    // Fire and forget - don't await in production to avoid blocking
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        source: params.source || ErrorSource.API_ROUTE,
        severity: params.severity || ErrorSeverity.MEDIUM,
        errorType: params.errorType,
        message: params.message,
        details: params.details,
        stack: params.stack,
        functionName: params.functionName,
        endpoint: params.endpoint,
        metadata: params.metadata,
      }),
    }).catch((err) => {
      // Silently log to console if error logging fails
      console.error('[ErrorLogger] Failed to log error:', err);
    });
  } catch (err) {
    console.error('[ErrorLogger] Failed to log error:', err);
  }
}

/**
 * Log an error from a Cloud Function response.
 * Extracts error details from the Cloud Function's error response.
 */
export async function logCloudFunctionError(params: {
  functionName: string;
  endpoint: string;
  response: { status: number; error?: string; details?: string; message?: string };
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { functionName, endpoint, response, metadata } = params;

  // Determine severity based on error type
  let severity = ErrorSeverity.MEDIUM;
  if (response.details?.includes('index')) {
    severity = ErrorSeverity.HIGH; // Missing index errors are high priority
  }

  await logApiError({
    source: ErrorSource.CLOUD_FUNCTION,
    severity,
    errorType: `CloudFunction:${functionName}`,
    message: response.error || 'Cloud Function error',
    details: response.details || response.message,
    endpoint,
    functionName,
    metadata: {
      status: response.status,
      ...metadata,
    },
  });
}

/**
 * Helper to wrap API route handlers with automatic error logging.
 * Use this to easily add error logging to any API route.
 */
export function withErrorLogging<T>(
  endpoint: string,
  handler: () => Promise<T>
): Promise<T> {
  return handler().catch(async (error) => {
    await logApiError({
      severity: ErrorSeverity.HIGH,
      errorType: 'APIRoute:UnhandledException',
      message: error instanceof Error ? error.message : 'Unknown error',
      details: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      endpoint,
    });
    throw error; // Re-throw to let the route handle the response
  });
}
