import { describe, expect, it } from 'vitest';

import {
  BALLS,
  BETS,
  DRAWN,
  LAST_BALL_TIMES,
  MOST_WIN,
  PAYS,
  SPOT_COUNTS,
  TOP_PAY,
  analyze,
  catchChance,
  checkGames,
  choose,
  drawBalls,
  fraction,
  gameOf,
  isDraw,
  isSpots,
  labelOf,
  numbersFor,
  oddsOf,
  quickPick,
  seeded,
  valueOf,
  winOf,
  type Board,
  type Fraction,
} from '@/components/game/Keno/engine';
import { getStrings } from '@/components/game/Keno/i18n';

// Video Keno's paytables and their returns, worked out exactly from the hypergeometric chances, the last ball's ×5
// included, and checked here three ways: pinned to the fraction, against every ordered draw of a smaller board, and
// against play.

const text = (f: Fraction) => `${f.num}/${f.den}`;
/** Random numbers served from a list, as rigPresses.ts serves a press. */
const served = (numbers: readonly number[]) => {
  const queue = [...numbers];
  return () => {
    const next = queue.shift();
    if (next === undefined) throw new Error('ran out of numbers');
    return next;
  };
};

describe('the paytables', () => {
  it('bring back about 90% on every number of spots, exactly, and none more than the medals played', () => {
    const odds = analyze();
    expect(odds.tickets.map((ticket) => text(ticket.back))).toEqual([
      '9/10',
      '1417/1580',
      '4617/5135',
      '1423119/1581580',
      '71130/79079',
      '9951/11060',
      '3760461/4179890',
      '274569261/305131970',
      '1372748691/1525659850',
      '9746676504/10832184935',
    ]);
    expect(odds.tickets.map((ticket) => (valueOf(ticket.back) * 100).toFixed(2))).toEqual(['90.00', '89.68', '89.91', '89.98', '89.95', '89.97', '89.97', '89.98', '89.98', '89.98']);
    for (const ticket of odds.tickets) {
      expect(valueOf(ticket.back), `${ticket.spots} spots`).toBeGreaterThan(0.895);
      expect(valueOf(ticket.back), `${ticket.spots} spots`).toBeLessThanOrEqual(0.9);
    }
    // The best is one spot, at exactly nine tenths; the least, two.
    expect(odds.bestSpots).toBe(1);
    expect(text(odds.best)).toBe('9/10');
    expect(text(odds.worst)).toBe('1417/1580');
  });

  it('pays more for more caught, and the top for every spot caught', () => {
    for (const n of SPOT_COUNTS) {
      const pays = PAYS[n];
      expect(pays, `${n} spots`).toHaveLength(n + 1);
      expect(pays[n], `${n} spots`).toBe(Math.max(...pays));
      for (let c = 2; c <= n; c++) if (pays[c - 1] > 0) expect(pays[c], `${n} spots, ${c} caught`).toBeGreaterThan(pays[c - 1]);
      for (const pay of pays) expect(Number.isInteger(pay) && pay >= 0).toBe(true);
    }
    expect(TOP_PAY).toBe(2_000 * LAST_BALL_TIMES);
    expect(MOST_WIN).toBe(100_000);
  });

  it('needs the last ball’s ×5 for one spot, and gives two spots the medal back on a catch of none, as the Odds tab says', () => {
    // One spot pays 3 for a catch: 75% alone, a whole medal more would be 100%. With the last ball, 90% exactly.
    expect(text(oddsOf(1).table)).toBe('3/4');
    expect(text(oddsOf(1, [0, 4]).table)).toBe('1/1');
    // Two spots with whole medals and no medal back: 84.2% or 92.6%, nothing between.
    expect((valueOf(oddsOf(2, [0, 0, 10]).back) * 100).toFixed(1)).toBe('84.2');
    expect((valueOf(oddsOf(2, [0, 0, 11]).back) * 100).toFixed(1)).toBe('92.6');
    for (const language of ['en', 'ja'] as const) {
      const t = getStrings(language);
      expect(t.twoSpotNote).toContain('84.2%');
      expect(t.twoSpotNote).toContain('92.6%');
      expect(t.twoSpotNote).toContain('89.68%');
      expect(t.oneSpotNote).toContain('75%');
      expect(t.oneSpotNote).toContain('90%');
    }
  });

  it('works out every catch’s chance as the hypergeometric distribution, which adds up to one', () => {
    expect(choose(80, 20).toString()).toBe('3535316142212174320');
    for (const n of SPOT_COUNTS) {
      const total = oddsOf(n).lines.reduce((sum, line) => sum + valueOf(line.chance), 0);
      expect(total).toBeCloseTo(1, 12);
    }
    // One spot is caught one game in four; all ten of ten, one in 8,911,711.
    expect(text(catchChance(1, 1))).toBe('1/4');
    expect(Math.round(1 / valueOf(catchChance(10, 10)))).toBe(8_911_711);
    expect(text(oddsOf(10).lastBall)).toBe('1/8');
  });

  it('adds up every ordered draw of a smaller board to the same returns: the last ball is one of a catch of c, c times in the draws', () => {
    // A board of 10 balls with 4 drawn: every ordered draw (5,040 of them), and tickets of 1 to 4 spots.
    const board: Board = { balls: 10, drawn: 4 };
    const draws: number[][] = [];
    const walk = (draw: number[]) => {
      if (draw.length === board.drawn) {
        draws.push(draw);
        return;
      }
      for (let b = 1; b <= board.balls; b++) if (!draw.includes(b)) walk([...draw, b]);
    };
    walk([]);
    expect(draws).toHaveLength(5_040);
    const tables: Record<number, number[]> = { 1: [0, 3], 2: [1, 0, 7], 3: [0, 1, 4, 30], 4: [2, 0, 1, 9, 120] };
    for (const [spotsText, pays] of Object.entries(tables)) {
      const spots = Array.from({ length: Number(spotsText) }, (_, i) => i + 1);
      let back = 0;
      for (const draw of draws) {
        const caught = draw.filter((b) => spots.includes(b)).length;
        const last = spots.includes(draw[board.drawn - 1]);
        back += pays[caught] * (last && pays[caught] > 0 ? LAST_BALL_TIMES : 1);
      }
      expect(text(oddsOf(spots.length, pays, board).back), `${spots.length} spots`).toBe(text(fraction(back, draws.length)));
    }
  });

  it('comes back about as worked out in play: forty thousand one-spot games, and twenty thousand of four spots', () => {
    const one = checkGames(40_000, 1, seeded(11));
    expect(Math.abs(one.back - 0.9)).toBeLessThan(0.03);
    // A catch on the last ball happens one game in 80 for one spot.
    expect(Math.abs(one.lastBalls / one.games - 1 / 80)).toBeLessThan(0.003);
    const four = checkGames(20_000, 4, seeded(12));
    expect(Math.abs(four.hits / four.games - valueOf(oddsOf(4).hit))).toBeLessThan(0.012);
  });
});

