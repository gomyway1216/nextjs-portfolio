import { Te } from './types';

/**
 * MoveListImproved
 *
 * A reusable move list to reduce allocations in the search.
 *
 * Why this matters:
 * - `generateLegalMoves()` is called at almost every node in the search tree.
 * - Allocating a brand new `Te[]` + a brand new `Te` object per move creates heavy GC pressure.
 * - GC pressure reduces the number of nodes searched within the same time budget, which directly weakens play.
 *
 * Design:
 * - `moves` holds `Te` objects that are reused across calls.
 * - `size` is the number of valid moves currently stored in `moves[0..size-1]`.
 * - `push(...)` mutates or allocates the `Te` at `moves[size]` and increments `size`.
 *
 * Usage pattern:
 * - `list.reset()`
 * - `list.push(...)` many times
 * - `list.trim()` to set `moves.length = size` so `Array.sort()` only touches valid moves.
 */
export class MoveListImproved {
  readonly moves: Te[] = [];
  size = 0;

  reset(): void {
    this.size = 0;
  }

  trim(): Te[] {
    this.moves.length = this.size;
    return this.moves;
  }

  push(koma: number, from: number, to: number, promote: boolean, capture: number): void {
    const index = this.size++;
    const te = this.moves[index];
    if (te) {
      te.koma = koma;
      te.from = from;
      te.to = to;
      te.promote = promote;
      te.capture = capture;
      te.value = 0;
      return;
    }
    this.moves[index] = new Te(koma, from, to, promote, capture);
  }
}

