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
 */

import { HOLD_MAX, PRESS_TO_DECK, STOCK, TIMES, atRest, feed, freshMachine, nextPocketUnderDrop, nextRandom, step, type Machine, type MachineEvent } from './engine';
import { LOTTERY, OUTCOME_IDS } from './lottery';

export const STRATEGIES = ['timed', 'steady', 'held'] as const;
export type Strategy = (typeof STRATEGIES)[number];

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

/** A medal's two random numbers and its ticket, drawn from the run's own generator, as a press draws them. */
function press(m: Machine, draw: { rng: number }, events: MachineEvent[]): void {
  feed(m, nextRandom(draw), nextRandom(draw), nextRandom(draw), events);
}

/**
 * Plays `medals` medals the given way, after `warmup` medals that are not counted, on a machine set up from `seed`.
 * `onBatch` is told the tally of each `batch` medals as it is played (for spreads), and `tally` is the whole.
 */
export function simulate(options: { strategy: Strategy; medals: number; seed: number; warmup?: number; batch?: number; onBatch?: (t: Tally) => void; machine?: Machine; lead?: number }): { tally: Tally; machine: Machine } {
  const { strategy, medals, seed, warmup = 200, batch = 0, onBatch, lead = 0 } = options;
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
        go = m.holds < HOLD_MAX && m.slotAt <= m.step && nextPocketUnderDrop(m.step + PRESS_TO_DECK + lead).steps === 0;
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
