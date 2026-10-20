import { describe, expect, it } from 'vitest';

import { PAYS, PLAYERS, STAKE, analyzePlayer, fraction, less, ratioOf, valueOf, type Fraction, type Player, type PlayerOdds } from '@/components/game/SmartBall/engine';
import { PUBLISHED, publishedOdds } from '@/components/game/SmartBall/odds';
import { FLOOR_RULES } from '@/lib/medalFloor/games';

// Hot Spring Smart Ball's exact returns, worked out afresh by dynamic programming over every board (which of the
// sixteen holes are lit, and how many of the ten marbles are left) in BigInts, and pinned: the figures the page
// publishes (odds.ts) must be exactly these. Each is then checked by a second road: the chance of every number of lines,
// carried forward from an empty board by the same choices, must pay back exactly what the programme says.

const solved = new Map<Player, PlayerOdds>();
const odds = (player: Player): PlayerOdds => {
  if (!solved.has(player)) solved.set(player, analyzePlayer(player));
  return solved.get(player)!;
};

const add = (a: Fraction, b: Fraction) => fraction(a.num * b.den + b.num * a.den, a.den * b.den);
const times = (a: Fraction, n: number) => fraction(a.num * BigInt(n), a.den);

describe('the exact returns', () => {
  for (const player of PLAYERS) {
    it(`${player}: as published, to the last digit, and what its lines pay back`, () => {
      const exact = odds(player);
      // If this fails after a change to the rules, write these into odds.ts.
      const written = { back: ratioOf(exact.back), lines: exact.lines.map(ratioOf) };
      expect(written, JSON.stringify(written)).toEqual(PUBLISHED[player]);
      // The chances of no line to three add up to one, and what they pay, a play at a time, is the return.
      expect(ratioOf(exact.lines.reduce(add, fraction(0)))).toBe('1/1');
      const paid = exact.lines.reduce((sum, chance, n) => add(sum, times(chance, PAYS[n])), fraction(0));
      expect(ratioOf(fraction(paid.num, paid.den * BigInt(STAKE)))).toBe(ratioOf(exact.back));
    });
  }

  it('chose the best to the last digit: every strength compared exactly at every board gives the same returns', { timeout: 15_000 }, () => {
    for (const player of ['perfect', 'typical'] as const) expect(ratioOf(analyzePlayer(player, { exhaustive: true }).back), player).toBe(ratioOf(odds(player).back));
  });

  it('never beats the machine, however well the plunger is pulled: perfect play brings back 93.46%, at most about 95%', () => {
    const { perfect, typical, blind } = publishedOdds();
    expect(valueOf(perfect.back)).toBeCloseTo(0.934555, 6);
    expect(valueOf(typical.back)).toBeCloseTo(0.778012, 6);
    expect(valueOf(blind.back)).toBeCloseTo(0.326228, 6);
    expect(less(perfect.back, fraction(95, 100))).toBe(true);
    expect(less(typical.back, perfect.back)).toBe(true);
    expect(less(blind.back, typical.back)).toBe(true);
    // The floor is told the best return, rounded up to four places: never less than the machine can bring back.
    const rule = FLOOR_RULES['smart-ball'].bestReturn;
    expect(rule).toBe(Math.ceil(valueOf(perfect.back) * 10_000) / 10_000);
    expect(less(perfect.back, fraction(Math.round(rule * 10_000), 10_000))).toBe(true);
  });
});
