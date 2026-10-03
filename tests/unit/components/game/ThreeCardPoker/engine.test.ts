import { describe, expect, it } from 'vitest';

import {
  ANTE_BONUS_PAYS,
  CATEGORIES,
  DECK_SIZE,
  PAIR_PLUS_PAYS,
  PAIR_PLUS_PAYS_OLD,
  PLAY_THRESHOLD,
  PLAY_THRESHOLD_SCORE,
  QUALIFY_SCORE,
  RANKS,
  SUITS,
  cardAt,
  cardIndex,
  compareHands,
  dealRound,
  dealerQualifies,
  decide,
  evaluate,
  freshDeck,
  rankOfValue,
  rankValue,
  scoreRanks,
  settle,
  type Card,
  type Category,
  type LineId,
  type Rank,
} from '@/components/game/ThreeCardPoker/engine';

const SUIT_OF = { s: '♠', h: '♥', d: '♦', c: '♣' } as const;
/** 'Qs 6h 4d' → the three cards. */
const hand = (text: string): Card[] =>
  text.split(' ').map((c) => ({ rank: c[0] as Rank, suit: SUIT_OF[c[1] as keyof typeof SUIT_OF] }));
const category = (text: string): Category => evaluate(hand(text)).category;
const beats = (a: string, b: string) => compareHands(hand(a), hand(b)) > 0 && compareHands(hand(b), hand(a)) < 0;

function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

