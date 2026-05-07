/**
 * Bigger Number — pure game logic.
 * Used by both AI and online modes; no React or Firebase dependencies.
 */

import type {
  BiggerNumberRules,
  CardValue,
  RoundOutcome,
  RoundResult,
} from './types';
import { ALL_CARDS } from './types';

export function freshHand(): CardValue[] {
  return [...ALL_CARDS];
}

export function isDragon(card: CardValue): card is 'dragon' {
  return card === 'dragon';
}

export function cardLabel(card: CardValue): string {
  return isDragon(card) ? '龍' : String(card);
}

/**
 * Decide which side wins a single round given both reveals.
 * Returns outcome only — score/hand mutations live in `applyRoundResult`.
 */
export function resolveRound(
  rules: BiggerNumberRules,
  p1Card: CardValue,
  p2Card: CardValue
): RoundResult {
  const involvedDragon = isDragon(p1Card) || isDragon(p2Card);
  const outcome = computeOutcome(rules, p1Card, p2Card);
  const cardsReturnedToHand = outcome === 'tie' && rules.tieRule === 'replay';

  return {
    outcome,
    p1Card,
    p2Card,
    cardsReturnedToHand,
    involvedDragon,
  };
}

function computeOutcome(
  rules: BiggerNumberRules,
  p1Card: CardValue,
  p2Card: CardValue
): RoundOutcome {
  // Both dragons → tie regardless of dragon rule.
  if (isDragon(p1Card) && isDragon(p2Card)) return 'tie';

  if (isDragon(p1Card)) return dragonVsNumber(rules, p2Card as number, 'p1', 'p2');
  if (isDragon(p2Card)) return dragonVsNumber(rules, p1Card as number, 'p2', 'p1');

  if (p1Card > p2Card) return 'p1';
  if (p2Card > p1Card) return 'p2';
  return 'tie';
}

function dragonVsNumber(
  rules: BiggerNumberRules,
  numberCard: number,
  dragonSide: RoundOutcome,
  numberSide: RoundOutcome
): RoundOutcome {
  switch (rules.dragonRule) {
    case 'beats-all':
      return dragonSide;
    case 'loses-to-1':
      return numberCard === 1 ? numberSide : dragonSide;
  }
}

export interface MatchScores {
  p1Wins: number;
  p2Wins: number;
}

/**
 * Has either player satisfied the win condition, or are we out of rounds?
 * Returns the winnerId among the two passed ids, or null for a draw,
 * or undefined if the match should continue.
 */
export function evaluateMatch(
  rules: BiggerNumberRules,
  scores: MatchScores,
  roundsPlayed: number,
  ids: { p1: string; p2: string }
): string | null | undefined {
  if (scores.p1Wins >= rules.winsToWin) return ids.p1;
  if (scores.p2Wins >= rules.winsToWin) return ids.p2;
  if (roundsPlayed >= rules.totalRounds) {
    if (scores.p1Wins > scores.p2Wins) return ids.p1;
    if (scores.p2Wins > scores.p1Wins) return ids.p2;
    return null;
  }
  return undefined;
}

export function removeCard(hand: CardValue[], card: CardValue): CardValue[] {
  const idx = hand.indexOf(card);
  if (idx === -1) return hand;
  return [...hand.slice(0, idx), ...hand.slice(idx + 1)];
}

export function handHas(hand: CardValue[], card: CardValue): boolean {
  return hand.includes(card);
}
