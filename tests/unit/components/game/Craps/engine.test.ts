import { describe, expect, it } from 'vitest';

import { allBetOdds, toNumber } from '@/components/game/Craps/analysis';
import {
  BET_IDS,
  MAX_LAY_ODDS,
  canTakeDown,
  maxOdds,
  placementError,
  resolveRoll,
  rollDice,
  type BetId,
  type Bets,
  type Dice,
  type PointNumber,
} from '@/components/game/Craps/engine';

const ALL_DICE: Dice[] = [];
for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) ALL_DICE.push([a, b]);

const one = (point: PointNumber | null, bets: Bets, dice: Dice, id: BetId) =>
  resolveRoll(point, bets, dice).results.find((r) => r.id === id);

describe('come-out roll', () => {
  it('Pass: 7/11 win, 2/3/12 lose, anything else sets the point', () => {
    expect(one(null, { pass: 10 }, [3, 4], 'pass')).toMatchObject({ outcome: 'win', profit: 10 });
    expect(one(null, { pass: 10 }, [5, 6], 'pass')).toMatchObject({ outcome: 'win', profit: 10 });
    for (const d of [[1, 1], [1, 2], [6, 6]] as Dice[]) expect(one(null, { pass: 10 }, d, 'pass')?.outcome).toBe('lose');
    const set = resolveRoll(null, { pass: 10 }, [2, 4]);
    expect(set.event).toBe('pointSet');
    expect(set.pointAfter).toBe(6);
    expect(set.results).toEqual([]);
    expect(set.bets).toEqual({ pass: 10 });
  });

  it("Don't Pass: 2/3 win, 12 is a push (bar 12), 7/11 lose", () => {
    expect(one(null, { dontPass: 10 }, [1, 1], 'dontPass')?.outcome).toBe('win');
    expect(one(null, { dontPass: 10 }, [1, 2], 'dontPass')?.outcome).toBe('win');
    const bar = resolveRoll(null, { dontPass: 10 }, [6, 6]);
    expect(bar.results[0]).toMatchObject({ outcome: 'push', profit: 0 });
    expect(bar.bets).toEqual({ dontPass: 10 });
    expect(bar.returned).toBe(0);
    expect(one(null, { dontPass: 10 }, [3, 4], 'dontPass')?.outcome).toBe('lose');
    expect(one(null, { dontPass: 10 }, [5, 6], 'dontPass')?.outcome).toBe('lose');
  });

  it('place bets and hardways are off on the come-out', () => {
    for (const dice of ALL_DICE) {
      const res = resolveRoll(null, { place6: 6, place8: 6, hard6: 5, hard4: 5 }, dice);
      expect(res.results).toEqual([]);
      expect(res.bets).toEqual({ place6: 6, place8: 6, hard6: 5, hard4: 5 });
    }
  });
});

