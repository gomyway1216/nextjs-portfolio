/**
 * The double-up of a Japanese medal poker machine (ダブルアップ), as Sigma's
 * cabinets play it: after a win the player may TAKE it or put it on a double.
 * The dealer's card is turned face up on the left, four cards lie face down
 * on the right, and the player picks one of the four. Higher than the
 * dealer's card doubles the medals; the same rank is a push, and the same
 * medals stay on offer; lower loses them. Aces are high, suits do not count.
 *
 * It is a fair bet. The dealer's card and the one the player picks are two
 * different cards of one full deck, each as likely as any other, so the
 * player's is higher exactly as often as it is lower: one double returns
 * exactly what was put on it, on average, and no way of doubling up or
 * taking changes the machine's return (the 99.54% of 9/6 stays 99.54%). Only
 * the spread grows. `tests/unit/.../doubleUp.test.ts` counts every pair.
 *
 * The cards are drawn as late as they can be, so that nothing kept on the
 * device knows the outcome before the player has chosen: the dealer's card as
 * the double begins (it is shown), the four face-down cards as one is picked.
 */

import { rankOf } from './engine';

/** At most this many double-ups follow one win, a push counting as one: the medals can grow sixteenfold at most. */
export const DOUBLE_MAX = 4;

export type DoubleOutcome = 'win' | 'push' | 'lose';

/** What a double returns for each medal put on it. */
export const DOUBLE_RETURN: Readonly<Record<DoubleOutcome, number>> = { win: 2, push: 1, lose: 0 };

/** How the picked card stands against the dealer's: by rank alone, aces high. */
export function doubleOutcome(dealer: number, card: number): DoubleOutcome {
  const mine = rankOf(card);
  const theirs = rankOf(dealer);
  return mine > theirs ? 'win' : mine === theirs ? 'push' : 'lose';
}

/** The dealer's card for a double: any of the 52, each as likely. */
export const drawDealer = (random: () => number): number => Math.min(51, Math.floor(random() * 52));

/**
 * The four face-down cards: four different cards of the 51 the dealer's is
 * not, shuffled out of them (a Fisher–Yates shuffle stopped after four), so
 * that whichever of the four is picked is any of the 51, each as likely.
 */
export function drawFaceDown(dealer: number, random: () => number): number[] {
  const deck = Array.from({ length: 52 }, (_, i) => i).filter((card) => card !== dealer);
  for (let i = 0; i < 4; i++) {
    const j = i + Math.min(deck.length - 1 - i, Math.floor(random() * (deck.length - i)));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck.slice(0, 4);
}

/** One double-up: the dealer's card, and once the player has picked, the four cards and which was picked. */
export interface DoubleRound {
  dealer: number;
  cards?: number[];
  pick?: number;
}

/** A round's outcome, once it is picked. */
export const roundOutcome = (round: DoubleRound): DoubleOutcome | null =>
  round.cards && round.pick !== undefined ? doubleOutcome(round.dealer, round.cards[round.pick]) : null;

/** Where a win stands after its double-ups. */
export interface DoubleState {
  /** The medals on offer now (in the player's medals already), or, while a double waits for its pick, the medals on it. */
  offer: number;
  /** Whether a double waits for the player to pick a card: its medals are out of the player's medals. */
  pending: boolean;
  /** Whether a double was lost: nothing is on offer any more. */
  lost: boolean;
  /** How many double-ups may still be made. */
  left: number;
}

/** The state of a win of `won` medals after `rounds`: worked out from the cards, never read from storage. */
export function doubleState(won: number, rounds: readonly DoubleRound[]): DoubleState {
  let offer = won;
  let lost = false;
  let pending = false;
  for (const round of rounds) {
    const outcome = roundOutcome(round);
    if (outcome === null) {
      pending = true;
      break;
    }
    offer *= DOUBLE_RETURN[outcome];
    if (outcome === 'lose') {
      lost = true;
      break;
    }
  }
  return { offer, pending, lost, left: Math.max(0, DOUBLE_MAX - rounds.length) };
}
