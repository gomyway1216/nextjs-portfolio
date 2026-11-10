/**
 * Pause state for JumpGame - pure functions separated from UI.
 *
 * The countdown is measured in real milliseconds (not frames), so it lasts the
 * same time on 60/120/144Hz displays, and the simulation is simply not stepped
 * while the phase is anything other than `running`.
 */

export type PausePhase = 'running' | 'paused' | 'resuming';

export interface PauseState {
  phase: PausePhase;
  /** time left on the resume countdown; 0 unless `resuming` */
  remainingMs: number;
}

export const RESUME_COUNTDOWN_MS = 3000;
export const RESUME_COUNTDOWN_SECONDS = RESUME_COUNTDOWN_MS / 1000;
/** one slow frame may not swallow more of the countdown than this */
export const MAX_COUNTDOWN_STEP_MS = 250;

export const runningState = (): PauseState => ({ phase: 'running', remainingMs: 0 });

export const pausedState = (): PauseState => ({ phase: 'paused', remainingMs: 0 });

/** Start the countdown; only a paused game can be resumed. */
export const beginResume = (state: PauseState): PauseState =>
  state.phase === 'paused' ? { phase: 'resuming', remainingMs: RESUME_COUNTDOWN_MS } : state;

/** Advance the countdown by the time since the previous frame. */
export const tickResume = (state: PauseState, elapsedMs: number): PauseState => {
  if (state.phase !== 'resuming') return state;
  const step = Number.isFinite(elapsedMs)
    ? Math.min(Math.max(elapsedMs, 0), MAX_COUNTDOWN_STEP_MS)
    : 0;
  const remainingMs = state.remainingMs - step;
  return remainingMs <= 0 ? runningState() : { phase: 'resuming', remainingMs };
};

/** The number shown during the countdown (3, 2, 1); 0 when not counting. */
export const countdownSeconds = (state: PauseState): number =>
  state.phase === 'resuming' ? Math.ceil(state.remainingMs / 1000) : 0;

/** Whether the simulation should be stepped this frame. */
export const isSimulating = (state: PauseState): boolean => state.phase === 'running';
