import { describe, expect, it } from 'vitest';

import {
  COLUMN_WEIGHTS,
  DRAW_NUMBERS,
  HOLES,
  LINES,
  MARBLES,
  MOST_WIN,
  OUT_WEIGHTS,
  PAYS,
  SIZE,
  SLOTS,
  STAKE,
  TYPICAL_QUARTERS,
  WEIGHT_TOTAL,
  WINDOWS,
  bestShot,
  checkPlays,
  drawPlay,
  entryOf,
  finishedShots,
  holeAt,
  isDraw,
  isShot,
  labelOf,
  landing,
  linesOf,
  numbersFor,
  payFor,
  playOf,
  seeded,
  shotsFit,
  slotFor,
  valueOf,
  type Draw,
  type Entry,
} from '@/components/game/SmartBall/engine';
import { publishedOdds } from '@/components/game/SmartBall/odds';

// Hot Spring Smart Ball's rules. Its exact returns are worked out in odds.test.ts; here the board, the draw and a play
// are pinned, and the published returns are checked by playing.

/** A draw that drops marble `m`, shot at strength 3, at `entries[m]` (null: OUT), every blind shot at strength 3 too. */
const drawFor = (entries: (Entry | null)[], window = 3): Draw => ({
  drops: Array.from({ length: MARBLES }, (_, m) => slotFor(window, m < entries.length ? entries[m] : null)),
  blinds: Array.from({ length: MARBLES }, () => window),
});
const at = (row: number, col: number): Entry => ({ row, col });

