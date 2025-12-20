/**
 * Shogi AI (Improved) - V14
 *
 * Goal:
 * - Make the engine stronger in the opening without slowing down the search.
 *
 * Approach:
 * - Reuse V12's search (fast + strong).
 * - Add an "opening book first" shortcut:
 *   - If `OpeningBookImproved` has a safe move for the current position, return it immediately.
 *   - Otherwise, fall back to the normal V12 search.
 *
 * Notes:
 * - The book is guarded internally (opening phase proxy + in-check rule + 1-ply safety threshold),
 *   so this wrapper stays simple.
 * - This keeps the rest of the engine unchanged, so midgame/endgame strength and speed remain V12-like.
 */

import type { Difficulty } from '../common/types';
import type { KyokumenImproved } from './KyokumenImproved';
import type { Te } from './types';
import { getOpeningMoveImproved } from './OpeningBookImproved';
import { ShogiAIImprovedV12, type ShogiAISearchOptions } from './ShogiAIImprovedV12';

export class ShogiAIImprovedV14 extends ShogiAIImprovedV12 {
  override getNextTe(k: KyokumenImproved, tesu: number = 0, options: ShogiAISearchOptions = {}): Te | null {
    const difficulty = (options.difficulty ?? 'medium') as Difficulty;
    const book = getOpeningMoveImproved(k, difficulty);
    if (book) return book;
    return super.getNextTe(k, tesu, options);
  }
}

