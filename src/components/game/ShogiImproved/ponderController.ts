/**
 * PonderController — slice-based "permanent brain" loop for the AI worker.
 *
 * Purpose:
 * - While the human is thinking, the worker is otherwise idle. This controller
 *   repeatedly runs a *short, synchronous* search slice on the current
 *   position (the human's turn) so the shared transposition table gets warmed.
 *   When the human finally moves, the real search probes a hot TT and reaches
 *   a deeper ply within the same time budget.
 *
 * Why slices:
 * - The WASM search is synchronous; a single long call would make the worker
 *   deaf to incoming messages (the next `bestMove`, `clearTT`, ...). Instead
 *   we run one short slice (default 200ms), return to the event loop via
 *   `setTimeout(0)`, and queue the next slice. Any message that arrived during
 *   a slice is dispatched *before* the queued slice callback, so calling
 *   `stop()` from `onmessage` reliably cancels pondering with at most one
 *   slice of latency.
 *
 * Safety rails:
 * - `maxTotalMs` caps the total pondering time per `start()` (default 30s) so
 *   an abandoned tab does not burn CPU/battery forever.
 * - `suspend()` / `resume()` let the client pause pondering when the page is
 *   hidden (`visibilitychange`) without losing the remaining budget.
 * - A generation counter invalidates queued slice callbacks after
 *   `stop()`/`start()`, so stale timers never run an old session's search.
 */

/** Why a ponder session ended (mostly for logging/tests). */
export type PonderEndReason = 'stopped' | 'budgetExhausted' | 'searchEnded';

export interface PonderControllerOptions {
  /** Duration of one synchronous search slice, ms (default 200). */
  sliceMs?: number;
  /** Total pondering budget per start(), ms (default 30_000). */
  maxTotalMs?: number;
  /** Injectable clock for tests (default performance.now). */
  now?: () => number;
  /** Injectable scheduler used to yield between slices (default setTimeout 0). */
  schedule?: (fn: () => void) => void;
  /** Called once when a session ends, with total time spent pondering. */
  onSessionEnd?: (reason: PonderEndReason, spentMs: number) => void;
}

/**
 * One search slice. Runs synchronously for about `sliceMs`.
 * Return `false` to end the session (e.g. the position has no legal moves);
 * any other return value continues.
 */
export type PonderSearchSlice = (sliceMs: number) => boolean | void;

export class PonderController {
  private readonly sliceMs: number;
  private readonly maxTotalMs: number;
  private readonly now: () => number;
  private readonly schedule: (fn: () => void) => void;
  private readonly onSessionEnd?: (reason: PonderEndReason, spentMs: number) => void;

  /** Bumped on start()/stop(); queued slice callbacks from older generations no-op. */
  private generation = 0;
  private running = false;
  private suspended = false;
  private activeSlice: PonderSearchSlice | null = null;
  private spentMs = 0;

  constructor(options: PonderControllerOptions = {}) {
    this.sliceMs = Math.max(1, options.sliceMs ?? 200);
    this.maxTotalMs = Math.max(1, options.maxTotalMs ?? 30_000);
    this.now = options.now ?? (() => performance.now());
    this.schedule = options.schedule ?? ((fn) => setTimeout(fn, 0));
    this.onSessionEnd = options.onSessionEnd;
  }

  /** True while a session is active and not paused. */
  isPondering(): boolean {
    return this.running && !this.suspended;
  }

  /** Total time spent in search slices of the current/last session, ms. */
  getSpentMs(): number {
    return this.spentMs;
  }

  /**
   * Start a new ponder session. Any previous session is stopped first.
   * If currently suspended (page hidden), the session is armed and begins
   * on resume().
   */
  start(searchSlice: PonderSearchSlice): void {
    this.stop();
    this.activeSlice = searchSlice;
    this.spentMs = 0;
    this.running = true;
    if (!this.suspended) this.scheduleNext();
  }

  /** Stop the current session (next real request arrived / new game). */
  stop(): void {
    this.generation++;
    if (this.running) this.endSession('stopped');
  }

  /**
   * Pause without discarding the session (page hidden). The generation bump
   * invalidates the queued slice callback; resume() queues a fresh one, so a
   * rapid suspend/resume can never leave two slice chains running at once.
   */
  suspend(): void {
    this.suspended = true;
    this.generation++;
  }

  /** Resume a suspended session with its remaining budget. */
  resume(): void {
    if (!this.suspended) return;
    this.suspended = false;
    if (this.running && this.activeSlice) this.scheduleNext();
  }

  private endSession(reason: PonderEndReason): void {
    this.running = false;
    this.activeSlice = null;
    this.onSessionEnd?.(reason, this.spentMs);
  }

  private scheduleNext(): void {
    const gen = this.generation;
    this.schedule(() => this.runSlice(gen));
  }

  private runSlice(gen: number): void {
    // Stale timer (stopped/restarted), paused, or already ended: do nothing.
    if (gen !== this.generation || !this.running || this.suspended || !this.activeSlice) return;

    if (this.spentMs >= this.maxTotalMs) {
      this.endSession('budgetExhausted');
      return;
    }

    const sliceBudget = Math.min(this.sliceMs, this.maxTotalMs - this.spentMs);
    const t0 = this.now();
    let keepGoing: boolean | void;
    try {
      keepGoing = this.activeSlice(sliceBudget);
    } catch {
      // A pondering failure must never break the worker; just stop quietly.
      this.endSession('searchEnded');
      return;
    }
    // Count at least the requested slice so the loop always terminates even if
    // the search returns instantly (e.g. mated position) or the clock is frozen.
    this.spentMs += Math.max(sliceBudget, this.now() - t0);

    if (keepGoing === false) {
      this.endSession('searchEnded');
      return;
    }
    if (this.spentMs >= this.maxTotalMs) {
      this.endSession('budgetExhausted');
      return;
    }
    this.scheduleNext();
  }
}
