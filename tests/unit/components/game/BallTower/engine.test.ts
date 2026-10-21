import { describe, expect, it } from 'vitest';

import {
  BETS,
  BET_MOST,
  CHANCE_LEVEL,
  DISCS,
  DRAW_NUMBERS,
  JACKPOT,
  LAMPS,
  LAMP_SETS,
  LEVELS,
  MOST_WIN,
  POCKETS,
  analyze,
  checkRuns,
  drawFor,
  drawRun,
  fraction,
  isDraw,
  labelOf,
  numbersFor,
  ratioOf,
  runOf,
  seeded,
  stopAt,
  valueOf,
  wonOf,
  worthFrom,
  type Draw,
  type PocketKind,
} from '@/components/game/BallTower/engine';
import {
  BALL_R,
  CALM_LIFT_MS,
  DISC_PLACES,
  LIFT_MS,
  RAMP_MS,
  TRACK,
  ballAt,
  discAngle,
  lampAt,
  levelAt,
  onDisc,
  pocketAngle,
  restAngles,
  runScene,
  spunFor,
  turning,
} from '@/components/game/BallTower/scene';

// Firework Ball Tower: five discs, built as the real multi-level ball machines are (each level fewer pockets and fewer
// UPs than the one before), a draw of ten numbers taken in the press, a run played out from it, and a timeline the
// tower plays it out on.

const count = (level: number, kind: PocketKind) => DISCS[level].filter((p) => p.kind === kind).length;
const sum = (list: readonly number[]) => list.reduce((a, b) => a + b, 0);

describe('the tower', () => {
  it('has five discs of 18, 15, 6, 6 and 6 pockets: UPs scarcer at every disc, OUT only on the top two, the jackpot on the last', () => {
    expect(POCKETS).toEqual([18, 15, 6, 6, 6]);
    expect(DISCS.map((_, level) => count(level, 'up'))).toEqual([6, 3, 1, 1, 0]);
    expect(DISCS.map((_, level) => count(level, 'out'))).toEqual([12, 5, 0, 0, 0]);
    expect(DISCS.map((_, level) => count(level, 'mystery'))).toEqual([0, 3, 1, 1, 1]);
    expect(DISCS.map((_, level) => count(level, 'jackpot'))).toEqual([0, 0, 0, 0, 1]);
    // The pay pockets, as multiples of the bet.
    const pays = (level: number) => DISCS[level].flatMap((p) => (p.kind === 'pay' ? [p.pays] : [])).sort((a, b) => a - b);
    expect(pays(0)).toEqual([]);
    expect(pays(1)).toEqual([1, 2, 2, 3]);
    expect(pays(2)).toEqual([3, 3, 6, 6]);
    expect(pays(3)).toEqual([6, 6, 12, 12]);
    expect(pays(4)).toEqual([15, 15, 30, 30]);
    // The lamp roulettes: none on the top disc, and the higher the disc, the bigger its multiples.
    expect(LAMP_SETS[0]).toEqual([]);
    expect(LAMP_SETS.slice(1).map((set) => [set.length, Math.min(...set), Math.max(...set)])).toEqual([
      [10, 1, 10],
      [10, 3, 15],
      [8, 6, 30],
      [8, 15, 50],
    ]);
    expect(LAMPS).toEqual([1, 10, 10, 8, 8]);
    expect(CHANCE_LEVEL).toBe(3);
  });

  it('pays at most the jackpot, ×300, on the biggest bet: 3,000', () => {
    expect(JACKPOT).toBe(300);
    expect(BETS).toEqual([1, 2, 3, 5, 10]);
    expect(BET_MOST).toBe(10);
    expect(MOST_WIN).toBe(3_000);
  });

  it('spreads each disc’s UPs round its rim, never two side by side', () => {
    for (let level = 0; level < 2; level++) {
      const ups = DISCS[level].flatMap((p, i) => (p.kind === 'up' ? [i] : []));
      for (let i = 0; i < ups.length; i++) {
        const next = ups[(i + 1) % ups.length] + (i + 1 === ups.length ? POCKETS[level] : 0);
        expect(next - ups[i], `disc ${level + 1}`).toBeGreaterThan(1);
      }
    }
  });
});

