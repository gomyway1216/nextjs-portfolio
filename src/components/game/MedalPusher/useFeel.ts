'use client';

import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react';
import {
  DEFAULT_FEEL,
  FEEL_KEY,
  canFullscreen,
  createWakeKeeper,
  enterFullscreen,
  fullscreenElementOf,
  leaveFullscreen,
  readFeel,
  vibrates,
  writeFeel,
  type FeelPrefs,
  type WakeKeeper,
} from './feel';
import { canVibrate, stopBuzz } from './haptics';

/** What the frame loop reads of the player's choices. It runs outside React, so it takes them from a ref. */
export interface FeelNow {
  /** Whether the rails swing by themselves. */
  sweep: boolean;
  /** Whether a buzz is to be felt: the device has a motor and vibration is on. */
  vibrate: boolean;
}

export interface Feel {
  prefs: FeelPrefs;
  /** Whether this device has a vibration motor. False on the server and in the first render, whatever the device. */
  motor: boolean;
  /** Whether vibration is on: the player's choice, or the device's default until there is one. */
  vibrating: boolean;
  setSweep: (on: boolean) => void;
  setVibration: (on: boolean) => void;
}

/**
 * The player's choices of feel, and the device they are made on. The page is
 * drawn on the server first, where there is no device and nothing is
 * remembered, so the first render is that of a player who has chosen nothing
 * on a device that can do nothing; what the browser knows is read in an
 * effect, after it. A choice is written back when it is made, and a browser
 * that will not keep it (storage blocked, or full) only forgets it.
 *
 * `nowRef` and `wakeRef` are the cabinet's own refs, which its frame loop
 * reads: this keeps the first in step with the choices and puts the keeper
 * of the screen's wake lock in the second.
 */
export function useFeel(nowRef: RefObject<FeelNow>, wakeRef: RefObject<WakeKeeper | null>): Feel {
  const [prefs, setPrefs] = useState<FeelPrefs>(DEFAULT_FEEL);
  const [motor, setMotor] = useState(false);
  const [calm, setCalm] = useState(false);
  // The choices as they stand, for a switch that is thrown before the render that would show the last one.
  const chosen = useRef<FeelPrefs>(DEFAULT_FEEL);

  useEffect(() => {
    let kept: string | null = null;
    try {
      kept = window.localStorage.getItem(FEEL_KEY);
    } catch {
      // Storage is blocked: nothing was chosen, as far as this visit can tell.
    }
    chosen.current = readFeel(kept);
    setPrefs(chosen.current);
    setMotor(canVibrate());
    const less = window.matchMedia('(prefers-reduced-motion: reduce)');
    setCalm(less.matches);
    const follow = () => setCalm(less.matches);
    less.addEventListener('change', follow);
    return () => less.removeEventListener('change', follow);
  }, []);

  // The screen is kept awake while medals go in, where the browser can do that.
  useEffect(() => {
    const locks = (navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinel> } }).wakeLock;
    const keeper = createWakeKeeper({
      request: locks && typeof locks.request === 'function' ? () => locks.request('screen') : null,
      visible: () => document.visibilityState === 'visible',
      now: () => performance.now(),
      setTimer: (run, ms) => window.setTimeout(run, ms),
      clearTimer: (timer) => window.clearTimeout(timer as number),
    });
    wakeRef.current = keeper;
    const follow = () => {
      if (document.visibilityState === 'visible') keeper.shown();
      else keeper.hidden();
    };
    document.addEventListener('visibilitychange', follow);
    return () => {
      document.removeEventListener('visibilitychange', follow);
      keeper.stop();
      wakeRef.current = null;
    };
  }, [wakeRef]);

  const vibrating = motor && vibrates(prefs, calm);
  useEffect(() => {
    nowRef.current = { sweep: prefs.sweep, vibrate: vibrating };
  });

  const choose = (next: FeelPrefs) => {
    chosen.current = next;
    setPrefs(next);
    try {
      window.localStorage.setItem(FEEL_KEY, writeFeel(next));
    } catch {
      // Not kept: the choice holds for this visit.
    }
  };

  return {
    prefs,
    motor,
    vibrating,
    setSweep: (on) => {
      // The frame loop is told at once, not a render later: the hand that just took a slider is not swung away from it.
      nowRef.current = { ...nowRef.current, sweep: on };
      choose({ ...chosen.current, sweep: on });
    },
    setVibration: (on) => {
      nowRef.current = { ...nowRef.current, vibrate: motor && on };
      if (!on) stopBuzz();
      choose({ ...chosen.current, vibration: on });
    },
  };
}

/** Something that never changes has nothing to listen for. */
const never = () => () => undefined;

export interface Fullscreen {
  /** Whether an element can fill the screen here. False on the server, in the first render, and on an iPhone. */
  supported: boolean;
  /** Whether the cabinet fills the screen now. */
  active: boolean;
  toggle: () => void;
}

/**
 * Puts one element in fullscreen and takes it out again. `find` says which.
 * The state follows the browser, not the button: Escape, the back gesture
 * and the system's own way out all leave fullscreen without it, and each
 * sends `fullscreenchange`.
 */
export function useFullscreen(find: () => Element | null): Fullscreen {
  // Whether an element can fill the screen never changes while the page is open. On the server, and in the render
  // that takes over from the server's, the answer is no; the browser's own is read straight after.
  const supported = useSyncExternalStore(
    never,
    () => canFullscreen(document),
    () => false,
  );
  const [active, setActive] = useState(false);
  const finder = useRef(find);
  useEffect(() => {
    finder.current = find;
  });

  useEffect(() => {
    const follow = () => {
      const target = finder.current();
      setActive(target !== null && fullscreenElementOf(document) === target);
    };
    document.addEventListener('fullscreenchange', follow);
    follow();
    return () => document.removeEventListener('fullscreenchange', follow);
  }, []);

  return {
    supported,
    active,
    toggle: () => {
      const target = finder.current();
      if (!target) return;
      if (fullscreenElementOf(document) === target) void leaveFullscreen(document);
      else void enterFullscreen(target);
    },
  };
}
