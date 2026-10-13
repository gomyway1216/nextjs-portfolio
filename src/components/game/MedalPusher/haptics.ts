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
 * - `stream`: a medal fed by a button that is still held. At most one every 330 ms, three a second, whatever
 *   has been felt meanwhile: the feel of medals going in, without the buzz of every one.
 * - `catch`: medals over the front edge, into the tray. At most one every 220 ms, however many fall.
 * - `feed`: a press of L or R that feeds a medal. Every press is felt, down to 60 ms apart, which is two thumbs at
 *   once. It matters more than the two above, because it is the answer to what the hand has just done: a medal
 *   that falls into the tray in the same moment does not take its place, and waits its own gap after it.
 * - `start`: a medal through a START pocket that holds a spin.
 * - `crash`: a tower going over the pusher's lip.
 * - `chance`: chance time begins. Two ticks, a little heavier than a START pocket's.
 * - `line`: the slot stops on a winning line, or a ball goes over the front.
 * - `prize`: a prize is paid: a square of the board, a chest, a number of the roulette, a hole of the bowl.
 * - `jackpot`: the jackpot. A second and a quarter long.
 */
export const HAPTICS = {
  stream: { pattern: [15], rank: 0, gap: 330 },
  catch: { pattern: [22], rank: 0, gap: 220 },
  feed: { pattern: [15], rank: 1, gap: 60 },
  start: { pattern: [16, 36, 16], rank: 2, gap: 0 },
  crash: { pattern: [70], rank: 2, gap: 0 },
  chance: { pattern: [24, 40, 24], rank: 3, gap: 0 },
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

/**
 * What fed a medal, as the hand is told of it: a press, or a button that is
 * still held. A medal that Auto feeds is not told of at all: no finger is
 * working it.
 */
export type FedBy = 'feed' | 'stream';

/**
 * Notes what fed a medal, where it was fed and only if the machine took it.
 * `took` is what `insert` answered, and is handed straight back, so this
 * goes round the call. Whoever plays the patterns takes the notes with
 * `takeFed`, once a frame. Nothing is worked out afterwards from what
 * happens to be held by then: a tap can be over before the frame, and a held
 * button whose slot is not free feeds nothing while Auto feeds the other rail.
 */
export function noteFed(fed: FedBy[], how: FedBy, took: boolean): boolean {
  if (took) fed.push(how);
  return took;
}

/**
 * Takes what has been noted since it was last taken, and leaves nothing
 * behind, so that a medal is felt once. If a press is among them it is the
 * press that is felt: its tick is the one a hand waits for.
 */
export function takeFed(fed: FedBy[]): FedBy | null {
  const how = fed.includes('feed') ? 'feed' : fed.length > 0 ? 'stream' : null;
  fed.length = 0;
  return how;
}

/**
 * The pattern the hand should feel for one frame: of the medal that was fed
 * (`fed`, from `takeFed`) and of what happened on the machine, the one thing
 * that matters most. Null for nothing.
 */
export function hapticFor(events: readonly SessionEvent[], fed: FedBy | null = null): Haptic | null {
  let most: Haptic | null = fed;
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
      case 'chanceStart':
        feel('chance');
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

/**
 * Stops whatever is playing and forgets what has been felt. The cabinet
 * calls it when vibration is switched off, when the machine is reset, when
 * its tab is left and when the page is hidden: a pattern belongs to the
 * machine that earned it, and one that was cut off, or outlived its machine,
 * must not hold back the next tick until it would have ended. A motor that
 * has played nothing since it was last stopped is not asked to stop. It
 * never throws either.
 */
export function stopBuzz(nav: Vibrator | null = device()): void {
  const played = felt !== UNFELT;
  felt = UNFELT;
  if (!played) return;
  try {
    if (nav && typeof nav.vibrate === 'function') nav.vibrate(0);
  } catch {
    // Nothing was playing, or there is nothing to play it.
  }
}
