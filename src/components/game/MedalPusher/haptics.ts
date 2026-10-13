/**
 * What the hand feels: the phone's vibration motor, worked through
 * `navigator.vibrate`. A table of named patterns, a rule for which of them
 * may be felt when, and `buzz`, which plays one where the device can and
 * does nothing, quietly, where it cannot. An iPhone cannot: Safari has no
 * vibration at all.
 *
 * The rule is needed because a motor is slow and there is only one of it. A
 * held button feeds a medal every 0.18 s and two buttons twice that, which a
 * motor cannot follow and no hand wants; and `navigator.vibrate` replaces
 * whatever is playing, so a tick for a medal would cut a jackpot short.
 */

import type { SessionEvent } from './session';

export interface HapticPattern {
  /** Milliseconds on, off, on, and so on, as `navigator.vibrate` takes them. */
  pattern: readonly number[];
  /** How much it matters. A pattern is never cut short by one that matters less. */
  rank: number;
  /** Milliseconds that must have gone by since the last pattern that mattered as much or more began. */
  gap: number;
}

/**
 * The patterns, weakest first.
 *
 * - `feed`: a press of L or R that feeds a medal. Every press is felt, down to 60 ms apart, which is two thumbs at once.
 * - `stream`: a medal fed by a button that is still held. At most one every 330 ms, three a second, whatever
 *   has been felt meanwhile: the feel of medals going in, without the buzz of every one.
 * - `catch`: medals over the front edge, into the tray. At most one every 220 ms, however many fall.
 * - `start`: a medal through a START pocket that holds a spin.
 * - `crash`: a tower going over the pusher's lip.
 * - `line`: the slot stops on a winning line, or a ball goes over the front.
 * - `prize`: a prize is paid: a square of the board, a chest, a number of the roulette, a hole of the bowl.
 * - `jackpot`: the jackpot. A second and a quarter long.
 */
export const HAPTICS = {
  feed: { pattern: [15], rank: 0, gap: 60 },
  stream: { pattern: [15], rank: 0, gap: 330 },
  catch: { pattern: [22], rank: 1, gap: 220 },
  start: { pattern: [16, 36, 16], rank: 2, gap: 0 },
  crash: { pattern: [70], rank: 2, gap: 0 },
  line: { pattern: [30, 50, 30], rank: 3, gap: 0 },
  prize: { pattern: [45, 55, 45, 55, 90], rank: 4, gap: 0 },
  jackpot: { pattern: [140, 70, 140, 70, 140, 70, 600], rank: 5, gap: 0 },
} as const satisfies Record<string, HapticPattern>;

export type Haptic = keyof typeof HAPTICS;
export const HAPTIC_NAMES = Object.keys(HAPTICS) as Haptic[];

/** How long a pattern lasts from its first buzz to its last, in milliseconds. */
export const hapticLength = (name: Haptic): number => HAPTICS[name].pattern.reduce((total, part) => total + part, 0);

/** What has been felt so far: when the last pattern of each rank began, and the one that may still be playing. */
export interface Buzzed {
  /** When the last pattern of each rank began, by rank, in milliseconds. A rank that has not been felt yet has no entry. */
  began: readonly (number | undefined)[];
  /** When the pattern that began last ends, and how much it matters. */
  until: number;
  rank: number;
}

/** Nothing has been felt yet. */
export const UNFELT: Buzzed = { began: [], until: Number.NEGATIVE_INFINITY, rank: -1 };

/**
 * Whether `name` may be felt at `now` (milliseconds on any one clock), given
 * what has been felt so far. Not while a pattern that matters more is still
 * playing, and not sooner than its own gap after the last pattern that
 * mattered as much or more began. So a tick for a medal never holds back
 * the next prize, and a prize holds back the ticks.
 */
export function mayBuzz(felt: Buzzed, name: Haptic, now: number): boolean {
  const { rank, gap } = HAPTICS[name];
  if (rank < felt.rank && now < felt.until) return false;
  for (let r = rank; r < felt.began.length; r++) {
    const began = felt.began[r];
    // A clock that has gone backwards holds nothing back.
    if (began !== undefined && now >= began && now - began < gap) return false;
  }
  return true;
}

/** What has been felt once `name` has begun at `now`. */
export function afterBuzz(felt: Buzzed, name: Haptic, now: number): Buzzed {
  const { rank } = HAPTICS[name];
  const began = [...felt.began];
  began[rank] = now;
  return { began, until: now + hapticLength(name), rank };
}

/** The pattern the hand should feel for what happened in one frame: the one that matters most, or null for nothing. */
export function hapticFor(events: readonly SessionEvent[]): Haptic | null {
  let most: Haptic | null = null;
  const feel = (name: Haptic) => {
    if (!most || HAPTICS[name].rank > HAPTICS[most].rank) most = name;
  };
  for (const event of events) {
    switch (event.type) {
      case 'won':
        feel('catch');
        break;
      case 'checker':
        if (event.held) feel('start');
        break;
      case 'toppled':
        feel('crash');
        break;
      case 'ball':
        feel('line');
        break;
      case 'spinEnd':
        if (event.result.tier !== 'miss') feel('line');
        break;
      case 'sugorokuEnd':
      case 'chestEnd':
      case 'rouletteStep':
        feel('prize');
        break;
      case 'bowlEnd':
        feel(event.jackpot ? 'jackpot' : 'prize');
        break;
      default:
        break;
    }
  }
  return most;
}

/** What `buzz` needs of a browser. */
export interface Vibrator {
  vibrate?: (pattern: number | number[]) => boolean;
  maxTouchPoints?: number;
  userActivation?: { hasBeenActive?: boolean };
}

const device = (): Vibrator | null => (typeof navigator === 'undefined' ? null : (navigator as Vibrator));

/**
 * Whether this device has a motor to work: the browser has
 * `navigator.vibrate` and the screen takes a finger. A desktop browser has
 * the first and no motor, so the switch is not shown there; Safari on an
 * iPhone has neither `vibrate` nor, therefore, the switch.
 */
export function canVibrate(nav: Vibrator | null = device()): boolean {
  return !!nav && typeof nav.vibrate === 'function' && (nav.maxTouchPoints ?? 0) > 0;
}

let felt: Buzzed = UNFELT;

/** Forgets what has been felt. For a new machine, and for tests. */
export function resetHaptics(): void {
  felt = UNFELT;
}

/**
 * Plays a pattern, if the player has vibration on, the device has a motor
 * and the rule above lets it through. Returns whether it was sent. It never
 * throws: no motor, no `navigator`, or a browser that refuses is just no buzz.
 * A browser also refuses, and complains on its console, until the page has
 * been touched once; before that nothing is asked of it.
 */
export function buzz(name: Haptic, enabled: boolean, now: number = performance.now(), nav: Vibrator | null = device()): boolean {
  if (!enabled || !nav || typeof nav.vibrate !== 'function') return false;
  if (nav.userActivation && nav.userActivation.hasBeenActive === false) return false;
  if (!mayBuzz(felt, name, now)) return false;
  try {
    nav.vibrate([...HAPTICS[name].pattern]);
  } catch {
    return false;
  }
  felt = afterBuzz(felt, name, now);
  return true;
}

/** Stops whatever is playing, as when vibration is switched off in the middle of a jackpot. It never throws either. */
export function stopBuzz(nav: Vibrator | null = device()): void {
  felt = UNFELT;
  try {
    if (nav && typeof nav.vibrate === 'function') nav.vibrate(0);
  } catch {
    // Nothing was playing, or there is nothing to play it.
  }
}
