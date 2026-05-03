/**
 * Client-side activity log helper.
 *
 * Fire-and-forget — never throws, never blocks. Posts to the Next.js
 * proxy at /api/activity-logs/log which forwards to the Cloud Function
 * `logClientActivity` with the user's Firebase ID token attached.
 *
 * Generates a `request_id` per call (12 hex chars, matches backend format)
 * so client events get the same kind of trace ID as Cloud Function calls.
 */

import { auth, ensureSignedIn } from '@/lib/firebaseConnect';
import { APP_BUILD_SHA, APP_VERSION } from '@/lib/buildInfo';

export type ActivityResult = 'success' | 'error';
export type ActivitySeverity = 'warning' | 'error' | 'critical';

export interface ClientActivityEntry {
  action: string;                                  // 'client.page_view', 'game.tetris.start', etc.
  result?: ActivityResult;                         // default 'success'
  severity?: ActivitySeverity;                     // required when result === 'error'
  params?: Record<string, unknown>;
  error_message?: string;
  error_details?: Record<string, unknown>;
  request_id?: string;                             // optional — auto-generated if absent
}

function generateRequestId(): string {
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return Math.random().toString(16).slice(2, 14).padEnd(12, '0');
}

async function getAuthHeader(): Promise<Record<string, string>> {
  await ensureSignedIn();
  const user = auth.currentUser;
  if (!user) return {};
  try {
    const token = await user.getIdToken();
    return { Authorization: `Bearer ${token}` };
  } catch {
    return {};
  }
}

/**
 * Fire-and-forget client-side activity log.
 * Safe to call from any browser context (SSR no-ops).
 */
export function logActivity(entry: ClientActivityEntry): void {
  if (typeof window === 'undefined') return;

  const requestId = entry.request_id ?? generateRequestId();

  void (async () => {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(await getAuthHeader()),
      };
      const body = JSON.stringify({
        action: entry.action,
        source: 'client',
        result: entry.result ?? 'success',
        severity: entry.severity,
        params: entry.params,
        error_message: entry.error_message,
        error_details: entry.error_details,
        request_id: requestId,
        app_version: APP_VERSION,
        app_build_sha: APP_BUILD_SHA,
      });

      // sendBeacon survives unload (good for game.abandon on beforeunload)
      // but doesn't allow custom headers — fall through to fetch when auth
      // header is needed.
      if (
        entry.action.endsWith('.abandon') &&
        navigator.sendBeacon &&
        Object.keys(headers).length === 1
      ) {
        const blob = new Blob([body], { type: 'application/json' });
        navigator.sendBeacon('/api/activity-logs/log', blob);
        return;
      }

      await fetch('/api/activity-logs/log', {
        method: 'POST',
        headers,
        body,
        keepalive: true,
      });
    } catch {
      // Logging failures must never break the app
    }
  })();
}