describe('the board', () => {
  it('has sixteen holes in a square, ten lines, and seven strengths whose chances add up', () => {
    expect(HOLES).toBe(16);
    expect(LINES).toHaveLength(10);
    expect(LINES.filter((l) => l.kind === 'row')).toHaveLength(4);
    expect(LINES.filter((l) => l.kind === 'column')).toHaveLength(4);
    expect(LINES.filter((l) => l.kind === 'diagonal').map((l) => l.holes)).toEqual([
      [0, 5, 10, 15],
      [3, 6, 9, 12],
    ]);
    expect(COLUMN_WEIGHTS).toHaveLength(WINDOWS);
    for (let w = 0; w < WINDOWS; w++) {
      expect(COLUMN_WEIGHTS[w].reduce((a, b) => a + b, 0) + OUT_WEIGHTS[w]).toBe(WEIGHT_TOTAL);
      // The strengths mirror each other about the middle one: as much to the left at 7 as to the right at 1.
      expect([...COLUMN_WEIGHTS[WINDOWS - 1 - w]].reverse()).toEqual(COLUMN_WEIGHTS[w]);
      expect(OUT_WEIGHTS[WINDOWS - 1 - w]).toBe(OUT_WEIGHTS[w]);
    }
    // Soft shots fall over the right of the board, hard ones over the left.
    const middle = (w: number) => COLUMN_WEIGHTS[w].reduce((sum, weight, c) => sum + weight * c, 0) / COLUMN_WEIGHTS[w].reduce((a, b) => a + b, 0);
    for (let w = 1; w < WINDOWS; w++) expect(middle(w)).toBeLessThan(middle(w - 1));
    // Missing every hole is likeliest at the ends of the gauge.
    expect(Math.max(...OUT_WEIGHTS)).toBe(OUT_WEIGHTS[0]);
    expect(Math.min(...OUT_WEIGHTS)).toBe(OUT_WEIGHTS[3]);
  });

  it('pays 7, 20 and 100 for one, two and three lines, and ten marbles never make four', () => {
    expect(STAKE).toBe(5);
    expect(MARBLES).toBe(10);
    expect(PAYS).toEqual([0, 7, 20, 100]);
    expect(MOST_WIN).toBe(100);
    expect(payFor(0)).toBe(0);
    expect(payFor(5)).toBe(100);
    // Every set of lit holes: the fewest that make each number of lines. Four take eleven, so ten marbles make three
    // at the most (a row, a column and the diagonal that joins their far ends take nine).
    const fewest = new Map<number, number>();
    for (let lit = 0; lit < 1 << HOLES; lit++) {
      let count = 0;
      for (let b = lit; b; b &= b - 1) count += 1;
      const lines = linesOf(lit).length;
      fewest.set(lines, Math.min(fewest.get(lines) ?? HOLES, count));
    }
    expect([1, 2, 3, 4].map((n) => fewest.get(n))).toEqual([4, 7, 9, 11]);
    expect(fewest.get(4)!).toBeGreaterThan(MARBLES);
  });

  it('shares each strength’s 96 slots among its holes as their chances say, column by column from the left, OUT last', () => {
    for (let w = 0; w < WINDOWS; w++) {
      const counts = new Map<string, number>();
      for (let slot = 0; slot < SLOTS; slot++) {
        const entry = entryOf(w, slot);
        const key = entry ? `${entry.row},${entry.col}` : 'out';
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      for (let c = 0; c < SIZE; c++) for (let r = 0; r < SIZE; r++) expect(counts.get(`${r},${c}`) ?? 0).toBe(COLUMN_WEIGHTS[w][c]);
      expect(counts.get('out')).toBe(SIZE * OUT_WEIGHTS[w]);
      expect(entryOf(w, SLOTS - 1)).toBeNull();
    }
    expect(slotFor(0, at(0, 0))).toBe(-1);
    expect(entryOf(3, slotFor(3, at(2, 1)))).toEqual(at(2, 1));
  });

  it('rolls a marble that comes to a lit hole on down its column, into the next one that is not, or OUT', () => {
    const lit = (1 << holeAt(1, 2)) | (1 << holeAt(2, 2));
    expect(landing(lit, at(1, 2))).toEqual({ hole: holeAt(3, 2), over: [holeAt(1, 2), holeAt(2, 2)], past: [holeAt(0, 2)] });
    expect(landing(lit, at(0, 2))).toEqual({ hole: holeAt(0, 2), over: [], past: [] });
    const full = lit | (1 << holeAt(3, 2));
    expect(landing(full, at(1, 2)).hole).toBeNull();
    expect(landing(full, null)).toEqual({ hole: null, over: [], past: [] });
  });
});

describe('the draw', () => {
  it('takes twenty numbers, two a marble, and a test can rig any play by them', () => {
    expect(DRAW_NUMBERS).toBe(20);
    const wanted: Draw = { drops: [0, 95, 17, 40, 63, 1, 2, 3, 50, 88], blinds: [0, 6, 3, 2, 5, 1, 4, 3, 3, 0] };
    const numbers = numbersFor(wanted);
    expect(numbers).toHaveLength(DRAW_NUMBERS);
    let i = 0;
    expect(drawPlay(() => numbers[i++])).toEqual(wanted);
    expect(i).toBe(DRAW_NUMBERS);
    const random = seeded(5);
    for (let n = 0; n < 200; n++) expect(isDraw(drawPlay(random))).toBe(true);
    expect(isDraw(drawPlay(() => 0.999999999))).toBe(true);
    expect(isDraw(drawPlay(() => 0))).toBe(true);
    expect(isDraw({ ...wanted, drops: [96, ...wanted.drops.slice(1)] })).toBe(false);
    expect(isDraw({ ...wanted, blinds: [7, ...wanted.blinds.slice(1)] })).toBe(false);
    expect(isDraw({ ...wanted, drops: wanted.drops.slice(1) })).toBe(false);
  });
});

describe('a play', () => {
  it('lights the holes the marbles drop into, and pays the lines once the tenth has been shot', () => {
    // The top row, then the left-hand column, then the diagonal: three lines from ten marbles.
    const triple = drawFor([at(0, 0), at(0, 1), at(0, 2), at(0, 3), at(1, 0), at(2, 0), at(3, 0), at(1, 1), at(2, 2), at(3, 3)]);
    const shots = Array.from({ length: MARBLES }, () => 3);
    const part = playOf(triple, shots.slice(0, 4));
    expect(part).toMatchObject({ complete: false, won: 0 });
    expect(part.lines).toEqual([0]);
    const whole = playOf(triple, shots);
    expect(whole).toMatchObject({ complete: true, won: 100 });
    expect(whole.lines).toEqual([0, 4, 8]);
    expect(labelOf(whole)).toBe('smart-triple');
    // A row: one line.
    const single = playOf(drawFor([at(2, 0), at(2, 1), at(2, 2), at(2, 3)]), shots);
    expect(single).toMatchObject({ won: 7, lines: [2] });
    expect(labelOf(single)).toBe('smart-line');
    // Every marble OUT: nothing.
    const none = playOf(drawFor([]), shots);
    expect(none).toMatchObject({ won: 0, lit: 0, lines: [] });
    expect(labelOf(none)).toBeNull();
    // Two in the same hole: the second rolls on down into the one under it.
    const stacked = playOf(drawFor([at(1, 3), at(1, 3)]), shots);
    expect(stacked.marbles[1]).toMatchObject({ entry: at(1, 3), hole: holeAt(2, 3), over: [holeAt(1, 3)], past: [holeAt(0, 3)] });
  });

  it('finishes a play left mid-way with blind shots, at the strengths drawn for them', () => {
    const d: Draw = { drops: Array.from({ length: MARBLES }, () => 0), blinds: [0, 1, 2, 3, 4, 5, 6, 0, 1, 2] };
    expect(finishedShots(d, [6, 6])).toEqual([6, 6, 2, 3, 4, 5, 6, 0, 1, 2]);
    const finished = playOf(d, [6, 6], true);
    expect(finished.complete).toBe(true);
    expect(finished.marbles.map((m) => m.blind)).toEqual([false, false, true, true, true, true, true, true, true, true]);
    expect(shotsFit([0, 6, 3])).toBe(true);
    expect(shotsFit([7])).toBe(false);
    expect(shotsFit(Array.from({ length: 11 }, () => 3))).toBe(false);
    expect(isShot(3)).toBe(true);
    expect(isShot(-1)).toBe(false);
    expect(isShot(2.5)).toBe(false);
  });
});

describe('the players', () => {
  it('spreads an everyday hand over the strength aimed at and its neighbours, a quarter falling off either end staying on it', () => {
    expect(TYPICAL_QUARTERS(3)).toEqual([
      { window: 3, quarters: 2 },
      { window: 2, quarters: 1 },
      { window: 4, quarters: 1 },
    ]);
    expect(TYPICAL_QUARTERS(0)).toEqual([
      { window: 0, quarters: 3 },
      { window: 1, quarters: 1 },
    ]);
    expect(TYPICAL_QUARTERS(6)).toEqual([
      { window: 6, quarters: 3 },
      { window: 5, quarters: 1 },
    ]);
  });

  it('shoots the first marble of perfect play at the middle strength, and aims across for a line it can finish', () => {
    expect(bestShot(0, MARBLES)).toBe(3);
    // Three holes of the right-hand column lit and one marble left: perfect play shoots for the last of them.
    const three = (1 << holeAt(1, 3)) | (1 << holeAt(2, 3)) | (1 << holeAt(3, 3));
    expect(COLUMN_WEIGHTS[bestShot(three, 1)][3]).toBe(Math.max(...COLUMN_WEIGHTS.map((w) => w[3])));
  });

  it('brings back what the exact figures say when played, perfect, everyday and blind', { timeout: 20_000 }, () => {
    const odds = publishedOdds();
    for (const player of ['perfect', 'typical', 'blind'] as const) {
      const seen = checkPlays(6_000, player, seeded(11));
      // About three standard errors of 6,000 plays (a play's return varies by about 1.6 of its stake at most).
      expect(Math.abs(seen.back - valueOf(odds[player].back)), player).toBeLessThan(0.065);
    }
  });
});