describe('the draw', () => {
  it('takes ten numbers, a pocket and a lamp a disc, and the numbers it is given draw it back', () => {
    expect(DRAW_NUMBERS).toBe(10);
    const random = seeded(3);
    for (let i = 0; i < 200; i++) {
      const draw = drawRun(random);
      expect(isDraw(draw)).toBe(true);
      const numbers = numbersFor(draw);
      expect(numbers).toHaveLength(DRAW_NUMBERS);
      expect(drawRun(() => numbers.shift()!)).toEqual(draw);
    }
    // Every pocket and every lamp is drawn by a share of [0, 1) as wide as any other's.
    expect(drawRun(() => 0).pockets).toEqual([0, 0, 0, 0, 0]);
    expect(drawRun(() => 0.999_999).pockets).toEqual(POCKETS.map((n) => n - 1));
    expect(drawRun(() => 0.999_999).lamps).toEqual(LAMPS.map((n) => n - 1));
  });

  it('knows a draw it could have made from one it could not', () => {
    expect(isDraw({ pockets: [0, 0, 0, 0, 0], lamps: [0, 0, 0, 0, 0] })).toBe(true);
    expect(isDraw({ pockets: [18, 0, 0, 0, 0], lamps: [0, 0, 0, 0, 0] })).toBe(false);
    expect(isDraw({ pockets: [0, 0, 0, 0, 0], lamps: [1, 0, 0, 0, 0] })).toBe(false);
    expect(isDraw({ pockets: [0, 0, 0, 0], lamps: [0, 0, 0, 0] })).toBe(false);
    expect(isDraw({ pockets: [0.5, 0, 0, 0, 0], lamps: [0, 0, 0, 0, 0] })).toBe(false);
    expect(isDraw(null)).toBe(false);
    expect(isDraw([0, 0])).toBe(false);
  });
});

