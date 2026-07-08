/**
 * Memory Battle — pure game engine.
 *
 * The game is a two-player "concentration" (pairs) match: a grid of face-down
 * cards, each value appearing exactly twice. On a turn a player flips two cards.
 * If they match, the player scores the pair and moves again; otherwise the cards
 * flip back and the turn passes to the opponent. The player with the most pairs
 * once the board is cleared wins.
 *
 * This module is intentionally framework-free and deterministic (given an RNG),
 * so it can be unit-tested in isolation from React.
 */

export type Owner = 'player' | 'ai';

export interface Card {
  /** Stable id (board index at creation time). */
  id: number;
  /** Matching value — appears on exactly two cards. */
  value: number;
  /** Whether the card has been permanently matched and removed from play. */
  matched: boolean;
  /** Who captured the pair (only set once matched). */
  matchedBy: Owner | null;
}

/** Number of matching pairs on the board for each difficulty grid. */
export interface GridSpec {
  rows: number;
  cols: number;
  /** total cards = rows * cols (must be even). */
  pairs: number;
}

/**
 * Simple seedable RNG (mulberry32) so tests can be deterministic.
 * Returns a function producing floats in [0, 1).
 */
export const createRng = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Fisher–Yates shuffle using the supplied RNG (does not mutate input). */
export const shuffle = <T>(arr: readonly T[], rng: () => number = Math.random): T[] => {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

/**
 * Build a shuffled board of `pairs` matching pairs.
 * Values are 0..pairs-1, each appearing exactly twice.
 */
export const createBoard = (pairs: number, rng: () => number = Math.random): Card[] => {
  const values: number[] = [];
  for (let v = 0; v < pairs; v += 1) {
    values.push(v, v);
  }
  const shuffled = shuffle(values, rng);
  return shuffled.map((value, id) => ({ id, value, matched: false, matchedBy: null }));
};

/** True when two distinct, unmatched cards share a value. */
export const isMatch = (a: Card | undefined, b: Card | undefined): boolean => {
  if (!a || !b) return false;
  if (a.id === b.id) return false;
  if (a.matched || b.matched) return false;
  return a.value === b.value;
};

/** Indices of all cards still in play (unmatched). */
export const remainingIndices = (board: readonly Card[]): number[] => {
  const out: number[] = [];
  for (let i = 0; i < board.length; i += 1) {
    if (!board[i].matched) out.push(i);
  }
  return out;
};

/** True once every card has been matched. */
export const isBoardCleared = (board: readonly Card[]): boolean =>
  board.every((c) => c.matched);

export interface Scores {
  player: number;
  ai: number;
}

/** Tally matched pairs per owner. Each matched pair counts once. */
export const countScores = (board: readonly Card[]): Scores => {
  let player = 0;
  let ai = 0;
  for (const c of board) {
    if (!c.matched) continue;
    // Each pair has two matched cards; count each card as 0.5 → whole pairs.
    if (c.matchedBy === 'player') player += 1;
    else if (c.matchedBy === 'ai') ai += 1;
  }
  return { player: player / 2, ai: ai / 2 };
};

export type Winner = Owner | 'draw';

/** Decide the winner from final scores. */
export const decideWinner = (scores: Scores): Winner => {
  if (scores.player > scores.ai) return 'player';
  if (scores.ai > scores.player) return 'ai';
  return 'draw';
};
