/**
 * Lifecycle activity tracking helpers for client features (games, tools, etc.)
 *
 * Two patterns:
 *   useFeatureLifecycle(action, params)
 *     Logs `<action>.start` on mount, `<action>.complete` on unmount with
 *     duration_ms. Optional `complete()` and `abandon()` callbacks let the
 *     feature signal explicit outcome with a score / result payload.
 *
 *   trackEvent(action, params)
 *     One-off helper for discrete events (button click, level cleared,
 *     image uploaded). Thin wrapper over logActivity.
 */

import { useCallback, useEffect, useRef } from 'react';
import { logActivity, type ClientActivityEntry } from '@/lib/activityLog';

export interface FeatureLifecycle {
  /** Mark the feature as completed with an optional result payload (score, etc). */
  complete: (params?: Record<string, unknown>) => void;
  /** Mark the feature as abandoned (user navigated away mid-session). */
  abandon: (params?: Record<string, unknown>) => void;
  /** Log a discrete event scoped to this feature (action will be prefixed). */
  trackEvent: (subAction: string, params?: Record<string, unknown>) => void;
}

/**
 * Use at the top of a feature page/component.
 *   const { complete, trackEvent } = useFeatureLifecycle('game.tetris', { mode: 'classic' });
 *
 * Logs:
 *   game.tetris.start  — on mount
 *   game.tetris.complete or game.tetris.abandon — on unmount (whichever was called)
 */
export function useFeatureLifecycle(
  action: string,
  params?: Record<string, unknown>,
): FeatureLifecycle {
  const startedAtRef = useRef<number>(0);
  const settledRef = useRef<boolean>(false);
  const startParamsRef = useRef<Record<string, unknown> | undefined>(params);

  useEffect(() => {
    const startedAt = Date.now();
    const startParams = startParamsRef.current;
    startedAtRef.current = startedAt;
    settledRef.current = false;
    logActivity({ action: `${action}.start`, params: startParams });

    return () => {
      if (settledRef.current) return;
      // Component unmounted without explicit complete/abandon — treat as abandon.
      logActivity({
        action: `${action}.abandon`,
        params: { ...startParams, duration_ms: Date.now() - startedAt, reason: 'unmount' },
      });
    };
  }, [action]);

  const complete = useCallback(
    (extra?: Record<string, unknown>) => {
      if (settledRef.current) return;
      settledRef.current = true;
      const duration_ms = Date.now() - startedAtRef.current;
      logActivity({
        action: `${action}.complete`,
        params: { ...startParamsRef.current, duration_ms, ...extra },
      });
    },
    [action],
  );

  const abandon = useCallback(
    (extra?: Record<string, unknown>) => {
      if (settledRef.current) return;
      settledRef.current = true;
      const duration_ms = Date.now() - startedAtRef.current;
      logActivity({
        action: `${action}.abandon`,
        params: { ...startParamsRef.current, duration_ms, ...extra },
      });
    },
    [action],
  );

  const trackEvent = useCallback(
    (subAction: string, extra?: Record<string, unknown>) => {
      logActivity({ action: `${action}.${subAction}`, params: extra });
    },
    [action],
  );

  return { complete, abandon, trackEvent };
}

/** One-off discrete event log. Pass a fully-qualified action name. */
export function trackEvent(action: string, params?: Record<string, unknown>): void {
  logActivity({ action, params });
}

/** Re-export the underlying logActivity for ad-hoc cases. */
export { logActivity };
export type { ClientActivityEntry };
