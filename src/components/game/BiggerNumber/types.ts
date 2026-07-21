/**
 * Bigger Number — shared types
 * Each player holds tiles 1..9 plus one Dragon. Both reveal simultaneously,
 * higher number wins the round, first to N wins the match.
 */

export type DragonRule = 'loses-to-1' | 'beats-all';
export type TieRule = 'discard' | 'replay';

export interface BiggerNumberRules {
  dragonRule: DragonRule;
  tieRule: TieRule;
  winsToWin: number;
  totalRounds: number;
}

export const DEFAULT_RULES: BiggerNumberRules = {
  dragonRule: 'loses-to-1',
  tieRule: 'discard',
  winsToWin: 5,
  totalRounds: 10,
};

export type CardValue = number | 'dragon';

export const ALL_CARDS: CardValue[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 'dragon'];

export type AIDifficulty = 'easy' | 'medium' | 'hard' | 'master';

export type RoundOutcome = 'p1' | 'p2' | 'tie';

export interface RoundResult {
  outcome: RoundOutcome;
  p1Card: CardValue;
  p2Card: CardValue;
  /** True when the round was a tie that returned cards to hand (replay rule). */
  cardsReturnedToHand: boolean;
  /** True if a dragon was involved in the resolution. */
  involvedDragon: boolean;
}
