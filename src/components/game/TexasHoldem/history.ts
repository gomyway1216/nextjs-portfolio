/**
 * Per-table hand history and session statistics.
 *
 * The engine clears its action log when a new hand is dealt. A HandRecord is a
 * snapshot of a finished hand that only contains what the table already showed
 * the player: their own cards, the board, the public actions and the hands
 * that were tabled at showdown.
 */

import type { Card, GameState, HandCategoryName, LogEntry, Street } from './engine';

export type HandOutcome = 'won' | 'split' | 'lost' | 'folded';

export interface ShownHand {
  seatIndex: number;
  hole: Card[];
  rank: HandCategoryName;
  won: boolean;
}

export interface HandRecord {
  handNumber: number;
  players: { name: string; isHuman: boolean }[];
  heroHole: Card[];
  board: Card[];
  /** Chips that were actually contested; an uncalled bet is not part of it. */
  pot: number;
  /** Hero's payout minus everything the hero put in during the hand. */
  heroNet: number;
  outcome: HandOutcome;
  /** Hero called or raised before the flop. Posting a blind does not count. */
  vpip: boolean;
  showdown: boolean;
  shownHands: ShownHand[];
  log: LogEntry[];
}

export interface SessionStats {
  hands: number;
  net: number;
  /** Win rate in big blinds per 100 hands. */
  bbPer100: number;
  handsWon: number;
  wonRate: number;
  vpipRate: number;
  biggestPotWon: number;
}

const HERO = 0;

export function recordHand(state: GameState): HandRecord | null {
  if (state.street !== 'complete' || !state.result) return null;
  const { result } = state;
  const hero = state.players[HERO];
  const heroWins = result.winnerIndices.includes(HERO);
  const outcome: HandOutcome = heroWins
    ? (result.winnerIndices.length > 1 ? 'split' : 'won')
    : hero.folded ? 'folded' : 'lost';

  const firstStreet = state.log.findIndex((entry) => entry.type === 'street');
  const preflop = firstStreet === -1 ? state.log : state.log.slice(0, firstStreet);
  const vpip = preflop.some((entry) => (
    entry.type === 'action' && entry.seatIndex === HERO && (entry.action === 'call' || entry.action === 'raise')
  ));

  const shownHands: ShownHand[] = result.uncontested
    ? []
    : state.players
      .map((player, seatIndex) => ({ player, seatIndex }))
      .filter(({ player, seatIndex }) => !player.folded && result.handRanks[seatIndex] !== undefined)
      .map(({ player, seatIndex }) => ({
        seatIndex,
        hole: [...player.hole],
        rank: result.handRanks[seatIndex].name,
        won: result.winnerIndices.includes(seatIndex),
      }));

  return {
    handNumber: state.handNumber,
    players: state.players.map((player) => ({ name: player.name, isHuman: player.isHuman })),
    heroHole: [...hero.hole],
    board: [...state.board],
    pot: result.pots.reduce((sum, pot) => sum + pot.amount, 0),
    heroNet: (result.payouts[HERO] ?? 0) - hero.totalContribution,
    outcome,
    vpip,
    showdown: !result.uncontested,
    shownHands,
    log: [...state.log],
  };
}

/** Adds a finished hand to the history once, however often it is offered. */
export function appendRecord(history: readonly HandRecord[], record: HandRecord | null): HandRecord[] {
  if (!record || history.some((entry) => entry.handNumber === record.handNumber)) return [...history];
  return [...history, record];
}

export function summarizeSession(records: readonly HandRecord[], bigBlind: number): SessionStats {
  const hands = records.length;
  const net = records.reduce((sum, record) => sum + record.heroNet, 0);
  const handsWon = records.filter((record) => record.outcome === 'won' || record.outcome === 'split').length;
  const vpipHands = records.filter((record) => record.vpip).length;
  const biggestPotWon = records.reduce(
    (best, record) => (record.outcome === 'won' || record.outcome === 'split' ? Math.max(best, record.pot) : best),
    0,
  );
  return {
    hands,
    net,
    bbPer100: hands === 0 || bigBlind <= 0 ? 0 : (net / bigBlind / hands) * 100,
    handsWon,
    wonRate: hands === 0 ? 0 : handsWon / hands,
    vpipRate: hands === 0 ? 0 : vpipHands / hands,
    biggestPotWon,
  };
}

/** The community cards that a street added to the final board. */
export function cardsDealtOn(board: readonly Card[], street: Street): Card[] {
  if (street === 'flop') return board.slice(0, 3);
  if (street === 'turn') return board.slice(3, 4);
  if (street === 'river') return board.slice(4, 5);
  return [];
}
