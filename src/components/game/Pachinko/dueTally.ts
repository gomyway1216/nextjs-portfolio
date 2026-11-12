/**
 * What the page still has to show, and how it is written down: the machine is shown a ball's flight behind the rules
 * (scene.ts `FLIGHT_MS`), so every slot waits here that long before it reaches the screen.
 *
 * A slot is written down in this visit's figures and its data counter once, whichever way it leaves the queue: shown
 * as its moment comes (`next`), or cut short with the rest (`flush`: a skip, the card given up or come back). Only a
 * reset of the medals drops slots unwritten (`discard`). Nothing here is read by the rules, the draw or the medals,
 * and nothing is kept between visits.
 */

import { counted, type DataCounter } from './dataCounter';
import type { Machine, Tick } from './engine';
import type { Slot } from './medalTable';

/** What the page shows a slot's flight after it: the machine as it stood, and what happened. */
export interface Due {
  at: number;
  machine: Machine;
  ticks: Tick[];
  ball: Slot['ball'];
}

export interface SessionStats {
  lent: number;
  counted: number;
  fired: number;
  paid: number;
  spins: number;
  hits: number;
}
export const EMPTY_STATS: SessionStats = { lent: 0, counted: 0, fired: 0, paid: 0, spins: 0, hits: 0 };

/** Where a slot is written down: this visit's figures and its data counter, each changed from what it was. */
export interface VisitBook {
  stats(change: (stats: SessionStats) => SessionStats): void;
  counter(change: (counter: DataCounter) => DataCounter): void;
}

/** Writes a slot down in this visit's figures and its data counter. A slot in which nothing happened changes neither. */
export function writeDown(d: Due, book: VisitBook): void {
  const paid = d.ball?.fired.paid ?? 0;
  let spins = 0;
  let hits = 0;
  for (const tk of d.ticks) {
    if (tk.type === 'start') spins += 1;
    else if (tk.type === 'stop' && tk.kind) hits += 1;
  }
  if (paid > 0 || spins > 0 || hits > 0) book.stats((st) => ({ ...st, paid: st.paid + paid, spins: st.spins + spins, hits: st.hits + hits }));
  if (d.ball || d.ticks.length > 0) book.counter((c) => counted(c, d.ball?.fired ?? null, d.ticks));
}

/** The slots waiting to be shown, the earliest first. */
export interface DueQueue {
  /** How many slots are waiting. */
  readonly length: number;
  push(d: Due): void;
  /** The earliest slot, taken off the queue, if its moment has come by `now`; null if none has. */
  next(now: number): Due | null;
  /** Hands every slot waiting to `each`, the earliest first, and leaves the queue empty. */
  flush(each: (d: Due) => void): void;
  /** Drops every slot waiting, handed to no one. */
  discard(): void;
}

export function createDueQueue(): DueQueue {
  let waiting: Due[] = [];
  return {
    get length() {
      return waiting.length;
    },
    push: (d) => {
      waiting.push(d);
    },
    next: (now) => (waiting.length > 0 && waiting[0].at <= now ? waiting.shift()! : null),
    flush: (each) => {
      for (const d of waiting) each(d);
      waiting = [];
    },
    discard: () => {
      waiting = [];
    },
  };
}
