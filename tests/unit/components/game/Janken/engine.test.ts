import { describe, expect, it } from 'vitest';

import {
  BEATS,
  HANDS,
  LAMPS,
  MAX_DOUBLES,
  VALUES,
  analyzeMachine,
  drawHand,
  drawLamp,
  fraction,
  handFrom,
  judge,
  lampFrom,
  payoutsOf,
  playMedal,
  seeded,
  simulateSessions,
  spreadOf,
  valueOf,
  type Hand,
  type Outcome,
} from '@/components/game/Janken/engine';

const ODDS = analyzeMachine();

describe('janken', () => {
  it('has each hand beat exactly one other and lose to exactly one other', () => {
    for (const hand of HANDS) {
      const outcomes = HANDS.map((other) => judge(hand, other));
      expect(outcomes.filter((o) => o === 'win')).toHaveLength(1);
      expect(outcomes.filter((o) => o === 'draw')).toHaveLength(1);
      expect(outcomes.filter((o) => o === 'lose')).toHaveLength(1);
    }
    expect(judge('gu', 'choki')).toBe('win');
    expect(judge('choki', 'pa')).toBe('win');
    expect(judge('pa', 'gu')).toBe('win');
    expect(judge('gu', 'pa')).toBe('lose');
    expect(BEATS.gu).toBe('choki');
  });

  it('cuts [0, 1) into three equal thirds for the cat’s hand, and the ring into thirty equal parts for its lamp', () => {
    expect(handFrom(0)).toBe('gu');
    expect(handFrom(1 / 3 - 1e-12)).toBe('gu');
    expect(handFrom(1 / 3)).toBe('choki');
    expect(handFrom(2 / 3 - 1e-12)).toBe('choki');
    expect(handFrom(2 / 3)).toBe('pa');
    expect(handFrom(1 - 1e-12)).toBe('pa');
    expect(lampFrom(0)).toBe(0);
    expect(lampFrom(1 - 1e-12)).toBe(LAMPS.length - 1);
    for (let lamp = 0; lamp < LAMPS.length; lamp++) expect(lampFrom((lamp + 0.5) / LAMPS.length)).toBe(lamp);
    // Each hand and each lamp gets the same share of a fine grid of random numbers.
    const hands = new Map<Hand, number>();
    const lamps = new Array<number>(LAMPS.length).fill(0);
    const steps = 3 * 30 * 1000;
    for (let i = 0; i < steps; i++) {
      const r = (i + 0.5) / steps;
      hands.set(handFrom(r), (hands.get(handFrom(r)) ?? 0) + 1);
      lamps[lampFrom(r)] += 1;
    }
    for (const hand of HANDS) expect(hands.get(hand)).toBe(steps / 3);
    for (const count of lamps) expect(count).toBe(steps / LAMPS.length);
  });

  it('draws the cat’s hand from one random number and nothing else, so it cannot depend on the player’s', () => {
    let calls = 0;
    const r = () => {
      calls += 1;
      return 0.5;
    };
    expect(drawHand(r)).toBe('choki');
    expect(drawLamp(r)).toBe(15);
    expect(calls).toBe(2);
  });
});

describe('the ring', () => {
  it('has thirty lamps: twenty of 1, five of 2, three of 3, one of 5 and one of 10, the 10 at the top', () => {
    expect(LAMPS).toHaveLength(30);
    expect(VALUES).toEqual([1, 2, 3, 5, 10]);
    const count = (v: number) => LAMPS.filter((x) => x === v).length;
    expect([count(1), count(2), count(3), count(5), count(10)]).toEqual([20, 5, 3, 1, 1]);
    expect(LAMPS[0]).toBe(10);
    expect(LAMPS[15]).toBe(5);
    expect(LAMPS.reduce((a, b) => a + b, 0)).toBe(54);
  });
});

