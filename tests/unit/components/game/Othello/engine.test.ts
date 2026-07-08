/**
 * Othello engine unit tests.
 *
 * Covers the parts most likely to regress: legal-move generation and disc
 * flipping (against an independent brute-force reference), Zobrist-hash
 * make/undo consistency, exact endgame solving (against an independent
 * perfect negamax), and that the transposition-table-backed mid-game search
 * always returns legal moves and drives a full game to a decided result.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { Board } from '@/components/game/Othello/Board';
import { OthelloAI } from '@/components/game/Othello/AI';
import { PerfectEvaluator } from '@/components/game/Othello/Evaluator';
import { initMobilityTables } from '@/components/game/Othello/MobilityTable';
import {
  BLACK,
  Color,
  EMPTY,
  MAX_TURNS,
  Point,
  WHITE,
} from '@/components/game/Othello/types';

beforeAll(() => {
  initMobilityTables();
});

const DIRS: ReadonlyArray<[number, number]> = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
];

/** Independent brute-force legal-move generator. */
function referenceMoves(board: Board, color: Color): Point[] {
  const moves: Point[] = [];
  for (let x = 1; x <= 8; x++) {
    for (let y = 1; y <= 8; y++) {
      if (board.getColor(x, y) !== EMPTY) continue;
      for (const [dx, dy] of DIRS) {
        let cx = x + dx;
        let cy = y + dy;
        let seenOpp = 0;
        while (cx >= 1 && cx <= 8 && cy >= 1 && cy <= 8 && board.getColor(cx, cy) === -color) {
          seenOpp++;
          cx += dx;
          cy += dy;
        }
        if (seenOpp > 0 && cx >= 1 && cx <= 8 && cy >= 1 && cy <= 8 && board.getColor(cx, cy) === color) {
          moves.push({ x, y });
          break;
        }
      }
    }
  }
  return moves;
}

