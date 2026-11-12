/**
 * Bigger Number — round history, tile tracking and the end-of-match summary.
 * Pure helpers shared by the AI and online modes; no React dependencies.
 */

import type { CardValue } from './types';
import { ALL_CARDS } from './types';
import { isDragon } from './gameLogic';

export type RoundWinner = 'you' | 'opponent' | 'tie';

/** One resolved reveal, from the local player's point of view. */
export interface RoundRecord {
  round: number;
  yourCard: CardValue;
  opponentCard: CardValue;
  winner: RoundWinner;
  /** Tie under the replay rule: both tiles went back to hand. */
  cardsReturnedToHand: boolean;
}

export interface TileStatus {
  card: CardValue;
  inHand: boolean;
}

/**
 * Every tile of the full set, flagged by whether `hand` still holds it.
 * `spent` is a tile that has just been played for good but may still be listed
 * in `hand` (the hand is only updated when the next round starts).
 */
export function trackTiles(hand: readonly CardValue[], spent: CardValue | null = null): TileStatus[] {
  return ALL_CARDS.map((card) => ({ card, inHand: card !== spent && hand.includes(card) }));
}

export interface MatchSummary {
  yourWins: number;
  opponentWins: number;
  ties: number;
  /**
   * Mean of (winning number − losing number) over the rounds that side won
   * with a number tile against a number tile. Null when it won no such round.
   */
  yourAvgMargin: number | null;
  opponentAvgMargin: number | null;
}

export function summarizeMatch(history: readonly RoundRecord[]): MatchSummary {
  let yourWins = 0;
  let opponentWins = 0;
  let ties = 0;
  const yourMargins: number[] = [];
  const opponentMargins: number[] = [];

  for (const r of history) {
    if (r.winner === 'tie') {
      ties += 1;
      continue;
    }
    const margin =
      isDragon(r.yourCard) || isDragon(r.opponentCard)
        ? null
        : Math.abs(r.yourCard - r.opponentCard);
    if (r.winner === 'you') {
      yourWins += 1;
      if (margin != null) yourMargins.push(margin);
    } else {
      opponentWins += 1;
      if (margin != null) opponentMargins.push(margin);
    }
  }

  return {
    yourWins,
    opponentWins,
    ties,
    yourAvgMargin: mean(yourMargins),
    opponentAvgMargin: mean(opponentMargins),
  };
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function isCardValue(value: unknown): value is CardValue {
  return ALL_CARDS.includes(value as CardValue);
}

/**
 * Convert the online room's round log (as synced from the server) into local
 * round records. The payload is untyped at runtime and the realtime database
 * can hand back a sparse array as a keyed object, so entries are validated and
 * anything malformed, or not between these two players, is skipped.
 */
export function historyFromLog(
  log: unknown,
  myId: string,
  opponentId: string,
): RoundRecord[] {
  if (log == null || typeof log !== 'object') return [];
  const records: RoundRecord[] = [];

  for (const raw of Object.values(log as Record<string, unknown>)) {
    if (raw == null || typeof raw !== 'object') continue;
    const e = raw as Record<string, unknown>;

    let yourCard: unknown;
    let opponentCard: unknown;
    if (e.p1Id === myId && e.p2Id === opponentId) {
      yourCard = e.p1Card;
      opponentCard = e.p2Card;
    } else if (e.p2Id === myId && e.p1Id === opponentId) {
      yourCard = e.p2Card;
      opponentCard = e.p1Card;
    } else {
      continue;
    }
    if (!isCardValue(yourCard) || !isCardValue(opponentCard)) continue;
    if (typeof e.round !== 'number' || !Number.isFinite(e.round)) continue;

    // A tie is stored as a null winner, which the database drops entirely.
    if (e.winnerId != null && e.winnerId !== myId && e.winnerId !== opponentId) continue;

    const winner: RoundWinner =
      e.winnerId === myId ? 'you' : e.winnerId === opponentId ? 'opponent' : 'tie';
    records.push({
      round: e.round,
      yourCard,
      opponentCard,
      winner,
      cardsReturnedToHand: winner === 'tie' && e.cardsReturnedToHand === true,
    });
  }
  return records;
}
