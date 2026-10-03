import { beforeAll, describe, expect, it } from 'vitest';

import { TOTAL_HANDS, analyzeGame, analyzeHand, choose, dealtCounts, drawsFor, tables, type Tables } from '@/components/game/VideoPoker/analysis';
import { HANDS, PAY_TABLES, PAY_TABLE_IDS, ROYAL_SHORT_PAY, rankCards } from '@/components/game/VideoPoker/engine';
import { CLASSES, DEALT_COUNTS, PRECOMPUTED } from '@/components/game/VideoPoker/precomputed';

const RANKS = '23456789TJQKA';
const c = (s: string) => '♠♥♦♣'.indexOf(s[1]) * 13 + RANKS.indexOf(s[0]);

let t: Tables;
beforeAll(() => {
  t = tables();
}, 30_000);

/** Counts final hands by brute force: every way to draw replacements for the cards not held. */
function bruteForce(hand: number[], mask: number): number[] {
  const kept = hand.filter((_, i) => mask & (1 << i));
  const rest = Array.from({ length: 52 }, (_, i) => i).filter((card) => !hand.includes(card));
  const need = 5 - kept.length;
  const counts = new Array<number>(HANDS.length).fill(0);
  const pick: number[] = [];
  const walk = (from: number) => {
    if (pick.length === need) {
      counts[rankCards([...kept, ...pick])]++;
      return;
    }
    for (let i = from; i < rest.length; i++) {
      pick.push(rest[i]);
      walk(i + 1);
      pick.pop();
    }
  };
  walk(0);
  return counts;
}

describe('the lookup tables', () => {
  it('rank all 2,598,960 deals with the textbook counts', () => {
    expect(dealtCounts(t)).toEqual([2_062_860, 337_920, 123_552, 54_912, 10_200, 5_108, 3_744, 624, 36, 4]);
    expect(DEALT_COUNTS).toEqual(dealtCounts(t));
    expect(DEALT_COUNTS.reduce((a, b) => a + b, 0)).toBe(TOTAL_HANDS);
    expect(choose(52, 5)).toBe(TOTAL_HANDS);
    expect(drawsFor(0)).toBe(1_533_939);
    expect(drawsFor(5)).toBe(1);
  });

  it('cover every deal exactly once with 134,459 suit-distinct classes', () => {
    expect(t.classes).toBe(134_459);
    expect(CLASSES).toBe(t.classes);
    let total = 0;
    for (let i = 0; i < t.classes; i++) total += t.classWeights[i];
    expect(total).toBe(TOTAL_HANDS);
  });
});

