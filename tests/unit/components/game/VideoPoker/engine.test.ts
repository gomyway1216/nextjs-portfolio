import { describe, expect, it } from 'vitest';

import {
  HANDS,
  PAY_TABLES,
  cardLabel,
  deal,
  draw,
  heldFromMask,
  holdMask,
  payout,
  rankCards,
} from '@/components/game/VideoPoker/engine';

const RANKS = '23456789TJQKA';
/** "K♠" style → card number. */
const c = (s: string) => '♠♥♦♣'.indexOf(s[1]) * 13 + RANKS.indexOf(s[0]);
const hand = (...cards: string[]) => rankCards(cards.map(c));
const name = (...cards: string[]) => HANDS[hand(...cards)];

function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

describe('hand ranking', () => {
  it('ranks every paying hand', () => {
    expect(name('T♠', 'J♠', 'Q♠', 'K♠', 'A♠')).toBe('royalFlush');
    expect(name('9♥', 'T♥', 'J♥', 'Q♥', 'K♥')).toBe('straightFlush');
    expect(name('A♦', '2♦', '3♦', '4♦', '5♦')).toBe('straightFlush'); // the wheel
    expect(name('7♠', '7♥', '7♦', '7♣', 'K♠')).toBe('fourOfAKind');
    expect(name('7♠', '7♥', '7♦', 'K♣', 'K♠')).toBe('fullHouse');
    expect(name('K♠', 'K♥', '7♦', '7♣', '7♠')).toBe('fullHouse');
    expect(name('2♣', '9♣', 'J♣', 'K♣', '4♣')).toBe('flush');
    expect(name('5♠', '6♥', '7♦', '8♣', '9♠')).toBe('straight');
    expect(name('A♠', '2♥', '3♦', '4♣', '5♠')).toBe('straight');
    expect(name('T♠', 'J♥', 'Q♦', 'K♣', 'A♠')).toBe('straight');
    expect(name('7♠', '7♥', '7♦', 'K♣', '2♠')).toBe('threeOfAKind');
    expect(name('7♠', '7♥', 'K♦', 'K♣', '2♠')).toBe('twoPair');
    expect(name('J♠', 'J♥', '3♦', '8♣', '2♠')).toBe('jacksOrBetter');
    expect(name('A♠', '3♥', 'A♦', '8♣', '2♠')).toBe('jacksOrBetter');
  });

  it('pays nothing for low pairs, high cards and near misses', () => {
    expect(name('T♠', 'T♥', '3♦', '8♣', '2♠')).toBe('nothing');
    expect(name('A♠', 'K♥', '3♦', '8♣', '2♠')).toBe('nothing');
    expect(name('J♠', 'Q♥', 'K♦', 'A♣', '2♠')).toBe('nothing'); // K-A-2 does not wrap
    expect(name('2♠', '3♠', '4♠', '5♠', '7♥')).toBe('nothing');
  });

  it('does not depend on the order of the cards', () => {
    const cards = ['K♠', '7♥', 'K♦', '7♣', '7♠'].map(c);
    for (let i = 0; i < 5; i++) {
      const rotated = [...cards.slice(i), ...cards.slice(0, i)];
      expect(HANDS[rankCards(rotated)]).toBe('fullHouse');
    }
  });
});

describe('pay tables and the deal', () => {
  it('pays per coin, with the royal jumping to 4,000 at five coins', () => {
    const pays = PAY_TABLES['9/6'];
    expect(payout(HANDS.indexOf('fullHouse'), pays, 5)).toBe(45);
    expect(payout(HANDS.indexOf('flush'), pays, 3)).toBe(18);
    expect(payout(HANDS.indexOf('fullHouse'), PAY_TABLES['8/5'], 5)).toBe(40);
    expect(payout(HANDS.indexOf('royalFlush'), pays, 4)).toBe(1000);
    expect(payout(HANDS.indexOf('royalFlush'), pays, 5)).toBe(4000);
    expect(payout(0, pays, 5)).toBe(0);
  });

  it('deals ten distinct cards and replaces only the cards not held', () => {
    const d = deal(seeded(7));
    expect(new Set([...d.hand, ...d.stub]).size).toBe(10);
    for (const card of [...d.hand, ...d.stub]) {
      expect(card).toBeGreaterThanOrEqual(0);
      expect(card).toBeLessThan(52);
    }
    const held = [true, false, true, false, false];
    expect(draw(d, held)).toEqual([d.hand[0], d.stub[0], d.hand[2], d.stub[1], d.stub[2]]);
    expect(draw(d, [true, true, true, true, true])).toEqual(d.hand);
    expect(holdMask(held)).toBe(0b00101);
    expect(heldFromMask(0b00101)).toEqual(held);
    expect(cardLabel(c('T♥'))).toBe('10♥');
  });

  it('shuffles fairly enough that every card turns up in every position', () => {
    const rng = seeded(11);
    const seen = Array.from({ length: 5 }, () => new Set<number>());
    for (let i = 0; i < 2_000; i++) deal(rng).hand.forEach((card, pos) => seen[pos].add(card));
    for (const s of seen) expect(s.size).toBe(52);
  });
});
