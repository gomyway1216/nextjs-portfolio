import type { RoomView } from './types';

export type SyncStop = 'idle' | 'expired' | null;
export const IDLE_STOP_MS = 15 * 60_000;
type EventSource = {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
};

export function isManualResult(view: RoomView | null): boolean {
  return Boolean(view && ['reveal', 'ranking'].includes(view.phase) && view.settings?.autoAdvance === false);
}

export function pollingDelay(view: RoomView | null, unchangedMs: number): number | null {
  if (!view || (!view.paused && !isManualResult(view) && view.deadline > 0 && !['lobby', 'finished'].includes(view.phase)))
    return 1500;
  if (unchangedMs >= IDLE_STOP_MS) return null;
  if (unchangedMs >= 60_000) return 15_000;
  if (unchangedMs >= 15_000) return 5000;
  return 1500;
}

/** One in-flight read, no background/offline requests, and a finite idle lifetime. */
export function startRoomPolling(options: {
  read: (signal: AbortSignal) => Promise<void>;
  view: () => RoomView | null;
  error: (error: unknown) => void;
  stopped: (reason: SyncStop) => void;
  document: EventSource & { readonly hidden: boolean };
  window: EventSource;
  online: () => boolean;
}) {
  let disposed = false;
  let reason: SyncStop = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: AbortController | null = null;
  let revision = options.view()?.revision;
  let changedAt = Date.now();
  let failures = 0;
  let wakeAfterRead = false;
  const available = () => !disposed && !options.document.hidden && options.online();

  function observe() {
    const current = options.view();
    if (current?.revision !== revision) {
      revision = current?.revision;
      changedAt = Date.now();
    }
    return pollingDelay(current, Date.now() - changedAt);
  }
  function halt(next: SyncStop) {
    reason = next;
    clearTimeout(timer);
    options.stopped(next);
  }
  async function poll() {
    clearTimeout(timer);
    if (!available() || reason || inFlight) return;
    const controller = new AbortController();
    inFlight = controller;
    try {
      await options.read(controller.signal);
      failures = 0;
    } catch (error) {
      if (!controller.signal.aborted && !disposed) {
        failures++;
        options.error(error);
        const status = (error as { status?: number })?.status;
        if (status === 400 || status === 404 || status === 410) halt('expired');
      }
    } finally {
      inFlight = null;
      if (available() && !reason) {
        const delay = observe();
        if (delay === null || (failures > 0 && Date.now() - changedAt >= IDLE_STOP_MS)) {
          halt('idle');
        } else {
          timer = setTimeout(poll, wakeAfterRead ? 0 : failures
            ? Math.min(30_000, 1500 * 2 ** Math.min(failures, 5)) : delay);
          wakeAfterRead = false;
        }
      }
    }
  }
  function resume() {
    if (disposed || reason === 'expired') return;
    changedAt = Date.now();
    failures = 0;
    halt(null);
    if (inFlight) wakeAfterRead = true;
    else void poll();
  }
  function availabilityChanged() {
    if (!available()) {
      clearTimeout(timer);
      inFlight?.abort();
      if (!options.online()) options.error(new Error('オフラインです。接続が戻ると自動で再開します。'));
    } else resume();
  }
  options.document.addEventListener('visibilitychange', availabilityChanged);
  options.window.addEventListener('online', availabilityChanged);
  options.window.addEventListener('offline', availabilityChanged);
  void poll();
  return {
    resume,
    stop() {
      disposed = true;
      clearTimeout(timer);
      inFlight?.abort();
      options.document.removeEventListener('visibilitychange', availabilityChanged);
      options.window.removeEventListener('online', availabilityChanged);
      options.window.removeEventListener('offline', availabilityChanged);
    },
  };
}
