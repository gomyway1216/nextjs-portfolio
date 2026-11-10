import { BALLS, DRAWN, catchChance, gameOf, sortSpots, valueOf } from './engine';

/** How a number stood in a game that has ended. */
export type Mark = 'none' | 'spot' | 'drawn' | 'caught';

/** A game that has ended, laid out to be looked back at. */
export interface Review {
  /** Every number of the board, 1 to 80 in order: marked, drawn, both (caught) or neither. */
  marks: Mark[];
  /** The spots caught, in the board's order. */
  caught: number[];
  /** What the paytable paid for the catch, for every medal bet, before the last ball's ×5. */
  pay: number;
  /** What the pay was multiplied by: 5 when the last ball was a spot and the catch paid, or 1. */
  times: number;
  /** The twentieth ball, and whether it was one of the spots. */
  lastBall: number | null;
  lastCaught: boolean;
  /** The chance of catching exactly this many of this many spots, in any game. */
  chance: number;
}

/** A game of `ticket` against `balls` (the draw, in order), looked back at. */
export function reviewOf(ticket: readonly number[], balls: readonly number[]): Review {
  const spots = new Set(ticket);
  const out = new Set(balls);
  const game = gameOf(ticket, balls);
  const marks = Array.from({ length: BALLS }, (_, i): Mark => {
    const n = i + 1;
    if (spots.has(n)) return out.has(n) ? 'caught' : 'spot';
    return out.has(n) ? 'drawn' : 'none';
  });
  return {
    marks,
    caught: sortSpots(game.caught),
    pay: game.pay,
    times: game.times,
    lastBall: balls.length === DRAWN ? balls[DRAWN - 1] : null,
    lastCaught: game.lastCaught,
    chance: valueOf(catchChance(ticket.length, game.caught.length)),
  };
}