describe('point phase', () => {
  it('making the point pays Pass even money and the odds at true odds', () => {
    const res = resolveRoll(4, { pass: 10, passOdds: 30, dontPass: 10, dontPassOdds: 60 }, [1, 3]);
    expect(res.event).toBe('pointMade');
    expect(res.pointAfter).toBeNull();
    const by = Object.fromEntries(res.results.map((r) => [r.id, r]));
    expect(by.pass).toMatchObject({ outcome: 'win', profit: 10 });
    expect(by.passOdds).toMatchObject({ outcome: 'win', profit: 60 }); // 2:1 on a 4
    expect(by.dontPass.outcome).toBe('lose');
    expect(by.dontPassOdds.outcome).toBe('lose');
    expect(res.returned).toBe(10 + 10 + 30 + 60);
    expect(res.bets).toEqual({});
  });

  it('a seven-out pays the dark side and sweeps the rest', () => {
    const bets: Bets = { pass: 10, passOdds: 50, dontPass: 10, dontPassOdds: 60, place6: 12, place5: 5, hard8: 5 };
    const res = resolveRoll(6, bets, [3, 4]);
    expect(res.event).toBe('sevenOut');
    const by = Object.fromEntries(res.results.map((r) => [r.id, r]));
    expect(by.dontPass).toMatchObject({ outcome: 'win', profit: 10 });
    expect(by.dontPassOdds).toMatchObject({ outcome: 'win', profit: 50 }); // lay 6 at 5:6
    for (const id of ['pass', 'passOdds', 'place6', 'place5', 'hard8'] as BetId[]) expect(by[id].outcome).toBe('lose');
    expect(res.bets).toEqual({});
    expect(res.returned).toBe(10 + 10 + 60 + 50);
  });

  it('place bets pay their odds and stay up', () => {
    expect(one(9, { place6: 6 }, [2, 4], 'place6')).toMatchObject({ outcome: 'win', profit: 7, staysUp: true });
    expect(one(9, { place5: 5 }, [1, 4], 'place5')).toMatchObject({ outcome: 'win', profit: 7 });
    expect(one(9, { place4: 5 }, [2, 2], 'place4')).toMatchObject({ outcome: 'win', profit: 9 });
    expect(one(9, { place10: 5 }, [4, 6], 'place10')).toMatchObject({ outcome: 'win', profit: 9 });
    const res = resolveRoll(9, { place6: 6 }, [2, 4]);
    expect(res.bets).toEqual({ place6: 6 });
    expect(res.returned).toBe(7); // only the profit comes back
    expect(one(9, { place6: 5 }, [3, 3], 'place6')?.profit).toBe(5.83); // cents
  });

  it('hardways win only the hard way and lose to the easy way or a 7', () => {
    expect(one(5, { hard6: 5 }, [3, 3], 'hard6')).toMatchObject({ outcome: 'win', profit: 45 });
    expect(one(5, { hard4: 5 }, [2, 2], 'hard4')).toMatchObject({ outcome: 'win', profit: 35 });
    expect(one(5, { hard6: 5 }, [2, 4], 'hard6')?.outcome).toBe('lose');
    expect(one(5, { hard6: 5 }, [1, 6], 'hard6')?.outcome).toBe('lose');
    expect(resolveRoll(5, { hard6: 5 }, [4, 5]).bets).toEqual({ hard6: 5 });
  });
});

describe('one-roll bets', () => {
  it('pay on the right totals every roll', () => {
    const cases: [BetId, Dice, number | null][] = [
      ['field', [1, 1], 20],
      ['field', [6, 6], 30],
      ['field', [1, 2], 10],
      ['field', [5, 6], 10],
      ['field', [2, 3], null],
      ['field', [3, 4], null],
      ['any7', [1, 6], 40],
      ['any7', [3, 3], null],
      ['anyCraps', [1, 2], 70],
      ['anyCraps', [6, 6], 70],
      ['anyCraps', [3, 4], null],
      ['yo', [5, 6], 150],
      ['aces', [1, 1], 300],
      ['twelve', [6, 6], 300],
      ['twelve', [5, 6], null],
    ];
    for (const point of [null, 8] as const) {
      for (const [id, dice, profit] of cases) {
        const r = one(point, { [id]: 10 }, dice, id);
        expect(r?.outcome, `${id} ${dice}`).toBe(profit === null ? 'lose' : 'win');
        if (profit !== null) expect(r?.profit).toBe(profit);
      }
    }
  });
});

