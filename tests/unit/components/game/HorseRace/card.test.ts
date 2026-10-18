import { describe, expect, it } from 'vitest';

import {
  FIELD,
  ODDS_LIMITS,
  PAIRS,
  RETURN_LEAST,
  RETURN_MOST,
  TICKETS,
  allOrders,
  chanceOf,
  drawOrder,
  oddsOf,
  orderChance,
  price,
  raceCard,
  shareFirstSecond,
  ticketFrom,
  ticketKey,
  ticketWins,
  type RaceCard,
} from '@/components/game/HorseRace/card';
import { ONE, ZERO, add, compare, frac, mul, same, sub, sum, toNumber } from '@/components/game/HorseRace/fraction';
import { STABLE } from '@/components/game/HorseRace/stable';

// The race card's odds and chances, checked exactly: every chance is a fraction, and the returns are added up over
// every way a race can end, never estimated by playing races.

const SEEDS = ['k3j2h1g0f9', 'testdevice01', 'p9q8r7s6t5', 'a1b2c3d4e5'];

/** What one ticket brings back of every medal on it, over all 720 finishing orders. */
function exactReturn(card: RaceCard, orders: { order: number[]; chance: ReturnType<typeof orderChance> }[], ticket: (typeof TICKETS)[number]) {
  const odds = frac(oddsOf(card, ticket));
  return sum(orders.filter(({ order }) => ticketWins(ticket, order)).map(({ chance }) => mul(chance, odds)));
}

describe('the tickets', () => {
  it('are six to win and fifteen quinellas, each named once', () => {
    expect(FIELD).toBe(6);
    expect(PAIRS).toHaveLength(15);
    expect(TICKETS).toHaveLength(21);
    expect(TICKETS.filter((t) => t.kind === 'win')).toHaveLength(6);
    const keys = TICKETS.map(ticketKey);
    expect(new Set(keys).size).toBe(21);
    for (const key of keys) expect(ticketKey(ticketFrom(key)!)).toBe(key);
    expect(ticketFrom('quinella:5-2')).toBeNull();
    expect(ticketFrom('win:7')).toBeNull();
  });

  it('win on the first horse home, or on the first two in either order', () => {
    const order = [3, 5, 1, 2, 6, 4];
    expect(ticketWins({ kind: 'win', gate: 3 }, order)).toBe(true);
    expect(ticketWins({ kind: 'win', gate: 5 }, order)).toBe(false);
    expect(ticketWins({ kind: 'quinella', gates: [3, 5] }, order)).toBe(true);
    expect(ticketWins({ kind: 'quinella', gates: [1, 3] }, order)).toBe(false);
    expect(ticketWins({ kind: 'quinella', gates: [3, 5] }, [5, 3, 1, 2, 6, 4])).toBe(true);
  });
});

describe('pricing', () => {
  it('rounds each fair price down or up and never brings back more than 90%', () => {
    const fair = [2.25, 3.6, 5.625, 7.5, 11.25, 22.5];
    const odds = price(fair, 2, 99);
    odds.forEach((o, i) => expect([Math.floor(fair[i]), Math.ceil(fair[i])]).toContain(o));
    // Exactly: the sum of 1 ÷ the odds is at least 10/9, so the return 1 ÷ that sum is at most 90%.
    const reciprocals = sum(odds.map((o) => frac(1, o)));
    expect(compare(reciprocals, frac(10, 9))).toBeGreaterThanOrEqual(0);
    // And as near 90% as rounding each price down or up allows: one more step up on any of them would go over.
    odds.forEach((o, i) => {
      if (o >= Math.ceil(fair[i])) return;
      const raised = sum(odds.map((x, j) => frac(1, j === i ? x + 1 : x)));
      expect(compare(raised, frac(10, 9))).toBeLessThan(0);
    });
  });
});

