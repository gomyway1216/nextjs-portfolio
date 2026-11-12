/**
 * Take-back tests: the single-player undo cuts the game record back to the
 * player's last placement and replays the rest, so these check the cut point
 * and that a replayed board is indistinguishable from the one originally
 * reached (discs, side to move, legal moves, hash) — including across passes.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { Board } from '@/components/game/Othello/Board';
import { initMobilityTables } from '@/components/game/Othello/MobilityTable';
import {
  clearCounted,
  countResult,
  emptyTally,
  lastPlacement,
  replayHistory,
  resultKey,
  takebackLength,
  withdrawCounted,
} from '@/components/game/Othello/takeback';
import { BLACK, Color, MAX_TURNS, Point, WHITE } from '@/components/game/Othello/types';

beforeAll(() => {
  initMobilityTables();
});

interface Entry {
  color: Color;
  move: Point | null;
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

function snapshot(b: Board): string {
  let cells = '';
  for (let y = 1; y <= 8; y++) {
    for (let x = 1; x <= 8; x++) cells += b.getColor(x, y) + 1;
  }
  const moves = b
    .getMovablePos()
    .map((p) => `${p.x}${p.y}`)
    .sort()
    .join(',');
  return `${cells}|${b.getCurrentColor()}|${b.getTurns()}|${b.getHash()}|${moves}`;
}

/** Random playout that records every placement and pass, plus a snapshot before each entry. */
function playout(seed: number): { history: Entry[]; before: string[]; final: Board } {
  const rng = mulberry32(seed);
  const board = new Board();
  const history: Entry[] = [];
  const before: string[] = [];
  while (!board.isGameOver() && board.getTurns() < MAX_TURNS) {
    before.push(snapshot(board));
    const color = board.getCurrentColor();
    const moves = board.getMovablePos();
    if (moves.length === 0) {
      history.push({ color, move: null });
      board.pass();
    } else {
      const move = moves[Math.floor(rng() * moves.length)];
      history.push({ color, move });
      board.move(move);
    }
  }
  return { history, before, final: board };
}

describe('takebackLength', () => {
  const h = (...entries: Array<[Color, Point | null]>): Entry[] =>
    entries.map(([color, move]) => ({ color, move }));
  const p = (x: number, y: number): Point => ({ x, y });

  it('is null before the player has placed a disc', () => {
    expect(takebackLength([], BLACK)).toBeNull();
    // Player is White and only the AI's opening move is on the record.
    expect(takebackLength(h([BLACK, p(4, 3)]), WHITE)).toBeNull();
  });

  it('drops the player move together with the reply that followed it', () => {
    const record = h([BLACK, p(4, 3)], [WHITE, p(3, 3)], [BLACK, p(3, 4)], [WHITE, p(5, 3)]);
    expect(takebackLength(record, BLACK)).toBe(2);
    expect(takebackLength(record, WHITE)).toBe(3);
  });

  it('keeps the AI opening move when the player is White', () => {
    const record = h([BLACK, p(4, 3)], [WHITE, p(3, 3)], [BLACK, p(3, 4)]);
    expect(takebackLength(record, WHITE)).toBe(1);
  });

  it('skips over passes to reach the last real placement', () => {
    const record = h([BLACK, p(4, 3)], [WHITE, p(3, 3)], [BLACK, null], [WHITE, p(5, 3)], [BLACK, null]);
    expect(takebackLength(record, BLACK)).toBe(0);
    expect(takebackLength(record, WHITE)).toBe(3);
  });
});

describe('replayHistory', () => {
  it('returns the opening position for an empty record', () => {
    expect(snapshot(replayHistory([])!)).toBe(snapshot(new Board()));
  });

  it('reproduces every position of random games, including after passes', () => {
    let passes = 0;
    let positions = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const { history, before, final } = playout(seed);
      passes += history.filter((e) => e.move === null).length;
      expect(snapshot(replayHistory(history)!)).toBe(snapshot(final));
      for (let i = 0; i < history.length; i += 3) {
        positions++;
        expect(snapshot(replayHistory(history.slice(0, i))!)).toBe(before[i]);
      }
    }
    expect(passes).toBeGreaterThan(0);
    expect(positions).toBeGreaterThan(500);
  });

  it('lands on a position where the player is to move with their undone move available', () => {
    for (let seed = 100; seed < 120; seed++) {
      const { history } = playout(seed);
      for (const player of [BLACK, WHITE] as Color[]) {
        for (let len = 1; len <= history.length; len += 5) {
          const record = history.slice(0, len);
          const keep = takebackLength(record, player);
          if (keep === null) continue;
          const undone = record[keep].move!;
          const board = replayHistory(record.slice(0, keep))!;
          expect(board.getCurrentColor()).toBe(player);
          expect(board.getMovablePos().some((m) => m.x === undone.x && m.y === undone.y)).toBe(true);
        }
      }
    }
  });

  it('rejects records that are not legal games', () => {
    // Wrong side to move.
    expect(replayHistory([{ color: WHITE, move: { x: 4, y: 3 } }])).toBeNull();
    // Placement that flips nothing.
    expect(replayHistory([{ color: BLACK, move: { x: 1, y: 1 } }])).toBeNull();
    // Occupied square.
    expect(replayHistory([{ color: BLACK, move: { x: 4, y: 4 } }])).toBeNull();
    // Pass while a move is available.
    expect(replayHistory([{ color: BLACK, move: null }])).toBeNull();
  });
});

