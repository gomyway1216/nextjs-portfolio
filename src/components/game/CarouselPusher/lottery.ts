/**
 * The counter: three seven-segment digits that roll and stop one after another, left, middle, right, as the lottery of
 * a 1990s pusher did (JP H09-135962A: three digits that scroll and stop at random). A medal into a hole on the
 * carousel's deck starts one; four more can wait, one lamp each.
 *
 * What it comes to is drawn from one number, taken when the spin starts: the first of the numbers the presses have
 * drawn and kept (engine.ts `feed`), or the machine's own when none is left. The number picks the outcome by the
 * weights below, and the digits that show it.
 *
 * | shows                         | pays                                  |
 * |-------------------------------|---------------------------------------|
 * | 7 7 7                         | JACKPOT: the treasure dish's stock is thrown out across the field |
 * | any other three alike         | `PRIZES.triple` into the tray         |
 * | two 7s                        | `PRIZES.sevens`                       |
 * | a 7 in the middle             | `PRIZES.seven`                        |
 * | anything else                 | nothing                               |
 *
 * When the first two digits stop alike, the last one rolls on longer (a reach), as it does on the real thing.
 */

import type { Lottery, Spin } from './engine';

/** The outcomes, in the order of `WEIGHTS`. */
export const OUTCOME_IDS = ['jackpot', 'triple', 'sevens', 'seven', 'miss'] as const;
export type OutcomeId = (typeof OUTCOME_IDS)[number];

/** Out of `WEIGHT_TOTAL`, how often each outcome comes up. */
export const WEIGHT_TOTAL = 65_536;
export const WEIGHTS: Readonly<Record<OutcomeId, number>> = {
  jackpot: 164,
  triple: 1_966,
  sevens: 4_588,
  seven: 16_384,
  miss: 0,
};
// The rest is a miss.
(WEIGHTS as Record<OutcomeId, number>).miss = WEIGHT_TOTAL - WEIGHTS.jackpot - WEIGHTS.triple - WEIGHTS.sevens - WEIGHTS.seven;

/** What each outcome but the jackpot pays into the tray. */
export const PRIZES: Readonly<Record<Exclude<OutcomeId, 'jackpot'>, number>> = { triple: 20, sevens: 5, seven: 1, miss: 0 };

/** Every way of showing each outcome, as the three digits. */
export const PATTERNS: Readonly<Record<OutcomeId, readonly (readonly [number, number, number])[]>> = (() => {
  const of: Record<OutcomeId, [number, number, number][]> = { jackpot: [], triple: [], sevens: [], seven: [], miss: [] };
  for (let a = 0; a < 10; a++) {
    for (let b = 0; b < 10; b++) {
      for (let c = 0; c < 10; c++) of[classify(a, b, c)].push([a, b, c]);
    }
  }
  return of;
})();

/** Which outcome three digits show. */
export function classify(a: number, b: number, c: number): OutcomeId {
  if (a === 7 && b === 7 && c === 7) return 'jackpot';
  if (a === b && b === c) return 'triple';
  const sevens = (a === 7 ? 1 : 0) + (b === 7 ? 1 : 0) + (c === 7 ? 1 : 0);
  if (sevens === 2) return 'sevens';
  if (b === 7) return 'seven';
  return 'miss';
}

/** When the digits stop, in steps from the start: left, middle, right, and the right one later after a reach. */
export const STOPS = { left: 36, middle: 54, right: 72, reach: 150, after: 14, jackpotAfter: 60 } as const;

/** The outcome a number in [0, 1) draws, and the digits it shows (from what is left of the number). */
export function outcomeOf(ticket: number): { outcome: number; digits: [number, number, number] } {
  const t = Math.min(0.999_999_999_999, Math.max(0, ticket)) * WEIGHT_TOTAL;
  const slot = Math.floor(t);
  let acc = 0;
  let outcome = OUTCOME_IDS.length - 1;
  for (let i = 0; i < OUTCOME_IDS.length; i++) {
    acc += WEIGHTS[OUTCOME_IDS[i]];
    if (slot < acc) {
      outcome = i;
      break;
    }
  }
  const ways = PATTERNS[OUTCOME_IDS[outcome]];
  const pick = Math.min(ways.length - 1, Math.floor((t - slot) * ways.length));
  const [a, b, c] = ways[pick];
  return { outcome, digits: [a, b, c] };
}

/** A spin of the counter from a number, starting at `step`. */
export function spinFrom(ticket: number, step: number): Spin {
  const { outcome, digits } = outcomeOf(ticket);
  const reach = digits[0] === digits[1];
  const right = reach ? STOPS.reach : STOPS.right;
  const after = OUTCOME_IDS[outcome] === 'jackpot' ? STOPS.jackpotAfter : STOPS.after;
  return { outcome, digits, from: step, stops: [STOPS.left, STOPS.middle, right], at: step + right + after };
}

/** What an outcome pays into the tray: null for the jackpot, which throws the dish's stock out across the field. */
export function prize(outcome: number): number | null {
  const id = OUTCOME_IDS[outcome];
  return id === 'jackpot' ? null : PRIZES[id];
}

export const LOTTERY: Lottery = { spinFrom, prize };

/** The chance of each outcome on a spin. */
export const chanceOf = (id: OutcomeId): number => WEIGHTS[id] / WEIGHT_TOTAL;

/** What a spin pays into the tray on average, the jackpot left out: it pays through the field. */
export const trayValue = (): number => OUTCOME_IDS.reduce((sum, id) => (id === 'jackpot' ? sum : sum + chanceOf(id) * PRIZES[id]), 0);

/** A ticket that draws the given outcome (the middle of its range), for the tests and for nothing else. */
export function ticketFor(id: OutcomeId, pattern = 0): number {
  let from = 0;
  for (const other of OUTCOME_IDS) {
    if (other === id) break;
    from += WEIGHTS[other];
  }
  const ways = PATTERNS[id].length;
  return (from + Math.floor(WEIGHTS[id] / 2) + (pattern + 0.5) / ways) / WEIGHT_TOTAL;
}
