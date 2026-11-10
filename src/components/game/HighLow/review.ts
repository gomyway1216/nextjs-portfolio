/**
 * A finished game, looked back over: each choice the player made (HIGH, LOW or TAKE) set beside best play.
 *
 * Every card comes from a full deck, so what a choice is worth depends only on the rung and the card showing. A
 * choice's worth here is its exact average over the 13 ranks the next card can be, with best play from then on: TAKE
 * is worth its rung, a guess the worth of the states it wins into (a wrong guess and a tie are worth nothing). What a
 * choice "gave up" is the best choice's worth less its own, in medals for the game's bet. It says nothing of how the
 * cards then fell: a choice that gave something up can still have won, and the best one can still have lost.
 *
 * Worked out in whole numbers (BigInt), as engine.ts does, the first time a game is reviewed: never as the page loads.
 */

import { LADDER, RANKS, TOP, UNIT, fraction, guessRight, rankOf, valueOf, type Card, type Move } from './engine';
import { lostOf, overOf, rungOf, type RoundRecord } from './medalTable';

const ZERO = BigInt(0);
const THIRTEEN = BigInt(13);
const pow13 = (n: number): bigint => {
  let out = BigInt(1);
  for (let i = 0; i < n; i++) out *= THIRTEEN;
  return out;
};

/** What each choice is worth at a state, per `UNIT` medals bet, times 13^(TOP − rung). No take before the first rung. */
interface Worth {
  take: bigint | null;
  high: bigint;
  low: bigint;
}

let table: Worth[][] | null = null;

/** Every state's choices, with best play after them: `[rung][rank]`, rung 0 to TOP − 1. */
function worthTable(): Worth[][] {
  if (table) return table;
  const out: Worth[][] = [];
  // What a state is worth under best play, scaled like its choices; at the top, the top's pay.
  let above = new Array<bigint>(RANKS).fill(BigInt(LADDER[TOP - 1]));
  let scale = BigInt(1);
  for (let rung = TOP - 1; rung >= 0; rung--) {
    scale *= THIRTEEN;
    const row: Worth[] = [];
    const here: bigint[] = [];
    for (let rank = 0; rank < RANKS; rank++) {
      let high = ZERO;
      let low = ZERO;
      for (let next = 0; next < RANKS; next++) {
        if (next > rank) high += above[next];
        else if (next < rank) low += above[next];
      }
      const take = rung === 0 ? null : BigInt(LADDER[rung - 1]) * scale;
      row.push({ take, high, low });
      const go = high >= low ? high : low;
      here.push(take !== null && take > go ? take : go);
    }
    out[rung] = row;
    above = here;
  }
  table = out;
  return out;
}

const worthOf = (worth: Worth, move: Move): bigint => (move === 'take' ? (worth.take ?? ZERO) : worth[move]);

export interface Decision {
  /** The rungs lit when the choice was made: 0 for the first guess. */
  rung: number;
  /** The card that was showing. */
  card: Card;
  /** What the player did. */
  move: Move;
  /** How a guess came out: right, wrong, or a tie (which loses). Null for a take. */
  result: 'right' | 'wrong' | 'tie' | null;
  /** The choices worth the most here: more than one when they are worth exactly the same (HIGH and LOW from an 8). */
  best: Move[];
  /** Whether the player's choice was one of them. */
  matched: boolean;
  /** What the choice gave up beside the best one, in medals for the game's bet: 0 when it was the best. */
  gaveUp: number;
}

export interface GameReview {
  decisions: Decision[];
  /** How many of the choices were a best one. */
  matched: number;
  /** What the choices gave up, all together, in medals. */
  gaveUp: number;
}

/** One choice at a state, beside the best: which choices are worth the most, and what this one gave up for `bet`. */
export function judge(rung: number, rank: number, move: Move, bet: number): Pick<Decision, 'best' | 'matched' | 'gaveUp'> {
  const worth = worthTable()[rung][rank];
  const open: Move[] = worth.take === null ? ['high', 'low'] : ['take', 'high', 'low'];
  const most = open.reduce((top, option) => (worthOf(worth, option) > top ? worthOf(worth, option) : top), ZERO);
  const best = open.filter((option) => worthOf(worth, option) === most);
  const short = most - worthOf(worth, move);
  return { best, matched: short === ZERO, gaveUp: short === ZERO ? 0 : valueOf(fraction(short * BigInt(bet), pow13(TOP - rung) * BigInt(UNIT))) };
}

/**
 * A game that has ended, choice by choice: every guess, and the TAKE that ended it if one did. The top is paid without
 * a choice, so a game that reached it has only its guesses. Null for a game still being played.
 */
export function reviewGame(record: RoundRecord): GameReview | null {
  if (!overOf(record)) return null;
  const decisions: Decision[] = record.guesses.map((guess, rung) => {
    const card = record.cards[rung];
    const next = record.cards[rung + 1];
    const result = guessRight(card, next, guess) ? 'right' : rankOf(card) === rankOf(next) ? 'tie' : 'wrong';
    return { rung, card, move: guess, result, ...judge(rung, rankOf(card), guess, record.bet) };
  });
  const rung = rungOf(record);
  if (record.taken && !lostOf(record) && rung < TOP) {
    const card = record.cards[record.cards.length - 1];
    decisions.push({ rung, card, move: 'take', result: null, ...judge(rung, rankOf(card), 'take', record.bet) });
  }
  return {
    decisions,
    matched: decisions.filter((decision) => decision.matched).length,
    gaveUp: decisions.reduce((sum, decision) => sum + decision.gaveUp, 0),
  };
}