describe('cards', () => {
  it('numbers the 52 cards and reads them back', () => {
    const deck = freshDeck();
    expect(deck).toHaveLength(DECK_SIZE);
    expect(new Set(deck.map((c) => `${c.rank}${c.suit}`)).size).toBe(52);
    expect(deck.map(cardIndex)).toEqual(Array.from({ length: 52 }, (_, i) => i));
    expect(cardAt(0)).toEqual({ rank: '2', suit: '♠' });
    expect(cardAt(51)).toEqual({ rank: 'A', suit: '♣' });
    expect(RANKS.map(rankValue)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    expect(rankOfValue(12)).toBe('Q');
    // The ace of an A-2-3 straight plays low and is recorded as a 1.
    expect(rankOfValue(1)).toBe('A');
    expect(SUITS).toHaveLength(4);
  });
});

describe('hand ranking', () => {
  it('names every category', () => {
    expect(category('Ks Qs Js')).toBe('straightFlush');
    expect(category('Ks Kh Kd')).toBe('threeOfAKind');
    expect(category('Ks Qh Jd')).toBe('straight');
    expect(category('Ks Qs 9s')).toBe('flush');
    expect(category('Ks Kh 2d')).toBe('pair');
    expect(category('2s Kh Kd')).toBe('pair');
    expect(category('Ks Qh 9d')).toBe('highCard');
    expect(CATEGORIES).toEqual(['highCard', 'pair', 'flush', 'straight', 'threeOfAKind', 'straightFlush']);
  });

  it('ranks straight flush > three of a kind > straight > flush > pair > high card', () => {
    // The weakest hand of each category still beats the strongest of the one below.
    expect(beats('As 2s 3s', 'Ah Ad Ac')).toBe(true);
    expect(beats('2s 2h 2d', 'Qs Kh Ad')).toBe(true);
    expect(beats('As 2h 3d', 'Ah Kh Jh')).toBe(true);
    expect(beats('5s 3s 2s', 'Ah Ad Kc')).toBe(true);
    expect(beats('2s 2h 3d', 'Ah Kd Jc')).toBe(true);
  });

  it('treats A-2-3 as the lowest straight and Q-K-A as the highest', () => {
    expect(category('As 2h 3d')).toBe('straight');
    expect(evaluate(hand('As 2h 3d')).tiebreak).toEqual([3, 2, 1]);
    expect(category('Qs Kh Ad')).toBe('straight');
    expect(evaluate(hand('Qs Kh Ad')).tiebreak).toEqual([14, 13, 12]);
    expect(beats('2s 3h 4d', 'As 2h 3d')).toBe(true);
    expect(beats('Qs Kh Ad', 'Js Qh Kd')).toBe(true);
    // No wrapping around the ace.
    expect(category('Ks Ah 2d')).toBe('highCard');
    // The same holds for straight flushes.
    expect(category('Ah 2h 3h')).toBe('straightFlush');
    expect(beats('2c 3c 4c', 'Ah 2h 3h')).toBe(true);
    expect(beats('Qd Kd Ad', 'Jc Qc Kc')).toBe(true);
    // Every run of three consecutive ranks is a straight: 12 of them.
    const straights = new Set<number>();
    for (let a = 2; a <= 14; a++) for (let b = a + 1; b <= 14; b++) for (let c = b + 1; c <= 14; c++) {
      const score = scoreRanks(a, b, c, false);
      if (score >> 12 === 3) straights.add(score);
    }
    expect(straights.size).toBe(12);
  });

  it('breaks ties inside a category by the ranks', () => {
    // High card: first, second, then third card.
    expect(beats('As 4h 2d', 'Ks Qh 9d')).toBe(true);
    expect(beats('As Kh 2d', 'As Qh Jd')).toBe(true);
    expect(beats('Qs 6h 4d', 'Qc 6d 3h')).toBe(true);
    // Pairs: the pair first, then the kicker.
    expect(beats('3s 3h 2d', '2s 2h Ad')).toBe(true);
    expect(beats('8s 8h Kd', '8d 8c Qs')).toBe(true);
    expect(beats('8s 8h 2d', '7s 7h Ad')).toBe(true);
    // Flushes compare like high-card hands.
    expect(beats('As 9s 2s', 'Kh Qh 9h')).toBe(true);
    expect(beats('Ks 9s 3s', 'Kh 9h 2h')).toBe(true);
    // Three of a kind and straights by rank.
    expect(beats('3s 3h 3d', '2s 2h 2d')).toBe(true);
    expect(beats('9s Th Jd', '8s 9h Td')).toBe(true);
  });

  it('ignores suits and the order of the cards', () => {
    expect(compareHands(hand('Qs 6h 4d'), hand('Qc 6d 4h'))).toBe(0);
    expect(compareHands(hand('8s 8h Kd'), hand('Kc 8d 8c'))).toBe(0);
    expect(compareHands(hand('Ks Qs 9s'), hand('9h Kh Qh'))).toBe(0);
    const orders = ['Qs 6h 4d', 'Qs 4d 6h', '6h Qs 4d', '6h 4d Qs', '4d Qs 6h', '4d 6h Qs'];
    expect(new Set(orders.map((o) => evaluate(hand(o)).score)).size).toBe(1);
    expect(evaluate(hand('4d 6h Qs')).tiebreak).toEqual([12, 6, 4]);
    expect(evaluate(hand('2s Kh Kd')).tiebreak).toEqual([13, 2, 0]);
  });

  it('needs exactly three cards', () => {
    expect(() => evaluate(hand('Qs 6h'))).toThrow(/three cards/);
    expect(() => evaluate(hand('Qs 6h 4d 2c'))).toThrow(/three cards/);
  });
});

describe('dealer qualification', () => {
  it('qualifies with Queen-high or better', () => {
    expect(dealerQualifies(hand('Qs 3h 2d'))).toBe(true);
    expect(dealerQualifies(hand('Qs Jh 9d'))).toBe(true);
    expect(dealerQualifies(hand('Ks 3h 2d'))).toBe(true);
    expect(dealerQualifies(hand('As 4h 2c'))).toBe(true);
    // The best hand that doesn't: J-10-8 (J-10-9 would be a straight).
    expect(dealerQualifies(hand('Js Th 8d'))).toBe(false);
    expect(dealerQualifies(hand('5s 3h 2d'))).toBe(false);
    // Anything better than a high card qualifies, however small.
    expect(dealerQualifies(hand('2s 2h 3d'))).toBe(true);
    expect(dealerQualifies(hand('5s 3s 2s'))).toBe(true);
    expect(dealerQualifies(hand('Js Th 9d'))).toBe(true);
    expect(evaluate(hand('Qs 3h 2d')).score).toBeGreaterThanOrEqual(QUALIFY_SCORE);
    expect(evaluate(hand('Js Th 8d')).score).toBeLessThan(QUALIFY_SCORE);
  });
});

describe('dealing', () => {
  it('deals six different cards, reproducibly for a given rng', () => {
    const a = dealRound(seeded(42));
    const b = dealRound(seeded(42));
    expect(a).toEqual(b);
    expect(a.player).toHaveLength(3);
    expect(a.dealer).toHaveLength(3);
    expect(new Set([...a.player, ...a.dealer].map(cardIndex)).size).toBe(6);
    expect(dealRound(seeded(43))).not.toEqual(a);
    // An rng stuck at 0 leaves the deck in order; one stuck just below 1 still deals six different cards.
    expect(dealRound(() => 0).player.map(cardIndex)).toEqual([0, 1, 2]);
    expect(dealRound(() => 0).dealer.map(cardIndex)).toEqual([3, 4, 5]);
    const high = dealRound(() => 0.999999);
    expect(new Set([...high.player, ...high.dealer].map(cardIndex)).size).toBe(6);
  });

  it('deals every card to every seat equally often', () => {
    const rng = seeded(2026);
    const deals = 26_000;
    const counts = Array.from({ length: 6 }, () => new Array<number>(52).fill(0));
    for (let i = 0; i < deals; i++) {
      const { player, dealer } = dealRound(rng);
      [...player, ...dealer].forEach((card, seat) => counts[seat][cardIndex(card)]++);
    }
    const expected = deals / 52;
    const sd = Math.sqrt(deals * (1 / 52) * (51 / 52));
    const worst = Math.max(...counts.flat().map((n) => Math.abs(n - expected)));
    expect(worst).toBeLessThan(5 * sd);
  });
});

describe('settlement', () => {
  const bets = { ante: 10, pairPlus: 5 };
  const ids = (s: ReturnType<typeof settle>): LineId[] => s.lines.map((l) => l.id);
  const lineOf = (s: ReturnType<typeof settle>, id: LineId) => s.lines.find((l) => l.id === id)!;

  it('forfeits the Ante and Pair Plus on a fold', () => {
    const s = settle(bets, 'fold', hand('Qs 6h 3d'), hand('Js Th 8d'));
    expect(s.showdown).toBe('fold');
    expect(ids(s)).toEqual(['ante', 'pairPlus']);
    expect(lineOf(s, 'ante')).toEqual({ id: 'ante', stake: 10, outcome: 'lose', profit: 0, returned: 0 });
    expect(lineOf(s, 'pairPlus')).toEqual({ id: 'pairPlus', stake: 5, outcome: 'lose', profit: 0, returned: 0 });
    expect(s).toMatchObject({ staked: 15, returned: 0, net: -15, decision: 'fold' });
    // Even a made hand is forfeited: no Pair Plus payout and no Ante Bonus for a folded straight.
    const folded = settle(bets, 'fold', hand('Ks Qh Jd'), hand('Js Th 8d'));
    expect(ids(folded)).toEqual(['ante', 'pairPlus']);
    expect(folded.net).toBe(-15);
    // Without a Pair Plus bet only the Ante is at stake.
    const anteOnly = settle({ ante: 10, pairPlus: 0 }, 'fold', hand('5s 3h 2d'), hand('As Ah Ad'));
    expect(ids(anteOnly)).toEqual(['ante']);
    expect(anteOnly).toMatchObject({ staked: 10, returned: 0, net: -10 });
  });

  it('pays the Ante and pushes the Play bet when the dealer does not qualify', () => {
    const s = settle(bets, 'play', hand('Ks 7h 2d'), hand('Js Th 8d'));
    expect(s.dealerQualifies).toBe(false);
    expect(s.showdown).toBe('notQualified');
    expect(lineOf(s, 'ante')).toEqual({ id: 'ante', stake: 10, outcome: 'win', profit: 10, returned: 20 });
    expect(lineOf(s, 'play')).toEqual({ id: 'play', stake: 10, outcome: 'push', profit: 0, returned: 10 });
    expect(lineOf(s, 'pairPlus').outcome).toBe('lose');
    expect(s).toMatchObject({ staked: 25, returned: 30, net: 5 });
    // The player's hand doesn't even have to be the better one.
    const worse = settle({ ante: 10, pairPlus: 0 }, 'play', hand('5s 3h 2d'), hand('Js Th 8d'));
    expect(worse.showdown).toBe('notQualified');
    expect(worse).toMatchObject({ staked: 20, returned: 30, net: 10 });
  });

  it('pays both bets 1:1 when the player beats a qualifying dealer', () => {
    const s = settle(bets, 'play', hand('Ks Kh 2d'), hand('Qs 7h 2c'));
    expect(s.dealerQualifies).toBe(true);
    expect(s.showdown).toBe('win');
    expect(ids(s)).toEqual(['ante', 'play', 'pairPlus']);
    expect(lineOf(s, 'ante')).toEqual({ id: 'ante', stake: 10, outcome: 'win', profit: 10, returned: 20 });
    expect(lineOf(s, 'play')).toEqual({ id: 'play', stake: 10, outcome: 'win', profit: 10, returned: 20 });
    expect(lineOf(s, 'pairPlus')).toEqual({ id: 'pairPlus', stake: 5, outcome: 'win', profit: 5, returned: 10 });
    expect(s).toMatchObject({ staked: 25, returned: 50, net: 25 });
  });

  it('loses both bets when a qualifying dealer wins', () => {
    const s = settle(bets, 'play', hand('Ks 7h 2d'), hand('As 7d 2c'));
    expect(s.showdown).toBe('lose');
    expect(ids(s)).toEqual(['ante', 'play', 'pairPlus']);
    expect(s.lines.every((l) => l.outcome === 'lose' && l.returned === 0)).toBe(true);
    expect(s).toMatchObject({ staked: 25, returned: 0, net: -25 });
  });

  it('pushes both bets on a tie', () => {
    const s = settle(bets, 'play', hand('Ks 7h 2d'), hand('Kh 7d 2c'));
    expect(s.showdown).toBe('tie');
    expect(lineOf(s, 'ante')).toEqual({ id: 'ante', stake: 10, outcome: 'push', profit: 0, returned: 10 });
    expect(lineOf(s, 'play')).toEqual({ id: 'play', stake: 10, outcome: 'push', profit: 0, returned: 10 });
    expect(s).toMatchObject({ staked: 25, returned: 20, net: -5 });
  });

  it('pays the Ante Bonus even when the hand loses', () => {
    // A king-high straight runs into an ace-high straight.
    const s = settle(bets, 'play', hand('Ks Qh Jd'), hand('As Kd Qc'));
    expect(s.showdown).toBe('lose');
    expect(ids(s)).toEqual(['ante', 'play', 'anteBonus', 'pairPlus']);
    expect(lineOf(s, 'ante').returned).toBe(0);
    expect(lineOf(s, 'play').returned).toBe(0);
    expect(lineOf(s, 'anteBonus')).toEqual({ id: 'anteBonus', stake: 0, outcome: 'win', profit: 10, returned: 10 });
    expect(lineOf(s, 'pairPlus')).toEqual({ id: 'pairPlus', stake: 5, outcome: 'win', profit: 30, returned: 35 });
    expect(s).toMatchObject({ staked: 25, returned: 45, net: 20 });
  });

  it('pays the Ante Bonus 1:1, 4:1 and 5:1, whatever the dealer holds', () => {
    // Three of a kind against a dealer who doesn't qualify.
    const trips = settle(bets, 'play', hand('Ks Kh Kd'), hand('Js Th 8d'));
    expect(trips.showdown).toBe('notQualified');
    expect(lineOf(trips, 'anteBonus').profit).toBe(40);
    expect(lineOf(trips, 'pairPlus')).toMatchObject({ profit: 150, returned: 155 });
    expect(trips).toMatchObject({ staked: 25, returned: 20 + 10 + 40 + 155, net: 200 });
    // A straight flush beating three aces.
    const sf = settle(bets, 'play', hand('5s 4s 3s'), hand('Ah Ad Ac'));
    expect(sf.showdown).toBe('win');
    expect(lineOf(sf, 'anteBonus').profit).toBe(50);
    expect(lineOf(sf, 'pairPlus')).toMatchObject({ profit: 200, returned: 205 });
    expect(sf).toMatchObject({ staked: 25, returned: 20 + 20 + 50 + 205, net: 270 });
    // A straight: 1:1.
    expect(lineOf(settle(bets, 'play', hand('4s 3h 2d'), hand('Qs 7h 2c')), 'anteBonus').profit).toBe(10);
    // Flushes and pairs earn no bonus.
    expect(ids(settle(bets, 'play', hand('Ks 9s 2s'), hand('Qs 7h 2c')))).toEqual(['ante', 'play', 'pairPlus']);
    expect(ids(settle(bets, 'play', hand('9s 9h 2d'), hand('Qs 7h 2c')))).toEqual(['ante', 'play', 'pairPlus']);
    expect(ANTE_BONUS_PAYS).toEqual({ highCard: 0, pair: 0, flush: 0, straight: 1, threeOfAKind: 4, straightFlush: 5 });
  });

  it('pays Pair Plus on the player’s own hand at either pay table', () => {
    const dealer = hand('As Ah Ad');
    const profit = (cards: string, table = PAIR_PLUS_PAYS) => {
      const l = lineOf(settle({ ante: 10, pairPlus: 5 }, 'play', hand(cards), dealer, table), 'pairPlus');
      return l.outcome === 'win' ? l.profit : -l.stake;
    };
    // The dealer's three aces beat all but the straight flush, and Pair Plus pays anyway.
    expect(profit('Ks 9h 2d')).toBe(-5);
    expect(profit('9s 9h 2d')).toBe(5);
    expect(profit('Ks 9s 2s')).toBe(15);
    expect(profit('4s 3h 2d')).toBe(30);
    expect(profit('7s 7h 7d')).toBe(150);
    expect(profit('5s 4s 3s')).toBe(200);
    expect(profit('Ks 9s 2s', PAIR_PLUS_PAYS_OLD)).toBe(20);
    expect(profit('9s 9h 2d', PAIR_PLUS_PAYS_OLD)).toBe(5);
    expect(PAIR_PLUS_PAYS).toEqual({ highCard: 0, pair: 1, flush: 3, straight: 6, threeOfAKind: 30, straightFlush: 40 });
    expect(PAIR_PLUS_PAYS_OLD).toEqual({ ...PAIR_PLUS_PAYS, flush: 4 });
  });

  it('keeps amounts exact and its books balanced', () => {
    const s = settle({ ante: 2.5, pairPlus: 0.5 }, 'play', hand('Ks Qh Jd'), hand('Qs 7h 2c'));
    expect(lineOf(s, 'anteBonus').profit).toBe(2.5);
    expect(lineOf(s, 'pairPlus').returned).toBe(3.5);
    expect(s).toMatchObject({ staked: 5.5, returned: 5 + 5 + 2.5 + 3.5, net: 10.5 });
    for (const decision of ['play', 'fold'] as const) {
      const r = settle({ ante: 7, pairPlus: 3 }, decision, hand('8s 8h 2d'), hand('Ks Qh 2c'));
      expect(r.returned).toBe(r.lines.reduce((sum, l) => sum + l.returned, 0));
      expect(r.net).toBe(r.returned - r.staked);
      expect(r.staked).toBe(decision === 'play' ? 17 : 10);
    }
  });

  it('requires an Ante', () => {
    expect(() => settle({ ante: 0, pairPlus: 5 }, 'play', hand('Ks 9h 2d'), hand('Qs 7h 2c'))).toThrow(/Ante is required/);
    expect(() => settle({ ante: Number.NaN, pairPlus: 0 }, 'fold', hand('Ks 9h 2d'), hand('Qs 7h 2c'))).toThrow(/Ante is required/);
    expect(() => settle({ ante: 5, pairPlus: -1 }, 'play', hand('Ks 9h 2d'), hand('Qs 7h 2c'))).toThrow(/negative/);
  });
});

describe('strategies', () => {
  it('plays Q-6-4 or better when playing optimally', () => {
    expect(PLAY_THRESHOLD).toEqual(['Q', '6', '4']);
    expect(evaluate(hand('Qs 6h 4d')).score).toBe(PLAY_THRESHOLD_SCORE);
    expect(decide('optimal', hand('Qs 6h 4d'))).toBe('play');
    expect(decide('optimal', hand('Qs 6h 3d'))).toBe('fold');
    expect(decide('optimal', hand('Qs 5h 4d'))).toBe('fold');
    expect(decide('optimal', hand('Qs 7h 2d'))).toBe('play');
    expect(decide('optimal', hand('Ks 3h 2d'))).toBe('play');
    expect(decide('optimal', hand('Js Th 8d'))).toBe('fold');
    expect(decide('optimal', hand('2s 2h 3d'))).toBe('play');
    expect(decide('optimal', hand('5s 3s 2s'))).toBe('play');
  });

  it('knows the two naive strategies', () => {
    expect(decide('mimic', hand('Qs 3h 2d'))).toBe('play');
    expect(decide('mimic', hand('Js Th 8d'))).toBe('fold');
    expect(decide('always', hand('5s 3h 2d'))).toBe('play');
  });
});
