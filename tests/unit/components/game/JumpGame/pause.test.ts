import { describe, expect, it } from 'vitest';

import { getJumpGamePauseCopy } from '@/components/game/JumpGame/i18n';
import {
  beginResume,
  countdownSeconds,
  isSimulating,
  MAX_COUNTDOWN_STEP_MS,
  pausedState,
  PauseState,
  RESUME_COUNTDOWN_MS,
  RESUME_COUNTDOWN_SECONDS,
  runningState,
  tickResume,
} from '@/components/game/JumpGame/pause';

/** Run a whole countdown at a fixed refresh rate; returns frames and shown numbers. */
const runCountdown = (hz: number) => {
  const frameMs = 1000 / hz;
  let state: PauseState = beginResume(pausedState());
  const shown: number[] = [countdownSeconds(state)];
  let frames = 0;
  while (state.phase === 'resuming') {
    state = tickResume(state, frameMs);
    frames++;
    const n = countdownSeconds(state);
    if (n !== 0 && n !== shown[shown.length - 1]) shown.push(n);
    if (frames > 100000) throw new Error('countdown never finished');
  }
  return { elapsedMs: frames * frameMs, frameMs, shown };
};

describe('JumpGame pause', () => {
  it('only steps the simulation while running', () => {
    expect(isSimulating(runningState())).toBe(true);
    expect(isSimulating(pausedState())).toBe(false);
    expect(isSimulating(beginResume(pausedState()))).toBe(false);
  });

  it('resumes only from paused, with a full countdown', () => {
    expect(beginResume(pausedState())).toEqual({
      phase: 'resuming',
      remainingMs: RESUME_COUNTDOWN_MS,
    });
    expect(beginResume(runningState())).toEqual(runningState());
    const counting: PauseState = { phase: 'resuming', remainingMs: 1200 };
    expect(beginResume(counting)).toBe(counting);
  });

  it('shows 3, 2, 1 and then runs', () => {
    expect(RESUME_COUNTDOWN_SECONDS).toBe(3);
    expect(countdownSeconds(runningState())).toBe(0);
    expect(countdownSeconds(pausedState())).toBe(0);
    expect(countdownSeconds({ phase: 'resuming', remainingMs: 3000 })).toBe(3);
    expect(countdownSeconds({ phase: 'resuming', remainingMs: 2000.5 })).toBe(3);
    expect(countdownSeconds({ phase: 'resuming', remainingMs: 2000 })).toBe(2);
    expect(countdownSeconds({ phase: 'resuming', remainingMs: 1 })).toBe(1);
    expect(tickResume({ phase: 'resuming', remainingMs: 16 }, 16)).toEqual(runningState());
  });

  it('lasts the same real time at any refresh rate', () => {
    for (const hz of [30, 60, 120, 144, 240]) {
      const { elapsedMs, frameMs, shown } = runCountdown(hz);
      expect(shown).toEqual([3, 2, 1]);
      expect(elapsedMs).toBeGreaterThanOrEqual(RESUME_COUNTDOWN_MS - 1e-6);
      // At most one frame of overshoot (plus float accumulation).
      expect(elapsedMs).toBeLessThan(RESUME_COUNTDOWN_MS + frameMs + 1e-6);
    }
  });

  it('does not let one stalled frame swallow the countdown', () => {
    const start = beginResume(pausedState());
    const afterStall = tickResume(start, 10_000);
    expect(afterStall).toEqual({
      phase: 'resuming',
      remainingMs: RESUME_COUNTDOWN_MS - MAX_COUNTDOWN_STEP_MS,
    });
  });

  it('ignores negative or non-finite frame times', () => {
    const start = beginResume(pausedState());
    expect(tickResume(start, -50)).toEqual(start);
    expect(tickResume(start, Number.NaN)).toEqual(start);
    expect(tickResume(start, Number.POSITIVE_INFINITY)).toEqual(start);
  });

  it('leaves a paused or running game untouched when ticked', () => {
    const paused = pausedState();
    const running = runningState();
    expect(tickResume(paused, 1000)).toBe(paused);
    expect(tickResume(running, 1000)).toBe(running);
  });
});

describe('JumpGame pause copy', () => {
  const en = getJumpGamePauseCopy('en');
  const ja = getJumpGamePauseCopy('ja');

  it('has every string in both languages', () => {
    expect(Object.keys(ja).sort()).toEqual(Object.keys(en).sort());
    for (const copy of [en, ja]) {
      for (const value of Object.values(copy)) {
        const text = typeof value === 'function' ? value(3) : value;
        expect(text.trim().length).toBeGreaterThan(0);
      }
    }
    expect(ja.pause).not.toBe(en.pause);
    expect(ja.resume).not.toBe(en.resume);
    expect(ja.pausedTitle).not.toBe(en.pausedTitle);
  });

  it('states the real countdown length', () => {
    for (const copy of [en, ja]) {
      expect(copy.pausedHint(RESUME_COUNTDOWN_SECONDS)).toContain('3');
      expect(copy.help(RESUME_COUNTDOWN_SECONDS)).toContain('3');
      expect(copy.resumingIn(2)).toContain('2');
    }
  });
});
