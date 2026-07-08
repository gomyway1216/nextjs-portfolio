/**
 * Memory Battle AI.
 *
 * The AI plays "concentration" and its strength is driven by how reliably it
 * remembers cards that have been revealed (its own flips AND the player's flips
 * that it witnessed). Each difficulty tier sets:
 *   - `memory`      : probability a revealed card is committed to memory,
 *   - `recall`      : probability a memorised card is still recalled at decision
 *                     time (models forgetting / noise),
 *   - `blunder`     : probability the AI ignores a known pair and plays randomly.
 *
 * The AI's memory is an explicit, testable model — not a lookup of the true
 * board — so on easier tiers it genuinely misses pairs it "should" know.
 */

import type { Difficulty } from '../common';
import type { Card } from './engine';
import { isMatch, remainingIndices } from './engine';

export interface AIConfig {
  /** Chance a revealed card gets stored in memory (0..1). */
  memory: number;
  /** Chance a stored card is correctly recalled when needed (0..1). */
  recall: number;
  /** Chance the AI blunders and plays randomly despite knowing a pair (0..1). */
  blunder: number;
}

export const AI_CONFIG: Record<Difficulty, AIConfig> = {
  // Forgetful and error-prone — beatable by a casual player.
  easy: { memory: 0.35, recall: 0.6, blunder: 0.35 },
  // Remembers over half of what it sees, occasional slips.
  medium: { memory: 0.6, recall: 0.75, blunder: 0.15 },
  // Sharp memory, rarely blunders.
  hard: { memory: 0.82, recall: 0.9, blunder: 0.05 },
  // Near-eidetic.
  expert: { memory: 0.94, recall: 0.97, blunder: 0.01 },
  // Perfect recall, never blunders — a memory god.
  master: { memory: 1, recall: 1, blunder: 0 },
};

/**
 * The AI's remembered knowledge: card id -> value.
 * Only ids present here are "known" to the AI.
 */
export type AIMemory = Map<number, number>;

export const createMemory = (): AIMemory => new Map();

/**
 * Called whenever a card is revealed to the table (by either player).
 * With probability `config.memory` the AI commits the (id -> value) to memory.
 * Matched cards need not be stored; callers should only pass revealed, in-play
 * cards. Returns the (mutated) memory for convenience.
 */
export const observeReveal = (
  memory: AIMemory,
  card: Card,
  config: AIConfig,
  rng: () => number = Math.random,
): AIMemory => {
  if (card.matched) return memory;
  if (rng() < config.memory) {
    memory.set(card.id, card.value);
  }
  return memory;
};

/** Drop matched cards from memory so stale entries don't mislead planning. */
export const forgetMatched = (memory: AIMemory, board: readonly Card[]): void => {
  for (const id of [...memory.keys()]) {
    const card = board[id];
    if (!card || card.matched) memory.delete(id);
  }
};

/**
 * Return a recalled snapshot of memory: each stored entry survives with
 * probability `config.recall`. Models the AI "blanking" on a card it saw.
 */
const recalledKnowledge = (
  memory: AIMemory,
  board: readonly Card[],
  config: AIConfig,
  rng: () => number,
): Map<number, number> => {
  const known = new Map<number, number>();
  for (const [id, value] of memory) {
    const card = board[id];
    if (!card || card.matched) continue;
    if (rng() < config.recall) known.set(id, value);
  }
  return known;
};

/**
 * Find a known matching pair among recalled cards. Returns the two board
 * indices, or null if the AI can't confidently pair anything from memory.
 */
const findKnownPair = (known: Map<number, number>): [number, number] | null => {
  const byValue = new Map<number, number[]>();
  for (const [id, value] of known) {
    const list = byValue.get(value) ?? [];
    list.push(id);
    byValue.set(value, list);
  }
  for (const ids of byValue.values()) {
    if (ids.length >= 2) return [ids[0], ids[1]];
  }
  return null;
};

const randomFrom = <T>(arr: readonly T[], rng: () => number): T =>
  arr[Math.floor(rng() * arr.length)];

export interface AITurnPlan {
  /** Board index of the first card the AI flips. */
  first: number;
  /**
   * Board index of the second card the AI flips. Chosen after seeing the first
   * card (the engine reveals `first` before the AI commits to `second`), so the
   * planner is allowed to look at the first card's value.
   */
  second: number;
  /** True if the AI believed this was a guaranteed match from memory. */
  confident: boolean;
}

/**
 * Plan a full two-card turn.
 *
 * Strategy (subject to blunder / recall noise):
 *  1. If a full pair is known from memory, flip both (unless blundering).
 *  2. Otherwise flip an unknown card first. Then:
 *     a. if its value's partner is known and in play, flip the partner;
 *     b. else flip another unknown card (exploration), avoiding re-flipping a
 *        card whose partner we already know is elsewhere when possible.
 */
export const planTurn = (
  board: readonly Card[],
  memory: AIMemory,
  config: AIConfig,
  rng: () => number = Math.random,
): AITurnPlan => {
  const inPlay = remainingIndices(board);
  if (inPlay.length < 2) {
    // Degenerate: shouldn't happen in a normal game, but stay safe.
    const only = inPlay[0] ?? 0;
    return { first: only, second: only, confident: false };
  }

  const known = recalledKnowledge(memory, board, config, rng);
  const blundering = rng() < config.blunder;

  // 1) Known full pair → take it (unless we blunder this turn).
  if (!blundering) {
    const pair = findKnownPair(known);
    if (pair) {
      return { first: pair[0], second: pair[1], confident: true };
    }
  }

  // 2) First flip: prefer an unknown card so we gain information; fall back to
  //    any in-play card.
  const unknownInPlay = inPlay.filter((i) => !known.has(i));
  const first = unknownInPlay.length > 0
    ? randomFrom(unknownInPlay, rng)
    : randomFrom(inPlay, rng);

  const firstValue = board[first].value;

  // 2a) If we now know where the partner of `first` is, flip it.
  if (!blundering) {
    for (const [id, value] of known) {
      if (id !== first && value === firstValue && isMatch(board[first], board[id])) {
        return { first, second: id, confident: true };
      }
    }
  }

  // 2b) Otherwise explore: pick a second card we don't already know pairs
  //     elsewhere. Prefer unknown cards to maximise information gain.
  const candidates = inPlay.filter((i) => i !== first);
  const unknownCandidates = candidates.filter((i) => !known.has(i));
  const pool = unknownCandidates.length > 0 ? unknownCandidates : candidates;
  const second = randomFrom(pool, rng);
  return { first, second, confident: false };
};