describe('the value of a hold', () => {
  it.each([
    [['K♠', 'K♥', '3♦', '7♣', '9♠'], 0b00011], // keep the pair: 16,215 draws
    [['5♠', '5♥', '9♥', 'K♥', '2♥'], 0b11110], // four to a flush: 47 draws
    [['A♠', 'K♠', 'Q♠', 'J♠', '4♠'], 0b01111], // four to a royal
    [['J♠', 'J♥', 'A♦', '7♣', '3♠'], 0b00111], // pair plus kicker: 1,081 draws
    [['2♣', '7♦', '9♥', 'J♠', 'Q♣'], 0b11000], // two high cards
    [['2♣', '7♦', '9♥', 'J♠', 'Q♣'], 0b01000], // one high card: 178,365 draws
    [['T♥', 'J♥', 'Q♥', 'K♥', 'A♥'], 0b11111], // a dealt royal, held
  ] as [string[], number][])('matches a brute-force count of every draw for %j held %i', (cards, mask) => {
    const hand = cards.map(c);
    const hold = analyzeHand(hand, PAY_TABLES['9/6']).find((h) => h.mask === mask)!;
    const brute = bruteForce(hand, mask);
    expect(hold.counts).toEqual(brute);
    expect(hold.draws).toBe(brute.reduce((a, b) => a + b, 0));
    const paid = brute.reduce((sum, n, r) => sum + n * PAY_TABLES['9/6'][r], 0);
    expect(hold.ev).toBeCloseTo(paid / hold.draws, 12);
  });

  it('matches brute force when all five cards are thrown away', () => {
    const hand = ['2♣', '7♦', '9♥', '4♠', '5♣'].map(c);
    const hold = analyzeHand(hand, PAY_TABLES['9/6']).find((h) => h.mask === 0)!;
    expect(hold.counts).toEqual(bruteForce(hand, 0));
  });

  it('lists all 32 holds best first, in the caller’s card order', () => {
    const hand = ['9♠', 'K♥', '3♦', 'K♠', '7♣'].map(c);
    const all = analyzeHand(hand, PAY_TABLES['9/6']);
    expect(all).toHaveLength(32);
    expect(new Set(all.map((h) => h.mask)).size).toBe(32);
    for (let i = 1; i < all.length; i++) expect(all[i].ev).toBeLessThanOrEqual(all[i - 1].ev);
    // The kings sit at positions 1 and 3.
    expect(all[0].mask).toBe(0b01010);
    expect(all[0].ev).toBeCloseTo(1.5365, 4);
  });

  it('gets the classic close calls right', () => {
    const best = (...cards: string[]) => {
      const hand = cards.map(c);
      const top = analyzeHand(hand, PAY_TABLES['9/6'])[0];
      return hand.filter((_, i) => top.mask & (1 << i)).length;
    };
    expect(best('5♠', '5♥', '9♥', 'K♥', '2♥')).toBe(4); // four to a flush over a low pair
    expect(best('5♠', '5♥', '6♦', '7♣', '8♠')).toBe(2); // a low pair over four to a straight
    expect(best('A♠', 'K♠', 'Q♠', 'J♠', '4♠')).toBe(4); // break the flush for the royal draw
    expect(best('J♠', 'J♥', 'A♦', '7♣', '3♠')).toBe(2); // no kicker
    expect(best('K♠', 'Q♠', 'J♠', 'J♥', '4♦')).toBe(2); // high pair over three to a royal
  });
});

describe('perfect play', () => {
  it('returns 99.5439% on a 9/6 machine, with the published hand frequencies', () => {
    const g = analyzeGame(PAY_TABLES['9/6'], t);
    expect(g.payback).toBeCloseTo(0.995439, 6);
    expect(g.variance).toBeCloseTo(19.5147, 4);
    expect(1 / g.final[9]).toBeCloseTo(40_390.55, 2);
    expect(1 / g.final[8]).toBeCloseTo(9_148.37, 2);
    expect(1 / g.final[7]).toBeCloseTo(423.27, 2);
    expect(g.final[0]).toBeCloseTo(0.545435, 6);
    expect(g.final.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    expect(g.holdSizes.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    expect(g.contribution.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
  });

  it.each(PAY_TABLE_IDS)('reproduces the stored results for the %s pay table', (id) => {
    const full = analyzeGame(PAY_TABLES[id], t);
    const stored = PRECOMPUTED[id];
    expect(full.payback).toBeCloseTo(stored.payback, 12);
    expect(full.variance).toBeCloseTo(stored.variance, 9);
    full.final.forEach((p, r) => expect(p).toBeCloseTo(stored.final[r], 12));
    full.holdSizes.forEach((p, n) => expect(p).toBeCloseTo(stored.holdSizes[n], 12));
    const short = analyzeGame(PAY_TABLES[id].map((p, r) => (r === 9 ? ROYAL_SHORT_PAY : p)), t);
    expect(short.payback).toBeCloseTo(stored.shortCoinPayback, 12);
  });

  it('matches the published payback of every pay table', () => {
    const published = { '9/6': 0.995439, '9/5': 0.984498, '8/6': 0.983927, '8/5': 0.972984, '7/5': 0.961472, '6/5': 0.949961 };
    for (const id of PAY_TABLE_IDS) expect(PRECOMPUTED[id].payback).toBeCloseTo(published[id], 6);
    expect(PRECOMPUTED['9/6'].shortCoinPayback).toBeCloseTo(0.9837, 4);
  });
});
