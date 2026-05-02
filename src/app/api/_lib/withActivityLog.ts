/**
 * Server-side wrapper for Next.js App Router route handlers.
 * Captures every request → fire-and-forget POST to the `logClientActivity`
 * Cloud Function with `source: 'next_api'`.
 *
 * Usage:
 *   import { withActivityLog } from '@/app/api/_lib/withActivityLog';
 *
 *   export const GET = withActivityLog('next_api.post.GET', async (req, ctx) => {
 *     return NextResponse.json(...);
 *   });
 *
 * Errors thrown by the inner handler are caught, logged with severity='error',
 * and converted to a 500 response with the request_id surfaced in the body.
 *
 * Logging never blocks the response — the activity log POST runs after the
 * response is returned, and failures are swallowed.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCloudFunctionUrl } from '../constants';
import { APP_BUILD_SHA, APP_VERSION } from '@/lib/buildInfo';

// Generic over context shape so dynamic route handlers (whose context is
// `{ params: Promise<{ [key]: string }> }` in Next.js 15) and static
// handlers (no second arg) both type-check unchanged.
// Return type permits `undefined` to accommodate handlers that fall through
// without returning (a latent bug Next.js would surface anyway). The wrapper
// converts undefined into an explicit 500 with the request_id.
type RouteHandler<C = unknown> = (
  request: NextRequest,
  context: C,
) => Promise<Response | undefined> | Response | undefined;

function generateRequestId(): string {
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return Math.random().toString(16).slice(2, 14).padEnd(12, '0');
}

function fireAndForgetLog(payload: Record<string, unknown>, authHeader?: string): void {
  void (async () => {
    try {
      await fetch(getCloudFunctionUrl('logClientActivity'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authHeader && { Authorization: authHeader }),
        },
        body: JSON.stringify(payload),
      });
    } catch {
      // Logging failure must never break the response
    }
  })();
}

export function withActivityLog<C>(action: string, handler: RouteHandler<C>): RouteHandler<C> {
  return async (request, context) => {
    const requestId = generateRequestId();
    const startTime = Date.now();
    const url = new URL(request.url);
    const authHeader = request.headers.get('authorization') ?? undefined;
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0].trim()
      ?? request.headers.get('x-real-ip')
      ?? undefined;

    let response: Response;
    let isError = false;
    let errorMessage: string | undefined;
    let stack: string | undefined;

    try {
      const handlerResult = await handler(request, context);
      if (handlerResult) {
        response = handlerResult;
        isError = response.status >= 400;
      } else {
        // Handler fell through without returning — treat as bug, surface 500.
        isError = true;
        errorMessage = 'Route handler returned no response';
        response = NextResponse.json(
          { error: errorMessage, request_id: requestId },
          { status: 500 },
        );
      }
    } catch (err) {
      isError = true;
      errorMessage = err instanceof Error ? err.message : String(err);
      stack = err instanceof Error ? err.stack : undefined;
      response = NextResponse.json(
        { error: 'Internal server error', request_id: requestId },
        { status: 500 },
      );
    }

    fireAndForgetLog(
      {
        action,
        source: 'next_api',
        request_id: requestId,
        result: isError ? 'error' : 'success',
        severity: isError ? 'error' : undefined,
        params: {
          path: url.pathname,
          method: request.method,
          ip,
        },
        error_message: errorMessage,
        error_details: isError
          ? {
              status_code: response.status,
              duration_ms: Date.now() - startTime,
              stack,
            }
          : undefined,
        app_version: APP_VERSION,
        app_build_sha: APP_BUILD_SHA,
      },
      authHeader,
    );

    return response;
  };
}