describe('the exact odds', () => {
  it('wins, draws and loses a throw a third each, and a medal half and half once draws are thrown again', () => {
    expect(ODDS.throw.win).toEqual(fraction(1, 3));
    expect(ODDS.throw.draw).toEqual(fraction(1, 3));
    expect(ODDS.throw.lose).toEqual(fraction(1, 3));
    expect(ODDS.medal.win).toEqual({ num: 1, den: 2 });
    expect(ODDS.medal.lose).toEqual({ num: 1, den: 2 });
    expect(ODDS.throwsPerMedal).toEqual({ num: 3, den: 2 });
  });

  it('returns exactly 90 medals in every 100: a win pays 54/30 = 1.8 on average, and half the medals win', () => {
    expect(ODDS.meanWin).toEqual({ num: 9, den: 5 });
    expect(ODDS.rtp).toEqual({ num: 9, den: 10 });
    expect(ODDS.edge).toEqual({ num: 1, den: 10 });
    const shares = ODDS.values.reduce((sum, v) => sum + valueOf(v.share), 0);
    expect(shares).toBeCloseTo(0.9, 12);
    expect(ODDS.values.map((v) => [v.medals, v.lamps, v.perWin.num, v.perWin.den, v.perMedal.num, v.perMedal.den])).toEqual([
      [1, 20, 2, 3, 1, 3],
      [2, 5, 1, 6, 1, 12],
      [3, 3, 1, 10, 1, 20],
      [5, 1, 1, 30, 1, 60],
      [10, 1, 1, 30, 1, 60],
    ]);
  });

  it('agrees with every throw enumerated: each player hand against each cat hand and each lamp, with draws thrown again to a depth past any rounding', () => {
    // Enumerate the tree of throws: at each throw the cat's three hands and, on a win, the thirty lamps, all equally
    // likely. Whatever the player presses (here a hand that changes with every throw), the leaves add up to the same.
    const strategies: ((throwIndex: number) => Hand)[] = [() => 'gu', () => 'pa', (i) => HANDS[i % 3], (i) => HANDS[(i * 7 + 1) % 3]];
    for (const press of strategies) {
      let win = 0;
      let lose = 0;
      let back = 0;
      let left = 1; // the chance of having drawn every throw so far
      for (let depth = 0; depth < 40; depth++) {
        for (const cat of HANDS) {
          const outcome: Outcome = judge(press(depth), cat);
          const p = left / 3;
          if (outcome === 'win') {
            win += p;
            for (const value of LAMPS) back += (p / LAMPS.length) * value;
          } else if (outcome === 'lose') lose += p;
        }
        left /= 3;
      }
      expect(left).toBeLessThan(1e-18);
      expect(win).toBeCloseTo(0.5, 15);
      expect(lose).toBeCloseTo(0.5, 15);
      expect(back).toBeCloseTo(valueOf(ODDS.rtp), 14);
    }
  });

  it('keeps the return at 90% however many double-ups a player takes, and only spreads it', () => {
    for (let k = 0; k <= MAX_DOUBLES; k++) {
      const payouts = payoutsOf(k);
      const total = payouts.reduce((sum, p) => sum + valueOf(p.chance), 0);
      expect(total).toBeCloseTo(1, 14);
      expect(spreadOf(k).mean).toBeCloseTo(0.9, 14);
      // E[X²] = 3.2 · 2^k exactly: 192/30 for a win, half the medals win, each double-up doubles the square and halves the chance.
      expect(spreadOf(k).variance + 0.81).toBeCloseTo(3.2 * 2 ** k, 10);
    }
    expect(payoutsOf(0).map((p) => p.medals)).toEqual([0, 1, 2, 3, 5, 10]);
    expect(payoutsOf(MAX_DOUBLES).at(-1)).toEqual({ medals: 160, chance: { num: 1, den: 960 } });
    expect(spreadOf(0).sd).toBeCloseTo(Math.sqrt(2.39), 12);
  });

  it('is what the machine’s own draws come to over many medals (a seeded brute force)', () => {
    const random = seeded(20261014);
    let back = 0;
    const medals = 300_000;
    for (let i = 0; i < medals; i++) back += playMedal(random);
    // Per-medal σ is 1.546, so 300,000 medals put the return within ±0.012 at four standard errors.
    expect(Math.abs(back / medals - 0.9)).toBeLessThan(0.012);
    const doubled = simulateSessions(1000, 100, 2, seeded(7));
    expect(Math.abs(doubled.rtp - 0.9)).toBeLessThan(0.05);
    expect(doubled.nets).toHaveLength(100);
  });

  it('runs the same session again from the same seed', () => {
    expect(simulateSessions(50, 20, 0, seeded(3)).nets).toEqual(simulateSessions(50, 20, 0, seeded(3)).nets);
  });
});
