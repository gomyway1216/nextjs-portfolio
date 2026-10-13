/**
 * How the cabinet feels in the hand, on a phone above all: an aim that swings
 * by itself, a touch on the field that is told from the start of a scroll,
 * what the player has chosen for all that, the screen kept awake while
 * medals go in, and the cabinet filling the screen.
 *
 * None of it is the machine's. Sweep is a way of putting the aim in, like a
 * slider: it works the rails through `aimArm` and nothing else, so the
 * engine, the save and the odds are what they were. What is chosen here is
 * kept under a key of its own, apart from the machine's save. Everything in
 * this file takes what it needs as a parameter, the browser included, so it
 * runs the same in a test.
 */

import { ARM_REACH, ROLL_TIME, aimArm, type Machine } from './engine';

// ---------- Sweep: the rails swing by themselves and the player times the press ----------

/**
 * Seconds a rail's tip takes to swing from one end of its reach to the other
 * and back. At that pace it goes 18.6 field units a second, a seventeenth of
 * what an arm can do, so the tip is always exactly where the aim is. It is
 * slow enough to read: a medal is on its rail for 0.9 s before it drops, and
 * in that time the tip moves a sixth of the way across the field.
 */
export const SWEEP_PERIOD = 6;
/** How far each tip travels on one swing, in field units: the whole of its arm's reach. Both arms reach equally far. */
export const SWEEP_SPAN = ARM_REACH[0].max - ARM_REACH[0].min;
/** How fast a swinging tip moves, in field units a second. */
export const SWEEP_SPEED = (2 * SWEEP_SPAN) / SWEEP_PERIOD;

/**
 * How far along its swing a tip is at `time`: 0 at the left end of its reach,
 * 1 at the right end, and back again, at a steady pace. `time` is the
 * machine's own clock, in seconds.
 */
export function sweepPhase(time: number): number {
  if (!Number.isFinite(time)) throw new Error('the sweep is read at a time on the machine’s clock');
  const turn = (((time / SWEEP_PERIOD) % 1) + 1) % 1;
  return turn < 0.5 ? turn * 2 : 2 - turn * 2;
}

/**
 * Where Sweep points the two rails at `time`, the left rail's first. They
 * swing together, like a pair of wipers, each across its own reach: the left
 * tip is never to the right of the right one, so the rails never have to
 * give way to each other, and each passes the middle of the field at its own
 * moment.
 */
export function sweepAims(time: number): [number, number] {
  const along = sweepPhase(time);
  return [ARM_REACH[0].min + along * SWEEP_SPAN, ARM_REACH[1].min + along * SWEEP_SPAN];
}

/**
 * Where a medal fed at `time` will drop while the rails are swinging, the
 * left rail's first: where its tip will have got to when the medal reaches it.
 */
export const sweepLead = (time: number): [number, number] => sweepAims(time + ROLL_TIME);

/**
 * Points both rails where Sweep has them at `time`, through `aimArm`, as a
 * hand on the two sliders would. An arm cannot be pointed across the other,
 * so the right one is pointed first, to make room, and again last, in case
 * the left one was in its way.
 */
export function sweepTo(machine: Machine, time: number): void {
  const [left, right] = sweepAims(time);
  aimArm(machine, 1, right);
  aimArm(machine, 0, left);
  aimArm(machine, 1, right);
}

// ---------- A touch on the field: aiming, or the start of a scroll ----------

/**
 * How far sideways a finger has to go on the field, in CSS pixels, before it
 * is taken to be aiming. A swipe up or down the field scrolls the page, and
 * until the finger has gone this far, or has come up again, nobody can tell
 * which it will be.
 */
export const DRAG_SLOP = 8;

/**
 * Whether a finger that has moved by (`dx`, `dy`) since it went down is
 * dragging sideways: far enough, and more across than up or down.
 */
export const isSidewaysDrag = (dx: number, dy: number): boolean => Math.abs(dx) >= DRAG_SLOP && Math.abs(dx) > Math.abs(dy);

