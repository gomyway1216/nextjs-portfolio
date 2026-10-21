/**
 * The machine played by rote, for its returns: a seeded machine, fed one way for many medals, with everything it pays
 * counted. Used by the long measurement (scripts/carousel-pusher-tune.ts), whose figures the Odds tab publishes
 * (published.ts), and by the tests, which play short runs of it.
 *
 * The ways of feeding:
 *
 * - **timed** (best play): one medal for each hole that comes round under the rail, let go so that it comes down on the
 *   deck as the hole passes under the drop spot, and none while all four hold lamps are lit (a medal into a hole then
 *   starts nothing). Every medal is fed at the best moment there is.
 * - **steady** (an everyday hand): a medal about every second, at no moment in particular.
 * - **held** (the button held down): a medal every time the slot takes one, four a second.
 *
 * And the ways a player might try to choose the moment some other way, measured to show that none of them beats the
 * timed hand (scripts/carousel-pusher-scan.ts):
 *
 * - **timed** with a `lead`: every hole timed, but the medal let go `lead` steps early (late when negative), so that
 *   it comes down a little before or after the hole passes the drop spot.
 * - **phase**: medals only while they will come down at the carousel's angles `angle` to `angle + width` (as fast as
 *   the slot takes them, none while all four lamps are lit): one angle a turn, one hole at one lead, or DROP held
 *   through a part of the bulge's swing.
 * - **dish**: the holes timed only while the treasure dish holds at least `stockAt` medals, DROP held otherwise.
 */

import { HOLD_MAX, PRESS_TO_DECK, STOCK, TIMES, angleAt, atRest, feed, freshMachine, nextPocketUnderDrop, nextRandom, step, type Machine, type MachineEvent } from './engine';
import { LOTTERY, OUTCOME_IDS } from './lottery';

/** The ways the Odds tab publishes. */
export const STRATEGIES = ['timed', 'steady', 'held'] as const;
/** Every way the simulation plays. */
export type Strategy = (typeof STRATEGIES)[number] | 'phase' | 'dish';

export interface Tally {
  /** Medals fed, and every medal that came back for them: off the front edge, thrown into the tray, and prizes. */
  fed: number;
  back: number;
  /** Where they came from. */
  front: number;
  thrownIn: number;
  prizes: number;
  /** Medals that went down the side holes. */
  lost: number;
  /** Medals into a hole (spins started, and holes taken while all four lamps were lit). */
  pockets: number;
  direct: number;
  wasted: number;
  /** Each outcome of the counter, in `OUTCOME_IDS` order. */
  outcomes: number[];
  /** Jackpots, and the medals their stock threw out. */
  jackpots: number;
  thrown: number;
}

export const emptyTally = (): Tally => ({ fed: 0, back: 0, front: 0, thrownIn: 0, prizes: 0, lost: 0, pockets: 0, direct: 0, wasted: 0, outcomes: OUTCOME_IDS.map(() => 0), jackpots: 0, thrown: 0 });

export function addTally(into: Tally, more: Tally): Tally {
  for (const key of Object.keys(into) as (keyof Tally)[]) {
    if (key === 'outcomes') more.outcomes.forEach((n, i) => (into.outcomes[i] += n));
    else into[key] += more[key];
  }
  return into;
}

/** A medal's random numbers (where it comes down, its ticket, the way it glances off), drawn as a press draws them. */
function press(m: Machine, draw: { rng: number }, events: MachineEvent[]): void {
  feed(m, nextRandom(draw), nextRandom(draw), nextRandom(draw), nextRandom(draw), events);
}

export interface SimulateOptions {
  strategy: Strategy;
  medals: number;
  seed: number;
  warmup?: number;
  batch?: number;
  onBatch?: (t: Tally) => void;
  machine?: Machine;
  /** timed (and dish): steps early the medal is let go (late when negative). */
  lead?: number;
  /** phase: the carousel's angles the medals come down at, `angle` to `angle + width - 1` (degrees, a degree a step). */
  angle?: number;
  width?: number;
  /** dish: the stock from which the holes are timed. */
  stockAt?: number;
}

/**
 * Plays `medals` medals the given way, after `warmup` medals that are not counted, on a machine set up from `seed`.
 * `onBatch` is told the tally of each `batch` medals as it is played (for spreads), and `tally` is the whole.
 */
export function simulate(options: SimulateOptions): { tally: Tally; machine: Machine } {
  const { strategy, medals, seed, warmup = 200, batch = 0, onBatch, lead = 0, angle = 0, width = 1, stockAt = 0 } = options;
  const timed = (m: Machine): boolean => m.holds < HOLD_MAX && m.slotAt <= m.step && nextPocketUnderDrop(m.step + PRESS_TO_DECK + lead).steps === 0;
  const m = options.machine ?? freshMachine(seed);
  const draw = { rng: (seed * 2654435761) | 0 };
  const events: MachineEvent[] = [];
  const whole = emptyTally();
  let part = emptyTally();
  let fed = 0;
  const total = warmup + medals;
  let next = m.step + 1 + Math.floor(nextRandom(draw) * 120);
  let counting = false;
  // Played until every medal is fed, and on until what they set going has settled.
  for (let guard = 0; guard < total * 400 + 100_000; guard++) {
    if (fed < total) {
      let go = false;
      if (strategy === 'timed') {
        go = timed(m);
      } else if (strategy === 'phase') {
        // The slot takes the medal at once (it is free), so it comes down `PRESS_TO_DECK` steps from now.
        const into = (((angleAt(m.step + PRESS_TO_DECK) - angle) % 360) + 360) % 360;
        go = m.holds < HOLD_MAX && m.slotAt <= m.step && into < width;
      } else if (strategy === 'dish') {
        go = m.stock >= stockAt ? timed(m) : m.slotAt <= m.step;
      } else if (strategy === 'steady') {
        go = m.step >= next;
      } else {
        go = m.slotAt <= m.step;
      }
      if (go) {
        if (fed === warmup) counting = true;
        press(m, draw, events);
        if (counting) part.fed += 1;
        fed += 1;
        next = m.step + 40 + Math.floor(nextRandom(draw) * 41);
      }
    } else if (atRest(m) && m.tray === 0) break;
    step(m, LOTTERY, events);
    for (const e of events) {
      if (!counting) continue;
      switch (e.type) {
        case 'won':
          if (e.via === 'front') part.front += e.count;
          else part.thrownIn += e.count;
          part.back += e.count;
          break;
        case 'lost':
          part.lost += e.count;
          break;
        case 'pocket':
          part.pockets += 1;
          if (e.direct) part.direct += 1;
          if (!e.held) part.wasted += 1;
          break;
        case 'spin':
          part.outcomes[e.spin.outcome] += 1;
          break;
        case 'paid':
          part.prizes += e.medals;
          part.back += e.medals;
          break;
        case 'jackpot':
          part.jackpots += 1;
          part.thrown += e.medals;
          break;
      }
    }
    events.length = 0;
    m.tray = 0;
    if (batch > 0 && part.fed >= batch && fed < total) {
      onBatch?.(part);
      addTally(whole, part);
      part = emptyTally();
    }
  }
  if (part.fed > 0 || part.back > 0) {
    onBatch?.(part);
    addTally(whole, part);
  }
  return { tally: whole, machine: m };
}

/** What the run brought back of every medal fed. */
export const returnOf = (t: Tally): number => (t.fed > 0 ? t.back / t.fed : 0);

/** How often a stocked medal is added: the stock's share of every medal fed, which every way of feeding gets back through the field. */
export const STOCK_SHARE = 1 / STOCK.every;
export { TIMES };