describe('lastPlacement', () => {
  it('returns the most recent placement, ignoring passes', () => {
    expect(lastPlacement([])).toBeNull();
    expect(lastPlacement([{ color: BLACK, move: null }])).toBeNull();
    expect(
      lastPlacement([
        { color: BLACK, move: { x: 4, y: 3 } },
        { color: WHITE, move: { x: 3, y: 3 } },
        { color: BLACK, move: null },
      ])
    ).toEqual({ x: 3, y: 3 });
  });
});

describe('taking back a finished game', () => {
  it('returns to the position before the last placement of the player, with the game live again', () => {
    let checked = 0;
    for (let seed = 200; seed < 230; seed++) {
      const { history, before, final } = playout(seed);
      if (!final.isGameOver()) continue;
      for (const player of [BLACK, WHITE] as Color[]) {
        const keep = takebackLength(history, player);
        if (keep === null) continue;
        checked++;
        const board = replayHistory(history.slice(0, keep))!;
        expect(snapshot(board)).toBe(before[keep]);
        expect(board.isGameOver()).toBe(false);
        expect(board.getCurrentColor()).toBe(player);
        expect(board.getMovablePos().length).toBeGreaterThan(0);
      }
    }
    expect(checked).toBeGreaterThan(40);
  });
});

describe('session tally', () => {
  it('names the result from the side of the player', () => {
    expect(resultKey(BLACK, BLACK)).toBe('wins');
    expect(resultKey(WHITE, BLACK)).toBe('losses');
    expect(resultKey(BLACK, WHITE)).toBe('losses');
    expect(resultKey(null, WHITE)).toBe('draws');
  });

  it('counts a result and remembers which counter holds it', () => {
    expect(countResult(emptyTally(), 'losses')).toEqual({ wins: 0, losses: 1, draws: 0, counted: 'losses' });
  });

  it('withdraws a counted result exactly once', () => {
    const earlier = { wins: 2, losses: 1, draws: 1, counted: null };
    const finished = countResult(earlier, 'wins');
    expect(finished.wins).toBe(3);
    const resumed = withdrawCounted(finished);
    expect(resumed).toEqual(earlier);
    // A second take-back (now of an unfinished game) leaves earlier games alone.
    expect(withdrawCounted(resumed)).toBe(resumed);
    expect(withdrawCounted(withdrawCounted(resumed))).toEqual(earlier);
  });

  it('never goes negative', () => {
    let tally = countResult(emptyTally(), 'draws');
    for (let i = 0; i < 3; i++) tally = withdrawCounted(tally);
    expect(tally).toEqual(emptyTally());
    expect(withdrawCounted({ wins: 0, losses: 0, draws: 0, counted: 'wins' })).toEqual(emptyTally());
  });

  it('counts a replayed ending once, not twice', () => {
    let tally = countResult(emptyTally(), 'losses');
    tally = withdrawCounted(tally);
    tally = countResult(tally, 'wins');
    expect(tally).toEqual({ wins: 1, losses: 0, draws: 0, counted: 'wins' });
  });

  it('keeps a finished result when a new game starts', () => {
    const next = clearCounted(countResult(emptyTally(), 'wins'));
    expect(next).toEqual({ wins: 1, losses: 0, draws: 0, counted: null });
    expect(withdrawCounted(next)).toBe(next);
    expect(clearCounted(next)).toBe(next);
  });

  it('does not mutate its input', () => {
    const tally = countResult(emptyTally(), 'wins');
    withdrawCounted(tally);
    clearCounted(tally);
    countResult(tally, 'draws');
    expect(tally).toEqual({ wins: 1, losses: 0, draws: 0, counted: 'wins' });
  });
});