/**
 * Whether a press on the field aims the moment it lands. A mouse does: it
 * scrolls with its wheel, never by dragging. A finger or a pen does only
 * where the browser will not scroll with it (`touchAction` is what the
 * stylesheet says of the field there, `none` when the cabinet fills the
 * screen). Anywhere else it waits to see whether it is a tap, a sideways
 * drag or a scroll.
 */
export const aimsOnContact = (pointerType: string, touchAction: string): boolean => pointerType === 'mouse' || touchAction === 'none';

// ---------- What the player has chosen ----------

/** The key the choices are kept under in the browser. The machine's own save has another. */
export const FEEL_KEY = 'medal-pusher-feel';
export const FEEL_VERSION = 1;

export interface FeelPrefs {
  /** Whether the phone vibrates. Null until the player has chosen: then it is up to the device. */
  vibration: boolean | null;
  /** Whether the rails swing by themselves. */
  sweep: boolean;
}

/** A player who has chosen nothing. */
export const DEFAULT_FEEL: FeelPrefs = { vibration: null, sweep: false };

/**
 * Reads what was kept. Anything that is not what `writeFeel` writes is taken
 * as nothing chosen: no text, text that is not JSON, another version, a value
 * of the wrong kind. It never throws.
 */
export function readFeel(text: string | null | undefined): FeelPrefs {
  if (typeof text !== 'string' || text.length === 0 || text.length > 1000) return { ...DEFAULT_FEEL };
  let kept: unknown;
  try {
    kept = JSON.parse(text);
  } catch {
    return { ...DEFAULT_FEEL };
  }
  if (typeof kept !== 'object' || kept === null || Array.isArray(kept)) return { ...DEFAULT_FEEL };
  const { v, vibration, sweep } = kept as { v?: unknown; vibration?: unknown; sweep?: unknown };
  if (v !== FEEL_VERSION) return { ...DEFAULT_FEEL };
  return {
    vibration: typeof vibration === 'boolean' ? vibration : null,
    sweep: sweep === true,
  };
}

/** What is kept of the player's choices, as text. */
export const writeFeel = (prefs: FeelPrefs): string => JSON.stringify({ v: FEEL_VERSION, vibration: prefs.vibration, sweep: prefs.sweep });

/**
 * Whether the phone vibrates: as the player chose, and until they choose,
 * unless the device asks for less motion (`calm`).
 */
export const vibrates = (prefs: FeelPrefs, calm: boolean): boolean => prefs.vibration ?? !calm;

// ---------- The screen stays on while medals go in ----------

/** Seconds after the last medal went in before the screen may sleep again. */
export const WAKE_IDLE = 120;

/** What the browser hands out for a wake lock: something to give back, which can also be taken away. */
export interface WakeSentinel {
  release(): Promise<void>;
  addEventListener?(type: 'release', listener: () => void): void;
}

/** What the keeper needs of the world: a way to ask for a lock (null where the browser has none), a clock and a timer. */
export interface WakeEnv {
  request: (() => Promise<WakeSentinel>) | null;
  visible(): boolean;
  /** Milliseconds, from any starting point. */
  now(): number;
  setTimer(run: () => void, ms: number): unknown;
  clearTimer(timer: unknown): void;
}

export interface WakeKeeper {
  /** A medal went in: the screen is kept on from now until play has been idle for `WAKE_IDLE`. */
  played(): void;
  /** The page was hidden: the lock goes back, as the browser takes it anyway. */
  hidden(): void;
  /** The page is showing again: the lock is asked for again if play has not been idle that long. */
  shown(): void;
  /** The cabinet is taken down. */
  stop(): void;
  /** Whether a lock is held now. */
  readonly held: boolean;
}

/**
 * Keeps the screen awake while the machine is played. It asks for a lock
 * when a medal goes in, gives it back when the page is hidden or no medal
 * has gone in for `WAKE_IDLE` seconds, and asks again when the page comes
 * back within that time. A browser without wake locks, or one that says no
 * (a low battery, a power saver), changes nothing: nothing is thrown and
 * nothing is shown.
 */
