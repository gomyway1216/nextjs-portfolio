/**
 * Othello move-generation & make/undo correctness check.
 *
 * The Board uses Thell-style line-index + mobility-table move generation with
 * incremental index updates on move/undo. That incremental machinery is the
 * most error-prone part of the engine, so before trusting any A/B result we
 * verify it against an independent, brute-force directional reference:
 *
 *   1. getMovablePos() must equal a from-scratch 8-direction legality scan
 *      at every position reached during random playouts.
 *   2. move() then undo() must restore the exact board (every square), disc
 *      counts, turn number and side-to-move.
 *
 * Run: npx tsx scripts/othello-perft.ts [numGames]
 */

import { Board } from '../src/components/game/Othello/Board';
import { BLACK, WHITE, EMPTY, MAX_TURNS, type Color, type Point } from '../src/components/game/Othello/types';

const DIRS = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
];

/** Independent brute-force legal-move generator (does not touch mobility tables). */
function referenceMoves(board: Board, color: Color): Point[] {
  const moves: Point[] = [];
  for (let x = 1; x <= 8; x++) {
    for (let y = 1; y <= 8; y++) {
      if (board.getColor(x, y) !== EMPTY) continue;
      let legal = false;
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
          legal = true;
          break;
        }
      }
      if (legal) moves.push({ x, y });
    }
  }
  return moves;
}

function snapshot(board: Board): string {
  let s = `${board.getTurns()}|${board.getCurrentColor()}|`;
  for (let x = 1; x <= 8; x++) {
    for (let y = 1; y <= 8; y++) s += board.getColor(x, y) + ',';
  }
  s += `#${board.countDisc(BLACK)}/${board.countDisc(WHITE)}/${board.countDisc(EMPTY)}`;
  return s;
}

function keyOf(p: Point): string {
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

function main(): void {
  const numGames = parseInt(process.argv[2] ?? '300', 10);
  const rng = mulberry32(0xbeef);

  let positions = 0;
  let moveMismatches = 0;
  let undoMismatches = 0;

  for (let g = 0; g < numGames; g++) {
    const board = new Board();
    let passStreak = 0;

    while (board.getTurns() < MAX_TURNS) {
      positions++;
      const color = board.getCurrentColor();

      // 1. Compare mobility-table move list to brute-force reference (as sets).
      const got = board.getMovablePos();
      const ref = referenceMoves(board, color);
      const gotSet = new Set(got.map(keyOf));
      const refSet = new Set(ref.map(keyOf));
      let mismatch = gotSet.size !== refSet.size;
      if (!mismatch) {
        for (const k of refSet) if (!gotSet.has(k)) mismatch = true;
      }
      if (mismatch) {
        moveMismatches++;
        if (moveMismatches <= 5) {
          console.error(
            `Move mismatch (game ${g}, turn ${board.getTurns()}, color ${color}):\n` +
              `  table: ${[...gotSet].sort().join(' ')}\n` +
              `  ref:   ${[...refSet].sort().join(' ')}`,
          );
        }
      }

      if (got.length === 0) {
        board.pass();
        passStreak++;
        if (passStreak >= 2) break;
        continue;
      }
      passStreak = 0;

      // 2. Verify make/undo round-trips exactly for every legal move.
      const before = snapshot(board);
      for (const mv of got) {
        board.move(mv);
        board.undo();
        const after = snapshot(board);
        if (after !== before) {
          undoMismatches++;
          if (undoMismatches <= 5) {
            console.error(
              `Undo mismatch (game ${g}, turn ${board.getTurns()}, move ${keyOf(mv)}):\n` +
                `  before: ${before}\n  after:  ${after}`,
            );
          }
        }
      }

      // Advance with a random legal move.
      const mv = got[Math.floor(rng() * got.length)];
      board.move(mv);
    }
  }

  console.log(
    `Checked ${positions} positions across ${numGames} random games.\n` +
      `Move-gen mismatches: ${moveMismatches}\nMake/undo mismatches: ${undoMismatches}`,
  );
  if (moveMismatches === 0 && undoMismatches === 0) {
    console.log('PASS: move generation and make/undo are correct.');
    process.exit(0);
  } else {
    console.error('FAIL: correctness violations detected.');
    process.exit(1);
  }
}

main();
