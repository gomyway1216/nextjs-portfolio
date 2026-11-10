/**
 * The review of a hand just played: each play the player made, the chart's
 * play for the same cards, and what the play costs on average.
 *
 * The cost is in medals: the expectation of the best play open to the player
 * less that of the play made (analysis.ts: an infinite deck, after the dealer
 * has checked for blackjack), times the hand's bet. It is a long-run average,
 * so a costly play can still win its hand and the best one can lose.
 */

import { P, upcard, type ActionEvs, type Value } from './analysis';
import { INSURANCE_PAYS, basicStrategy, cardValue, handValue, insuranceCost, isPair, type Action, type Card, type Legal, type Round } from './engine';

/** What each medal of insurance loses on average: it wins 2 when the hole card is a ten and loses 1 otherwise, so 1/13. */
export const INSURANCE_LOSS = 1 - P[10] - INSURANCE_PAYS * P[10];

/** A cost below this is arithmetic noise: the play is as good as the best one. */
const NOISE = 1e-9;

/**
 * The expectation of every play open to a hand, per unit of its bet. `hands` is how many hands are on the table,
 * which decides how often a split pair can be split again.
 */
export function moveEvs(cards: readonly Card[], dealerUp: Card, allowed: Pick<Legal, 'double' | 'split'>, hands = 1): ActionEvs {
  const a = upcard(cardValue(dealerUp) as Value);
  const v = handValue(cards);
  const evs: ActionEvs = { stand: a.stand(v.total), hit: a.hit(v) };
  if (allowed.double) evs.double = a.double(v);
  if (allowed.split) evs.split = a.split(cardValue(cards[0]) as Value, hands + 1);
  return evs;
}

export interface MoveDecision {
  kind: 'move';
  /** Which of the round's hands it was played on (a split puts its new hand after this one, so the place holds). */
  hand: number;
  /** The hand's cards when the play was made. */
  cards: Card[];
  dealerUp: Card;
  action: Action;
  /** The chart's play among those open to the player. */
  chart: Action;
  /** Medals given up on average against the best play open to the player (0 for the best play). */
  cost: number;
}

export interface InsuranceDecision {
  kind: 'insurance';
  taken: boolean;
  /** Medals given up on average: 1/13 of the insurance stake when it is taken, nothing when it is declined. */
  cost: number;
}

export type Decision = MoveDecision | InsuranceDecision;

/** A play on the round's active hand, before it is made. `allowed`: the plays the rules and the player's medals allow. */
export function reviewMove(round: Round, action: Action, allowed: Pick<Legal, 'double' | 'split'>): MoveDecision {
  const hand = round.hands[round.active];
  const dealerUp = round.dealer[0];
  const evs = moveEvs(hand.cards, dealerUp, allowed, round.hands.length);
  const chosen = evs[action];
  if (chosen === undefined) throw new Error(`${action} was not open to this hand`);
  const lost = Math.max(...Object.values(evs)) - chosen;
  return {
    kind: 'move',
    hand: round.active,
    cards: [...hand.cards],
    dealerUp,
    action,
    chart: basicStrategy(hand.cards, dealerUp, allowed),
    cost: lost > NOISE ? lost * round.bet : 0,
  };
}

/** The answer to the insurance offer, before it is given. */
export const reviewInsurance = (round: Pick<Round, 'bet' | 'whole'>, taken: boolean): InsuranceDecision => ({
  kind: 'insurance',
  taken,
  cost: taken ? insuranceCost(round) * INSURANCE_LOSS : 0,
});

/** Whether a decision was the chart's: its play for a move, and never insurance. */
export const matchesChart = (d: Decision) => (d.kind === 'move' ? d.action === d.chart : !d.taken);

export interface ReviewSummary {
  plays: number;
  matched: number;
  /** The costs of all the plays together, in medals. */
  cost: number;
}

export const summarize = (decisions: readonly Decision[]): ReviewSummary => ({
  plays: decisions.length,
  matched: decisions.filter(matchesChart).length,
  cost: decisions.reduce((sum, d) => sum + d.cost, 0),
});

/** How a hand is named on a chart: a pair of a card value (11 = aces), or a soft or hard total. */
export interface Spot {
  kind: 'pair' | 'soft' | 'hard';
  value: number;
}

export function spotOf(cards: readonly Card[]): Spot {
  if (isPair(cards)) return { kind: 'pair', value: cardValue(cards[0]) };
  const { total, soft } = handValue(cards);
  return { kind: soft ? 'soft' : 'hard', value: total };
}