describe('a run', () => {
  it('goes down while the ball drops into UP, and ends in the first pocket that is not one', () => {
    const out = runOf(drawFor(['out']));
    expect(out.stops.map((s) => s.kind)).toEqual(['out']);
    expect(out.pays).toBe(0);
    const twice = runOf(drawFor(['up', 'pay'], 3));
    expect(twice).toMatchObject({ pays: 3, jackpot: false });
    expect(twice.stops.map((s) => [s.level, s.kind])).toEqual([
      [0, 'up'],
      [1, 'pay'],
    ]);
    const lamp = runOf(drawFor(['up', 'mystery'], 10));
    expect(lamp.stops[1]).toMatchObject({ kind: 'mystery', pays: 10 });
    expect(lamp.pays).toBe(10);
    const jackpot = runOf(drawFor(['up', 'up', 'up', 'up', 'jackpot']));
    expect(jackpot).toMatchObject({ pays: JACKPOT, jackpot: true });
    expect(jackpot.stops).toHaveLength(LEVELS);
    // What the discs it never reached drew does not matter.
    const draw = drawFor(['out']);
    expect(runOf({ ...draw, pockets: [draw.pockets[0], 3, 3, 3, 3] })).toEqual(out);
    expect(wonOf(jackpot, 10)).toBe(3_000);
    expect(wonOf(twice, 5)).toBe(15);
  });

  it('names a win to the floor only in the jackpot chance: the jackpot, or any other pocket of the fourth and fifth discs', () => {
    expect(labelOf(runOf(drawFor(['up', 'up', 'up', 'up', 'jackpot'])))).toBe('tower-jackpot');
    expect(labelOf(runOf(drawFor(['up', 'up', 'up', 'up', 'pay'], 30)))).toBe('tower-chance');
    expect(labelOf(runOf(drawFor(['up', 'up', 'up', 'pay'], 12)))).toBe('tower-chance');
    expect(labelOf(runOf(drawFor(['up', 'up', 'up', 'mystery'], 30)))).toBe('tower-chance');
    expect(labelOf(runOf(drawFor(['up', 'up', 'pay'], 6)))).toBeNull();
    expect(labelOf(runOf(drawFor(['out'])))).toBeNull();
  });

  it('pays exactly 9/10 of the medals played over every way a run can go, the lamps’ included: a third road, every draw counted', () => {
    // Every pocket on every disc, each lamp of the roulette that ends a run on a "?": 18 × 15 × 6 × 6 × 6 draws of the
    // pockets, each pocket the same share, and a "?" ending each lamp of its roulette the same share of it.
    const BIG = (n: number) => BigInt(n);
    let paid = BIG(0);
    let ways = BIG(0);
    const lampsOf = (level: number) => Math.max(1, LAMP_SETS[level].length);
    const total = POCKETS.reduce((a, b) => a * b, 1);
    const pockets = [0, 0, 0, 0, 0];
    for (let i = 0; i < total; i++) {
      let rest = i;
      for (let level = LEVELS - 1; level >= 0; level--) {
        pockets[level] = rest % POCKETS[level];
        rest = Math.floor(rest / POCKETS[level]);
      }
      const run = runOf({ pockets, lamps: [0, 0, 0, 0, 0] });
      const last = run.stops[run.stops.length - 1];
      if (last.kind === 'mystery') {
        // Each lamp of the roulette that ended it, weighted equally.
        const lamps = lampsOf(last.level);
        paid += BIG(sum(LAMP_SETS[last.level])) * BIG(840 / lamps);
      } else paid += BIG(run.pays) * BIG(840);
      ways += BIG(840);
    }
    expect(ratioOf(fraction(paid, ways))).toBe('9/10');
    expect(ratioOf(worthFrom(0))).toBe('9/10');
  });

  it('never reaches the jackpot disc but by going UP on every disc above it: 1 ball in 540, and the jackpot 1 in 3,240', () => {
    const odds = analyze();
    expect(odds.reach.map(ratioOf)).toEqual(['1/1', '1/3', '1/15', '1/90', '1/540']);
    expect(ratioOf(odds.jackpot)).toBe('1/3240');
    // The UPs of each disc over its pockets, multiplied down the tower.
    let reach = 1;
    for (let level = 0; level < LEVELS - 1; level++) reach *= count(level, 'up') / POCKETS[level];
    expect(reach).toBeCloseTo(1 / 540, 12);
  });

  it('brings back what the exact figures say, played a few hundred thousand times', () => {
    const seen = checkRuns(300_000, seeded(11));
    // The return's spread over that many balls is about ±1.2 points (the jackpot is 300 times the bet): 4 points is far out.
    expect(Math.abs(seen.back - 0.9)).toBeLessThan(0.04);
    expect(seen.reached[0]).toBe(300_000);
    expect(seen.reached[1] / 300_000).toBeCloseTo(1 / 3, 2);
    expect(seen.reached[2] / 300_000).toBeCloseTo(1 / 15, 2);
  });
});

