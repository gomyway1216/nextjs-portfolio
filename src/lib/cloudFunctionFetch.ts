/**
 * Wrapper around fetch() for Cloud Function calls. Auto-attaches build
 * metadata headers (`x-app-version`, `x-app-build-sha`) so every backend
 * call gets correlated to a deploy in activity_logs.
 *
 * Use this instead of raw fetch() for any client → Cloud Function call.
 * Existing callers can migrate incrementally — non-migrated calls just
 * skip the header (no breakage).
 */

import { APP_BUILD_SHA, APP_VERSION } from './buildInfo';

export async function fetchCloudFunction(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has('x-app-version')) headers.set('x-app-version', APP_VERSION);
  if (!headers.has('x-app-build-sha')) headers.set('x-app-build-sha', APP_BUILD_SHA);
  return fetch(url, { ...init, headers });
}
