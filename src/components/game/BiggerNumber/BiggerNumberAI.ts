/**
 * Bigger Number — AI strategies.
 *
 * easy   — picks uniformly at random.
 * medium — plays the median of remaining cards (avoids extremes).
 * hard   — opponent-modelling: assumes opponent picks uniformly from their
 *          remaining hand, computes expected value of each candidate against
 *          that distribution, and picks the maximum (ties broken by lower
 *          rank to conserve power for later).
 */

import type {
  AIDifficulty,
  BiggerNumberRules,
  CardValue,
  RoundOutcome,
} from './types';
import { isDragon, resolveRound } from './gameLogic';

export interface AIDecision {
  card: CardValue;
}

export function pickAICard(
  difficulty: AIDifficulty,
  rules: BiggerNumberRules,
  myHand: CardValue[],
  opponentHand: CardValue[]
): AIDecision {
  if (myHand.length === 0) {
    throw new Error('AI has no cards to play');
  }
  switch (difficulty) {
    case 'easy':
      return { card: pickRandom(myHand) };
    case 'medium':
      return { card: pickMedian(myHand) };
    case 'hard':
      return { card: pickByExpectedValue(rules, myHand, opponentHand) };
  }
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function rankForOrdering(card: CardValue): number {
  // Treat dragon as a "wild" mid for medium ordering only.
  return isDragon(card) ? 5 : card;
}

function pickMedian(hand: CardValue[]): CardValue {
  const sorted = [...hand].sort((a, b) => rankForOrdering(a) - rankForOrdering(b));
  return sorted[Math.floor(sorted.length / 2)];
}

function outcomeScore(outcome: RoundOutcome): number {
  if (outcome === 'p1') return 1; // we win
  if (outcome === 'p2') return -1; // we lose
  return 0; // tie
}

function pickByExpectedValue(
  rules: BiggerNumberRules,
  myHand: CardValue[],
  opponentHand: CardValue[]
): CardValue {
  if (opponentHand.length === 0) return pickRandom(myHand);

  let bestCard: CardValue = myHand[0];
  let bestScore = -Infinity;
  let bestRank = Infinity;

  for (const candidate of myHand) {
    let total = 0;
    for (const opp of opponentHand) {
      // From our POV we are p1, opponent is p2.
      const result = resolveRound(rules, candidate, opp);
      total += outcomeScore(result.outcome);
    }
    const ev = total / opponentHand.length;
    const rank = rankForOrdering(candidate);

    // Prefer higher EV; on ties prefer the lower-ranked card (save power).
    if (ev > bestScore || (ev === bestScore && rank < bestRank)) {
      bestScore = ev;
      bestRank = rank;
      bestCard = candidate;
    }
  }

  return bestCard;
}
