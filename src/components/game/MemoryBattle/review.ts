/**
 * Memory Battle — post-game review.
 *
 * Replays the recorded turns against the board layout and classifies each one
 * by what had already been shown face up (to both sides) when it was played.
 * Pure and framework-free so it can be unit-tested on its own.
 */

import type { Owner } from './engine';

export interface TurnRecord {
  mover: Owner;
  /** Board index of the first card flipped. */
  first: number;
  /** Board index of the second card flipped. */
  second: number;
}

/**
 * - `recalled`: a pair, and the first card's partner had been shown before the turn.
 * - `lucky`: a pair, and the first card's partner had never been shown.
 * - `missed`: no pair, although one could have been taken from cards already
 *   shown — either both cards of some pair had been shown before the turn, or
 *   the first card's partner had been.
 * - `noMatch`: no pair, and none could have been known.
 */
export type TurnKind = 'recalled' | 'lucky' | 'missed' | 'noMatch';

export interface ReviewedTurn extends TurnRecord {
  firstValue: number;
  secondValue: number;
  kind: TurnKind;
}

export interface SideReport {
  turns: number;
  recalled: number;
  lucky: number;
  missed: number;
  /** Most pairs taken in a row without handing the turn over. */
  longestStreak: number;
}

export interface GameReview {
  turns: ReviewedTurn[];
  player: SideReport;
  ai: SideReport;
}

const emptyReport = (): SideReport => ({
  turns: 0,
  recalled: 0,
  lucky: 0,
  missed: 0,
  longestStreak: 0,
});

/**
 * Review a game. `values[i]` is the value of the card at board index `i`.
 * Turns that point outside the board, flip one card twice, or flip a card
 * that was already taken are skipped.
 */
export const reviewGame = (
  values: readonly number[],
  turns: readonly TurnRecord[],
): GameReview => {
  const partner = new Map<number, number>();
  const firstIndexOfValue = new Map<number, number>();
  values.forEach((value, index) => {
    const other = firstIndexOfValue.get(value);
    if (other === undefined) {
      firstIndexOfValue.set(value, index);
    } else {
      partner.set(index, other);
      partner.set(other, index);
    }
  });

  const inRange = (i: number) => Number.isInteger(i) && i >= 0 && i < values.length;
  const seen = new Set<number>();
  const taken = new Set<number>();
  // Shown-but-untaken pairs, counted once per pair.
  let knownPairsWaiting = 0;
  const review: GameReview = { turns: [], player: emptyReport(), ai: emptyReport() };
  const streak: Record<Owner, number> = { player: 0, ai: 0 };

  const show = (index: number) => {
    if (seen.has(index)) return;
    seen.add(index);
    const other = partner.get(index);
    if (other !== undefined && seen.has(other)) knownPairsWaiting += 1;
  };

  for (const turn of turns) {
    const { mover, first, second } = turn;
    if (!inRange(first) || !inRange(second) || first === second) continue;
    if (taken.has(first) || taken.has(second)) continue;

    const firstPartner = partner.get(first);
    const partnerShown = firstPartner !== undefined && seen.has(firstPartner);
    const matched = values[first] === values[second];
    let kind: TurnKind;
    if (matched) kind = partnerShown ? 'recalled' : 'lucky';
    else kind = partnerShown || knownPairsWaiting > 0 ? 'missed' : 'noMatch';

    const side = review[mover];
    side.turns += 1;
    if (kind !== 'noMatch') side[kind] += 1;

    show(first);
    show(second);
    if (matched) {
      streak[mover] += 1;
      side.longestStreak = Math.max(side.longestStreak, streak[mover]);
      taken.add(first);
      taken.add(second);
      knownPairsWaiting -= 1;
    } else {
      streak[mover] = 0;
    }

    review.turns.push({
      ...turn,
      firstValue: values[first],
      secondValue: values[second],
      kind,
    });
  }

  return review;
};
