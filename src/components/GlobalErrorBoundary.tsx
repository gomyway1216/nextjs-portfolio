'use client';

import { useEffect } from 'react';
import { logActivity } from '@/lib/activityLog';

/**
 * Installs window.onerror + unhandledrejection listeners that route every
 * uncaught client-side exception into activity_logs as a `client.global_error`
 * row with severity='error'.
 *
 * Mount once near the root of the app. No UI — purely a side-effect installer.
 */
export default function GlobalErrorBoundary() {
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      logActivity({
        action: 'client.global_error',
        result: 'error',
        severity: 'error',
        error_message: event.message || 'Uncaught error',
        error_details: {
          source: event.filename,
          line: event.lineno,
          column: event.colno,
          stack: event.error instanceof Error ? event.error.stack : undefined,
        },
        params: { url: window.location.href },
      });
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message =
        reason instanceof Error
          ? reason.message
          : typeof reason === 'string'
            ? reason
            : 'Unhandled promise rejection';
      logActivity({
        action: 'client.unhandled_rejection',
        result: 'error',
        severity: 'error',
        error_message: message,
        error_details: {
          stack: reason instanceof Error ? reason.stack : undefined,
        },
        params: { url: window.location.href },
      });
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  return null;
}