export function createWakeKeeper(env: WakeEnv): WakeKeeper {
  let sentinel: WakeSentinel | null = null;
  let asking = false;
  let stopped = false;
  let lastPlayed = Number.NEGATIVE_INFINITY;
  let timer: unknown = null;

  const idleFor = () => env.now() - lastPlayed;
  const wanted = () => !stopped && idleFor() < WAKE_IDLE * 1000 && env.visible();
  const giveBack = () => {
    const held = sentinel;
    sentinel = null;
    if (!held) return;
    try {
      held.release().catch(() => undefined);
    } catch {
      // It was gone already.
    }
  };
  const ask = () => {
    if (!env.request || sentinel || asking || !wanted()) return;
    asking = true;
    let asked: Promise<WakeSentinel>;
    try {
      asked = env.request();
    } catch {
      asking = false;
      return;
    }
    asked.then(
      (lock) => {
        asking = false;
        sentinel = lock;
        // The browser takes a lock away when the page is hidden; it is asked for again when the page is back.
        lock.addEventListener?.('release', () => {
          if (sentinel === lock) sentinel = null;
        });
        // Play may have stopped, or the page gone, while the browser was making up its mind.
        if (!wanted()) giveBack();
      },
      () => {
        asking = false;
      },
    );
  };
  const watch = () => {
    if (timer !== null) env.clearTimer(timer);
    timer = null;
    if (stopped) return;
    const left = WAKE_IDLE * 1000 - idleFor();
    if (left <= 0) {
      giveBack();
      return;
    }
    timer = env.setTimer(() => {
      timer = null;
      watch();
    }, left);
  };

  return {
    played() {
      if (stopped) return;
      lastPlayed = env.now();
      // One timer runs at a time, and is set again only when it has gone off: a medal a moment does not make a timer a moment.
      if (timer === null) watch();
      ask();
    },
    hidden() {
      giveBack();
    },
    shown() {
      ask();
    },
    stop() {
      stopped = true;
      if (timer !== null) env.clearTimer(timer);
      timer = null;
      giveBack();
    },
    get held() {
      return sentinel !== null;
    },
  };
}

// ---------- The cabinet fills the screen ----------

/** The parts of a document that the Fullscreen API is made of. */
export interface FullscreenDoc {
  fullscreenEnabled?: boolean;
  fullscreenElement?: unknown;
  exitFullscreen?: () => Promise<void> | void;
}
export interface FullscreenTarget {
  requestFullscreen?: (options?: { navigationUI?: 'auto' | 'hide' | 'show' }) => Promise<void> | void;
}

/**
 * Whether an element of this document can fill the screen. An iPhone says
 * no: there only a video can, so the button for it is not shown at all. Nor
 * is it where only old WebKit's own names for all this exist: the stylesheet
 * lays the cabinet out under `:fullscreen`, which such a browser does not
 * know, and a cabinet filling the screen without that layout is worse than
 * no button.
 */
export const canFullscreen = (doc: FullscreenDoc | null | undefined): boolean => !!doc && doc.fullscreenEnabled === true;

/** The element that fills the screen now, or null. */
export const fullscreenElementOf = (doc: FullscreenDoc | null | undefined): unknown => doc?.fullscreenElement ?? null;

/**
 * Asks for `target` to fill the screen, without the browser's own bars over
 * it. A browser that says no is not an error: the returned promise never
 * rejects.
 */
export async function enterFullscreen(target: FullscreenTarget | null | undefined): Promise<void> {
  try {
    await target?.requestFullscreen?.({ navigationUI: 'hide' });
  } catch {
    // Not allowed just now: the button stays as it was, since nothing fills the screen.
  }
}

/** Leaves fullscreen, if anything is in it. It never rejects either. */
export async function leaveFullscreen(doc: FullscreenDoc | null | undefined): Promise<void> {
  try {
    if (fullscreenElementOf(doc)) await doc?.exitFullscreen?.();
  } catch {
    // It had been left already.
  }
}