describe('the draw', () => {
  it('draws twenty different balls of the eighty, in order, from twenty random numbers', () => {
    const random = seeded(5);
    for (let i = 0; i < 200; i++) {
      const balls = drawBalls(random);
      expect(isDraw(balls)).toBe(true);
      expect(balls.every((b) => b >= 1 && b <= BALLS)).toBe(true);
    }
    // Every ball is as likely as any other to be among the twenty, and to come out last.
    const counts = new Array<number>(BALLS + 1).fill(0);
    const lasts = new Array<number>(BALLS + 1).fill(0);
    const many = seeded(6);
    for (let i = 0; i < 8_000; i++) {
      const balls = drawBalls(many);
      for (const b of balls) counts[b] += 1;
      lasts[balls[DRAWN - 1]] += 1;
    }
    for (let b = 1; b <= BALLS; b++) {
      expect(Math.abs(counts[b] / 8_000 - 0.25)).toBeLessThan(0.03);
      expect(lasts[b]).toBeGreaterThan(40);
    }
  });

  it('is rigged by the numbers that draw it, as a test rigs a press, and a quick pick likewise', () => {
    const wanted = [80, 1, 40, 41, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
    expect(drawBalls(served(numbersFor(wanted)))).toEqual(wanted);
    expect(quickPick(4, served(numbersFor([70, 3, 33, 12])))).toEqual([3, 12, 33, 70]);
    // A quick pick of more than ten is ten, of fewer than one is one.
    expect(quickPick(15, seeded(1))).toHaveLength(10);
    expect(quickPick(0, seeded(1))).toHaveLength(1);
    expect(isSpots(quickPick(10, seeded(2)))).toBe(true);
    expect(() => numbersFor([1, 1])).toThrow();
  });

  it('takes only a ticket of 1 to 10 different numbers in order, and a draw of twenty different balls', () => {
    expect(isSpots([1])).toBe(true);
    expect(isSpots([1, 80])).toBe(true);
    expect(isSpots([])).toBe(false);
    expect(isSpots([2, 1])).toBe(false);
    expect(isSpots([1, 1])).toBe(false);
    expect(isSpots([0])).toBe(false);
    expect(isSpots([81])).toBe(false);
    expect(isSpots(Array.from({ length: 11 }, (_, i) => i + 1))).toBe(false);
    expect(isDraw(Array.from({ length: 20 }, (_, i) => i + 1))).toBe(true);
    expect(isDraw(Array.from({ length: 19 }, (_, i) => i + 1))).toBe(false);
    expect(isDraw([...Array.from({ length: 19 }, (_, i) => i + 1), 1])).toBe(false);
  });
});

describe('a game', () => {
  const balls = [5, 9, 13, 21, 22, 30, 31, 40, 41, 50, 51, 60, 61, 62, 63, 70, 71, 72, 79, 80];

  it('catches the spots among the balls, pays the table times the bet, and ×5 when the last ball is one of them', () => {
    // Four spots, three caught, none of them the last ball: 4 a medal.
    expect(gameOf([5, 9, 13, 14], balls)).toMatchObject({ caught: [5, 9, 13], lastCaught: false, pay: 4, times: 1, perMedal: 4 });
    expect(winOf([5, 9, 13, 14], balls, 10)).toBe(40);
    // The same with the last ball one of them: ×5.
    expect(gameOf([5, 9, 80, 14], balls)).toMatchObject({ caught: [5, 9, 80], lastCaught: true, pay: 4, times: 5, perMedal: 20 });
    expect(winOf([5, 9, 80, 14], balls, 3)).toBe(60);
    // The last ball caught on a catch that pays nothing pays nothing.
    expect(gameOf([80, 1, 2, 3, 4], balls)).toMatchObject({ lastCaught: true, pay: 0, times: 1, perMedal: 0 });
    // Two spots, none caught: the medal back.
    expect(winOf([1, 2], balls, 5)).toBe(5);
    // As the balls come out: after eight, two of the four are caught.
    expect(gameOf([5, 9, 80, 14], balls, 8).caught).toEqual([5, 9]);
    expect(gameOf([5, 9, 80, 14], balls, 8).lastCaught).toBe(false);
  });

  it('names a catch of every spot on five spots or more for the medal floor', () => {
    expect(labelOf([5, 9, 13, 21, 22], balls)).toBe('keno-all');
    expect(labelOf([5, 9, 13, 21], balls)).toBeNull();
    expect(labelOf([5, 9, 13, 21, 23], balls)).toBeNull();
    for (const bet of BETS) expect(winOf([5, 9, 13, 21, 80], balls, bet)).toBe(PAYS[5][5] * LAST_BALL_TIMES * bet);
  });
});