describe('the timeline', () => {
  const START_ANGLES = [0.2, 0.7, 1.4, 2.1, 0.3];
  const runs: Draw[] = [drawFor(['out']), drawFor(['up', 'pay'], 2), drawFor(['up', 'mystery'], 5), drawFor(['up', 'up', 'up', 'up', 'jackpot']), drawFor(['up', 'up', 'up', 'mystery'], 30)];

  it('ends with the ball in the middle of the pocket the draw chose, on its disc, as the disc stands then', () => {
    for (const draw of runs) {
      const run = runOf(draw);
      for (const calm of [false, true]) {
        const timeline = runScene(run, START_ANGLES, calm);
        const last = run.stops[run.stops.length - 1];
        for (const ms of [timeline.end, timeline.end + 300, timeline.end + RAMP_MS * 3]) {
          const ball = ballAt(timeline, ms);
          const at = onDisc(last.level, discAngle(timeline, last.level, ms) + pocketAngle(last.level, last.pocket), TRACK);
          expect(ball.level).toBe(last.level);
          expect(ball.pocket).toBe(last.pocket);
          expect(ball.x).toBeCloseTo(at.x, 6);
          expect(ball.y).toBeCloseTo(at.y, 6);
        }
        expect(levelAt(timeline, timeline.end)).toBe(last.level);
      }
    }
  });

  it('moves the ball without a jump from the lift to the last pocket: never more than a few units in a sixtieth of a second', () => {
    for (const draw of runs) {
      const timeline = runScene(runOf(draw), START_ANGLES, false);
      let before = ballAt(timeline, 0);
      for (let ms = 16; ms <= timeline.end + 400; ms += 16) {
        const now = ballAt(timeline, ms);
        const step = Math.hypot(now.x - before.x, now.y - before.y);
        expect(step, `${ms} ms`).toBeLessThan(BALL_R * 2.2);
        before = now;
      }
    }
  });

  it('turns the discs only while a run is on, up to speed and back to rest, and with less motion not at all', () => {
    const timeline = runScene(runOf(runs[3]), START_ANGLES, false);
    expect(spunFor(0, timeline.end)).toBe(0);
    expect(spunFor(timeline.end + RAMP_MS, timeline.end)).toBe(timeline.end);
    expect(spunFor(timeline.end + RAMP_MS * 5, timeline.end)).toBe(timeline.end);
    expect(turning(timeline, timeline.end + RAMP_MS - 1)).toBe(true);
    expect(turning(timeline, timeline.end + RAMP_MS)).toBe(false);
    const rest = restAngles(timeline);
    for (let level = 0; level < LEVELS; level++) expect(discAngle(timeline, level, timeline.end + RAMP_MS * 4)).toBeCloseTo(rest[level], 9);
    const calm = runScene(runOf(runs[3]), START_ANGLES, true);
    for (let level = 0; level < LEVELS; level++) expect(discAngle(calm, level, 5_000)).toBe(START_ANGLES[level]);
    expect(turning(calm, 0)).toBe(false);
  });

  it('lets Skip go once the ball is at the top: 1.4 s up the lift, 0.6 s with less motion, the quickest a run can be played', () => {
    for (const draw of runs) {
      expect(runScene(runOf(draw), START_ANGLES, false).skipFrom).toBe(LIFT_MS);
      expect(runScene(runOf(draw), START_ANGLES, true).skipFrom).toBe(CALM_LIFT_MS);
    }
    expect(LIFT_MS).toBe(1_400);
    expect(CALM_LIFT_MS).toBe(600);
  });

  it('runs a "?" pocket’s lamps round and stops them on the lamp drawn', () => {
    for (const calm of [false, true]) {
      const run = runOf(runs[2]);
      const timeline = runScene(run, START_ANGLES, calm);
      const stop = run.stops[1];
      expect(lampAt(timeline, timeline.end)).toEqual({ level: 1, lamp: stop.lamp, stopped: true });
      expect(lampAt(timeline, 0)).toBeNull();
      expect(LAMP_SETS[1][stop.lamp!]).toBe(5);
    }
    expect(lampAt(runScene(runOf(runs[1]), START_ANGLES, false), 99_999)).toBeNull();
  });

  it('keeps each disc clear of the next: a disc’s front edge, wall and all, above the back edge of the disc below', () => {
    for (let level = 0; level < LEVELS - 1; level++) {
      const d = DISC_PLACES[level];
      const below = DISC_PLACES[level + 1];
      expect(d.cy + d.ry + d.thick).toBeLessThan(below.cy - below.ry);
      expect(below.r).toBeGreaterThan(d.r);
    }
  });

  it('plays a pocket’s stop as the engine does', () => {
    expect(stopAt(4, DISCS[4].findIndex((p) => p.kind === 'jackpot'), 0)).toMatchObject({ kind: 'jackpot', pays: JACKPOT });
    expect(stopAt(1, DISCS[1].findIndex((p) => p.kind === 'mystery'), 9)).toMatchObject({ kind: 'mystery', lamp: 9, pays: 10 });
    expect(valueOf(analyze().back)).toBeCloseTo(0.9, 12);
  });
});