describe('placement rules', () => {
  it('only allows line bets on the come-out and odds behind them once a point is on', () => {
    expect(placementError('pass', 5, null, {})).toBeNull();
    expect(placementError('pass', 5, 6, {})).toBe('comeOutOnly');
    expect(placementError('dontPass', 5, 6, {})).toBe('comeOutOnly');
    expect(placementError('passOdds', 5, null, { pass: 5 })).toBe('needsPoint');
    expect(placementError('passOdds', 5, 6, {})).toBe('needsLineBet');
    expect(placementError('dontPassOdds', 5, 6, { pass: 5 })).toBe('needsLineBet');
    expect(placementError('place6', 5, null, {})).toBeNull();
    expect(placementError('any7', 5, 4, {})).toBeNull();
  });

  it('caps odds at 3-4-5× (lay 6×)', () => {
    expect(maxOdds('passOdds', 4, { pass: 10 })).toBe(30);
    expect(maxOdds('passOdds', 5, { pass: 10 })).toBe(40);
    expect(maxOdds('passOdds', 6, { pass: 10 })).toBe(50);
    expect(maxOdds('dontPassOdds', 4, { dontPass: 10 })).toBe(10 * MAX_LAY_ODDS);
    expect(placementError('passOdds', 50, 6, { pass: 10 })).toBeNull();
    expect(placementError('passOdds', 5, 6, { pass: 10, passOdds: 50 })).toBe('oddsLimit');
  });

  it('keeps the Pass line on the table once a point is set', () => {
    expect(canTakeDown('pass', 6)).toBe(false);
    expect(canTakeDown('pass', null)).toBe(true);
    expect(canTakeDown('dontPass', 6)).toBe(true);
    expect(canTakeDown('place6', 6)).toBe(true);
  });
});

describe('the engine agrees with the exact analysis', () => {
  /**
   * Expected profit per unit bet, per decision, computed by running the real
   * `resolveRoll` over all 36 outcomes of every roll (an absorbing Markov chain
   * over table states) — independent of the closed-form formulas.
   */
  function engineEv(id: BetId, start: { point: PointNumber | null; bets: Bets }): number {
    const stake = start.bets[id]!;
    let states = [{ ...start, p: 1 }];
    let ev = 0;
    for (let step = 0; step < 400 && states.length > 0; step++) {
      const next = new Map<string, { point: PointNumber | null; bets: Bets; p: number }>();
      for (const s of states) {
        for (const dice of ALL_DICE) {
          const p = s.p / 36;
          const res = resolveRoll(s.point, s.bets, dice);
          const r = res.results.find((x) => x.id === id);
          if (r) {
            ev += p * (r.outcome === 'win' ? r.profit : r.outcome === 'lose' ? -r.stake : 0);
            continue; // decided (a push is a decision too)
          }
          const key = `${res.pointAfter}|${JSON.stringify(res.bets)}`;
          const prev = next.get(key);
          if (prev) prev.p += p;
          else next.set(key, { point: res.pointAfter, bets: res.bets, p });
        }
      }
      states = [...next.values()].filter((s) => s.p > 1e-15);
    }
    return ev / stake;
  }

  const analytic = new Map(allBetOdds().map((o) => [o.id, -toNumber(o.houseEdge)]));

  it.each(BET_IDS.filter((id) => id !== 'passOdds' && id !== 'dontPassOdds'))('%s', (id) => {
    // Line bets start on the come-out; the rest start with a point of 4 on.
    const line = id === 'pass' || id === 'dontPass';
    const ev = engineEv(id, { point: line ? null : 4, bets: { [id]: 36 } });
    expect(ev).toBeCloseTo(analytic.get(id)!, 9);
  });

  it.each([4, 5, 6, 8, 9, 10] as PointNumber[])('odds on a %i are a fair bet', (point) => {
    // Stakes chosen so the true-odds payouts are whole numbers.
    expect(engineEv('passOdds', { point, bets: { pass: 30, passOdds: 30 } })).toBeCloseTo(0, 9);
    expect(engineEv('dontPassOdds', { point, bets: { dontPass: 30, dontPassOdds: 60 } })).toBeCloseTo(0, 9);
  });
});

describe('rollDice', () => {
  it('rolls two fair dice', () => {
    let seed = 3;
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const counts = new Array(13).fill(0);
    const n = 72_000;
    for (let i = 0; i < n; i++) {
      const [a, b] = rollDice(rng);
      expect(a >= 1 && a <= 6 && b >= 1 && b <= 6).toBe(true);
      counts[a + b]++;
    }
    const ways = [0, 0, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1];
    for (let total = 2; total <= 12; total++) {
      const expected = (n * ways[total]) / 36;
      expect(Math.abs(counts[total] - expected)).toBeLessThan(5 * Math.sqrt(expected));
    }
  });
});