describe('every race card', () => {
  const cards: RaceCard[] = [];
  for (const seed of SEEDS) for (let race = 1; race <= 60; race += 1) cards.push(raceCard(seed, race));

  it('runs six different horses of the stable, at whole-number odds the board can show', () => {
    for (const card of cards) {
      expect(card.field).toHaveLength(FIELD);
      expect(new Set(card.field.map((h) => h.id)).size).toBe(FIELD);
      for (const horse of card.field) expect(STABLE).toContain(horse);
      for (const o of card.winOdds) {
        expect(Number.isInteger(o)).toBe(true);
        expect(o).toBeGreaterThanOrEqual(ODDS_LIMITS.win.least);
        expect(o).toBeLessThanOrEqual(ODDS_LIMITS.win.most);
      }
      for (const o of card.quinellaOdds) {
        expect(Number.isInteger(o)).toBe(true);
        expect(o).toBeGreaterThanOrEqual(ODDS_LIMITS.quinella.least);
        expect(o).toBeLessThanOrEqual(ODDS_LIMITS.quinella.most);
      }
    }
  });

  it('brings back between 89.5% and 90% on every ticket of both kinds, and each chance is the return over the odds', () => {
    for (const card of cards) {
      for (const r of [card.winReturn, card.quinellaReturn]) {
        expect(compare(r, RETURN_LEAST)).toBeGreaterThanOrEqual(0);
        expect(compare(r, RETURN_MOST)).toBeLessThanOrEqual(0);
      }
      card.winOdds.forEach((o, i) => expect(same(mul(card.winChance[i], frac(o)), card.winReturn)).toBe(true));
      card.quinellaOdds.forEach((o, e) => expect(same(mul(card.pairChance[e], frac(o)), card.quinellaReturn)).toBe(true));
      expect(same(sum(card.winChance), ONE)).toBe(true);
      expect(same(sum(card.pairChance), ONE)).toBe(true);
    }
  });

  it('shares each pair between its two horses so that each wins with exactly its win chance', () => {
    for (const card of cards) {
      for (let i = 0; i < FIELD; i += 1) {
        expect(compare(card.firstSecond[i][i], ZERO)).toBe(0);
        expect(same(sum(card.firstSecond[i]), card.winChance[i])).toBe(true);
      }
      PAIRS.forEach(([i, j], e) => {
        expect(compare(card.firstSecond[i][j], ZERO)).toBeGreaterThan(0);
        expect(compare(card.firstSecond[j][i], ZERO)).toBeGreaterThan(0);
        expect(same(add(card.firstSecond[i][j], card.firstSecond[j][i]), card.pairChance[e])).toBe(true);
      });
    }
  });

  it('is the same card every time its race is asked for, and the next race is another', () => {
    const again = raceCard(SEEDS[0], 7);
    expect(again.field.map((h) => h.id)).toEqual(cards[6].field.map((h) => h.id));
    expect(again.winOdds).toEqual(cards[6].winOdds);
    expect(cards.slice(0, 60).some((card, i) => i > 0 && card.field.map((h) => h.id).join() !== cards[i - 1].field.map((h) => h.id).join())).toBe(true);
  });

  it('has favourites and outsiders: a spread of odds over the races', () => {
    const wins = cards.flatMap((card) => card.winOdds);
    const quinellas = cards.flatMap((card) => card.quinellaOdds);
    expect(Math.min(...wins)).toBe(2);
    expect(Math.max(...wins)).toBeGreaterThanOrEqual(15);
    expect(Math.min(...quinellas)).toBeLessThanOrEqual(4);
    expect(Math.max(...quinellas)).toBeGreaterThanOrEqual(80);
  });
});

describe('the exact sums over every way a race can end', () => {
  // A handful of cards, each added up over all 720 orders with exact fractions.
  const sample = [raceCard('k3j2h1g0f9', 1), raceCard('testdevice01', 2), raceCard('p9q8r7s6t5', 3)];

  it('adds every order’s chance up to exactly one, and every ticket’s return to exactly its kind’s return', () => {
    for (const card of sample) {
      const orders = allOrders().map((order) => ({ order, chance: orderChance(card, order) }));
      expect(orders).toHaveLength(720);
      expect(same(sum(orders.map(({ chance }) => chance)), ONE)).toBe(true);
      for (const ticket of TICKETS) {
        const back = exactReturn(card, orders, ticket);
        expect(same(back, ticket.kind === 'win' ? card.winReturn : card.quinellaReturn), ticketKey(ticket)).toBe(true);
        // And each ticket's chance, added up the same way, is the one the board publishes.
        const won = sum(orders.filter(({ order }) => ticketWins(ticket, order)).map(({ chance }) => chance));
        expect(same(won, chanceOf(card, ticket)), ticketKey(ticket)).toBe(true);
      }
      // The house keeps 10% to 10.5% of every medal played, whatever is bet on.
      const kept = sub(ONE, card.winReturn);
      expect(toNumber(kept)).toBeGreaterThanOrEqual(0.1 - 1e-12);
      expect(toNumber(kept)).toBeLessThanOrEqual(0.105 + 1e-12);
    }
  });
});

describe('the draw', () => {
  const card = raceCard('testdevice01', 4);

  it('gives every horse a place, once', () => {
    let state = 1;
    const random = () => {
      state = (state * 48271) % 2147483647;
      return state / 2147483647;
    };
    for (let i = 0; i < 200; i += 1) expect([...drawOrder(card, random)].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('turns the first number into the first two, each pair in order taking exactly its chance of the unit interval', () => {
    let at = 0;
    for (let i = 0; i < FIELD; i += 1)
      for (let j = 0; j < FIELD; j += 1) {
        if (i === j) continue;
        const width = toNumber(card.firstSecond[i][j]);
        const queue = [at + width / 2, 0, 0, 0];
        const order = drawOrder(card, () => queue.shift()!);
        expect(order.slice(0, 2)).toEqual([i + 1, j + 1]);
        at += width;
      }
    expect(at).toBeCloseTo(1, 12);
  });

  it('runs the lowest numbers to the gates in order, and the highest to them backwards', () => {
    expect(drawOrder(card, () => 0)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(drawOrder(card, () => 0.999_999_999)).toEqual([6, 5, 4, 3, 2, 1]);
  });

  it('takes the third to fifth places in proportion to the win chances of the horses left', () => {
    // 1 and 2 first; of 3, 4, 5 and 6 the third is chosen by the second number.
    const w = card.winChance.map(toNumber);
    const left = [2, 3, 4, 5];
    const total = left.reduce((acc, g) => acc + w[g], 0);
    let at = 0;
    for (const g of left) {
      const queue = [0, (at + w[g] / 2) / total, 0, 0];
      expect(drawOrder(card, () => queue.shift()!)[2]).toBe(g + 1);
      at += w[g];
    }
  });
});

describe('sharing the pairs', () => {
  it('refuses chances it cannot share between nothing and the whole pair', () => {
    // One horse that wins every time, and pairs it is never in: there is no share that does it.
    const win = [ONE, ZERO, ZERO, ZERO, ZERO, ZERO];
    const pair = PAIRS.map(([i]) => (i === 0 ? ZERO : frac(1, 10)));
    expect(shareFirstSecond(win, pair)).toBeNull();
  });
});
