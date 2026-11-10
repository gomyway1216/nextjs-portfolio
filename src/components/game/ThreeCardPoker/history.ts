/**
 * The hands of a session, each with what the best decision was and what the
 * player's own gave up against it. Pure: the table keeps the list, and the
 * tests build one from chosen cards.
 */

import { handOdds } from './analysis';
import { PAIR_PLUS_PAYS, evaluate, type Bets, type Card, type Decision, type PayTable, type Settlement } from './engine';

/** How many hands the list keeps: the newest. The session's totals count every hand. */
export const HISTORY_LIMIT = 20;

export interface HandReview {
  player: Card[];
  dealer: Card[];
  bets: Bets;
  settlement: Settlement;
  /** The decision expected to bring more over every hand the dealer could hold, the dealer's cards unseen. */
  best: Decision;
  /**
   * The medals the player's decision was expected to give up against `best`, 0 when they are the same: the Ante, the
   * Play bet and the Ante Bonus over all the dealer's hands, and the Pair Plus bet a fold forfeits.
   */
  cost: number;
}

export interface HandRecord extends HandReview {
  /** The hand's number in the session, from 1. */
  number: number;
}

export interface History {
  /** Newest first, at most `HISTORY_LIMIT`. */
  entries: HandRecord[];
  hands: number;
  /** Hands whose decision was not the best one. */
  mistakes: number;
  /** The sum of every hand's `cost`. */
  cost: number;
}

export const EMPTY_HISTORY: History = { entries: [], hands: 0, mistakes: 0, cost: 0 };

/** What a decision is expected to bring, in medals, before the dealer's cards are seen. */
export function decisionValue(decision: Decision, bets: Bets, player: readonly Card[], pairPlusPays: PayTable = PAIR_PLUS_PAYS): number {
  // Folding loses both bets, whatever the cards.
  if (decision === 'fold') return -bets.ante - bets.pairPlus;
  const pays = pairPlusPays[evaluate(player).category];
  return bets.ante * handOdds(player).evPlay + (pays > 0 ? bets.pairPlus * pays : -bets.pairPlus);
}

/** Looks a paid hand over: the best decision for its cards and bets, and what the one made gave up. */
export function reviewHand(hand: { player: Card[]; dealer: Card[]; bets: Bets }, settlement: Settlement): HandReview {
  const play = decisionValue('play', hand.bets, hand.player);
  const fold = decisionValue('fold', hand.bets, hand.player);
  const best: Decision = play > fold ? 'play' : 'fold';
  const cost = settlement.decision === best ? 0 : Math.abs(play - fold);
  return { player: hand.player, dealer: hand.dealer, bets: hand.bets, settlement, best, cost };
}

export function addHand(history: History, review: HandReview, limit: number = HISTORY_LIMIT): History {
  const number = history.hands + 1;
  return {
    entries: [{ ...review, number }, ...history.entries].slice(0, limit),
    hands: number,
    mistakes: history.mistakes + (review.settlement.decision === review.best ? 0 : 1),
    cost: history.cost + review.cost,
  };
}