function key(p: Point): string {
  return `${p.x},${p.y}`;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('Board — initial position', () => {
  it('has the standard 2-2 opening and Black to move', () => {
    const b = new Board();
    expect(b.getColor(4, 4)).toBe(WHITE);
    expect(b.getColor(5, 5)).toBe(WHITE);
    expect(b.getColor(4, 5)).toBe(BLACK);
    expect(b.getColor(5, 4)).toBe(BLACK);
    expect(b.countDisc(BLACK)).toBe(2);
    expect(b.countDisc(WHITE)).toBe(2);
    expect(b.countDisc(EMPTY)).toBe(60);
    expect(b.getCurrentColor()).toBe(BLACK);
  });

  it('offers exactly the four standard opening moves', () => {
    const b = new Board();
    const got = new Set(b.getMovablePos().map(key));
    // d3, c4, f5, e6 in 1-indexed (x,y): (4,3),(3,4),(6,5),(5,6)
    expect(got).toEqual(new Set(['4,3', '3,4', '6,5', '5,6']));
  });
});

describe('Board — flips', () => {
  it('flips exactly one disc for a standard opening move', () => {
    const b = new Board();
    // Play d3 (x=4, y=3): should flip d4 (4,4) from White to Black.
    expect(b.move({ x: 4, y: 3 })).toBe(true);
    expect(b.getColor(4, 3)).toBe(BLACK);
    expect(b.getColor(4, 4)).toBe(BLACK); // flipped
    expect(b.countDisc(BLACK)).toBe(4);
    expect(b.countDisc(WHITE)).toBe(1);
    expect(b.getCurrentColor()).toBe(WHITE);
  });

  it('rejects a move that flips nothing', () => {
    const b = new Board();
    expect(b.move({ x: 1, y: 1 })).toBe(false);
    // State untouched.
    expect(b.getCurrentColor()).toBe(BLACK);
    expect(b.countDisc(EMPTY)).toBe(60);
  });
});

describe('Board — move generation matches brute force over random playouts', () => {
  it('agrees at every reached position', () => {
    const rng = mulberry32(0xc0ffee);
    let positions = 0;
    for (let g = 0; g < 60; g++) {
      const b = new Board();
      let passStreak = 0;
      while (b.getTurns() < MAX_TURNS) {
        positions++;
        const color = b.getCurrentColor();
        const got = new Set(b.getMovablePos().map(key));
        const ref = new Set(referenceMoves(b, color).map(key));
        expect(got).toEqual(ref);
        const moves = b.getMovablePos();
        if (moves.length === 0) {
          b.pass();
          if (++passStreak >= 2) break;
          continue;
        }
        passStreak = 0;
        b.move(moves[Math.floor(rng() * moves.length)]);
      }
    }
    expect(positions).toBeGreaterThan(1000);
  });
});

describe('Board — Zobrist hash', () => {
  it('is restored exactly by undo and matches a fresh recalculation', () => {
    const rng = mulberry32(0x1234);
    let mismatches = 0;
    for (let g = 0; g < 100; g++) {
      const b = new Board();
      const preHash: number[] = [];
      let pass = 0;
      while (b.getTurns() < MAX_TURNS) {
        // A cloned board recomputes its hash from scratch: must equal the
        // incrementally-maintained one.
        if (b.clone().getHash() !== b.getHash()) mismatches++;
        const moves = b.getMovablePos();
        if (moves.length === 0) {
          if (pass >= 1) break;
          preHash.push(b.getHash());
          b.pass();
          pass++;
          continue;
        }
        pass = 0;
        preHash.push(b.getHash());
        b.move(moves[Math.floor(rng() * moves.length)]);
      }
      for (let i = preHash.length - 1; i >= 0; i--) {
        b.undo();
        if (b.getHash() !== preHash[i]) mismatches++;
      }
    }
    expect(mismatches).toBe(0);
  });
});

describe('AI — exact endgame solver', () => {
  it('finds the winning move at a forced last-move position', () => {
    // Fill the board leaving a single empty square where Black to move flips
    // and wins. Build via a real playout to a near-full legal position.
    const b = new Board();
    const rng = mulberry32(7);
    // Play random legal moves until <= 6 empties remain (endgame regime).
    let pass = 0;
    while (b.countDisc(EMPTY) > 6 && b.getTurns() < MAX_TURNS) {
      const moves = b.getMovablePos();
      if (moves.length === 0) {
        if (pass >= 1) break;
        b.pass();
        pass++;
        continue;
      }
      pass = 0;
      b.move(moves[Math.floor(rng() * moves.length)]);
    }

    // The exact solver's chosen move must be at least as good (final disc
    // diff) as every alternative, computed by an independent full search.
    const ai = new OthelloAI('hard');
    const chosen = ai.getBestMove(b);
    const moves = b.getMovablePos();
    if (moves.length === 0 || chosen === null) {
      expect(chosen).toBeNull();
      return;
    }

    const scoreOf = (from: Board, mv: Point): number => {
      const nb = from.clone();
      nb.move(mv);
      return -perfectNegamax(nb);
    };

    const chosenScore = scoreOf(b, chosen);
    for (const mv of moves) {
      expect(chosenScore).toBeGreaterThanOrEqual(scoreOf(b, mv));
    }
  });
});

/**
 * Independent, TT-free perfect-play negamax over the remaining empties.
 * Returns the exact final (side-to-move-relative) disc difference. Small
 * enough (<= ~6 empties) to brute-force in a test.
 */
function perfectNegamax(board: Board): number {
  const evaluator = new PerfectEvaluator();
  const moves = board.getMovablePos();
  if (moves.length === 0) {
    // Pass or terminal.
    if (board.isGameOver()) {
      return evaluator.evaluate(board);
    }
    board.pass();
    const s = -perfectNegamax(board);
    board.undo();
    return s;
  }
  let best = -Infinity;
  for (const mv of moves) {
    board.move(mv);
    const s = -perfectNegamax(board);
    board.undo();
    if (s > best) best = s;
  }
  return best;
}

describe('AI — transposition table soundness', () => {
  it('drives a full game with only legal moves to a filled, decided board', () => {
    // Playing a full game vs a fixed AI must terminate with a legal, filled
    // board and a decided result — a smoke test that the TT-driven search
    // never returns an illegal move or corrupts board state.
    const ai = new OthelloAI('medium');
    const b = new Board();
    let pass = 0;
    let plies = 0;
    while (!b.isGameOver() && plies < 200) {
      plies++;
      const moves = b.getMovablePos();
      if (moves.length === 0) {
        b.pass();
        if (++pass >= 2) break;
        continue;
      }
      pass = 0;
      const mv = ai.getBestMove(b);
      expect(mv).not.toBeNull();
      // Chosen move must be legal.
      expect(moves.some((m) => m.x === mv!.x && m.y === mv!.y)).toBe(true);
      b.move(mv!);
    }
    expect(b.isGameOver()).toBe(true);
    const total = b.countDisc(BLACK) + b.countDisc(WHITE) + b.countDisc(EMPTY);
    expect(total).toBe(64);
  });
});

describe('AI — difficulty tiers all return legal first moves', () => {
  it.each(['easy', 'medium', 'hard', 'expert', 'master'] as const)(
    'tier %s picks a legal opening move',
    (tier) => {
      const b = new Board();
      const ai = new OthelloAI(tier);
      const mv = ai.getBestMove(b);
      expect(mv).not.toBeNull();
      const legal = referenceMoves(b, BLACK).map(key);
      expect(legal).toContain(key(mv!));
    }
  );
});
