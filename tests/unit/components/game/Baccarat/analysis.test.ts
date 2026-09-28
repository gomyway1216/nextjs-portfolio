import { describe, expect, it } from 'vitest';

import {
  ODDS_BETS,
  betOdds,
  exactOdds,
  expectedCardsPerHand,
  oddsBetFor,
  reduced,
  shoeOdds,
  type ExactOdds,
} from '@/components/game/Baccarat/analysis';
import {
  RANKS,
  createShoe,
  dealHand,
  isDragon7,
  isPair,
  isPanda8,
  playRound,
  shoeFinished,
  type Card,
  type Rank,
} from '@/components/game/Baccarat/engine';

const edge = (id: (typeof ODDS_BETS)[number], odds: ExactOdds) => -betOdds(id, odds).ev;

describe('exact odds off the top of the shoe', () => {
  it('reproduces the published eight-deck combinatorics to the last digit', () => {
    const o = shoeOdds(8);
    expect(o.total).toBe(4_998_398_275_503_360);
    expect(o.banker).toBe(2_292_252_566_437_888);
    expect(o.player).toBe(2_230_518_282_592_256);
    expect(o.tie).toBe(475_627_426_473_216);
    expect(o.banker + o.player + o.tie).toBe(o.total);
  });

  it('gives the textbook house edges', () => {
    const eight = shoeOdds(8);
    expect(edge('banker', eight)).toBeCloseTo(0.010579, 6);
    expect(edge('player', eight)).toBeCloseTo(0.012351, 6);
    expect(edge('tie', eight)).toBeCloseTo(0.143596, 6);
    expect(edge('tie9', eight)).toBeCloseTo(0.04844, 5);
    expect(edge('bankerEz', eight)).toBeCloseTo(0.010183, 6);
    expect(edge('dragon7', eight)).toBeCloseTo(0.0761, 4);
    expect(edge('panda8', eight)).toBeCloseTo(0.1019, 4);
    expect(edge('pair', eight)).toBeCloseTo(0.103614, 6);

    const six = shoeOdds(6);
    expect(edge('banker', six)).toBeCloseTo(0.010558, 6);
    expect(edge('player', six)).toBeCloseTo(0.012374, 6);
    expect(edge('tie', six)).toBeCloseTo(0.144382, 6);

    const one = shoeOdds(1);
    expect(edge('banker', one)).toBeCloseTo(0.010117, 6);
    expect(edge('player', one)).toBeCloseTo(0.012864, 6);
    expect(edge('tie', one)).toBeCloseTo(0.157461, 6);
  });

  it('prices the pairs in closed form: (4d − 1)/(52d − 1)', () => {
    for (const d of [1, 2, 4, 6, 8]) {
      const o = shoeOdds(d);
      expect(reduced(o.pair, o.pairTotal)).toEqual(reduced(4 * d - 1, 52 * d - 1));
    }
    expect(reduced(shoeOdds(8).pair, shoeOdds(8).pairTotal)).toEqual([31, 415]);
  });

  it('keeps its books consistent', () => {
    const o = shoeOdds(8);
    expect(o.cardsUsed.reduce((a, b) => a + b, 0)).toBe(o.total);
    expect(expectedCardsPerHand(o)).toBeCloseTo(4.9388, 4);
    for (const id of ODDS_BETS) {
      const b = betOdds(id, o);
      expect(b.win + b.push + b.lose).toBeCloseTo(1, 12);
      expect(b.ev, id).toBeLessThan(0);
    }
    expect(oddsBetFor('banker', 'ez')).toBe('bankerEz');
    expect(oddsBetFor('banker', 'commission')).toBe('banker');
    expect(oddsBetFor('bankerPair', 'commission')).toBe('pair');
    expect(() => exactOdds([1, 2, 3])).toThrow();
    expect(() => exactOdds(RANKS.map((_, i) => (i < 5 ? 1 : 0)))).toThrow(/six cards/);
  });
});

describe('engine vs analysis', () => {
  /**
   * Runs the real playRound over every ordered draw of six distinct cards from
   * a small shoe and tallies what the enumeration claims — an independent
   * check of the drawing rules and of the counting.
   */
  function bruteForce(ranks: Rank[]) {
    const cards: Card[] = ranks.map((rank, i) => ({ rank, suit: (['♠', '♥', '♦', '♣'] as const)[i % 4] }));
    const n = cards.length;
    const used = new Array<boolean>(n).fill(false);
    const seq: Card[] = [];
    const tally = { total: 0, banker: 0, player: 0, tie: 0, dragon7: 0, panda8: 0, natural: 0, playerDraws: 0, bankerDraws: 0, pair: 0, cards: [0, 0, 0] };
    const visit = () => {
      if (seq.length === 6) {
        let i = 0;
        const hand = playRound(() => seq[i++]);
        tally.total++;
        tally[hand.winner]++;
        if (isDragon7(hand)) tally.dragon7++;
        if (isPanda8(hand)) tally.panda8++;
        if (hand.natural) tally.natural++;
        if (hand.player.length === 3) tally.playerDraws++;
        if (hand.banker.length === 3) tally.bankerDraws++;
        if (isPair(hand.player)) tally.pair++;
        tally.cards[i - 4]++;
        return;
      }
      for (let k = 0; k < n; k++) {
        if (used[k]) continue;
        used[k] = true;
        seq.push(cards[k]);
        visit();
        seq.pop();
        used[k] = false;
      }
    };
    visit();
    return tally;
  }

  it.each([
    [['A', '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'K']],
    [['K', 'K', 'Q', '9', '8', '7', '7', '6', '3', 'A']],
    [['9', '9', '8', '8', '7', '6', '5', '4', '3', '2', 'A', 'T']],
  ] as Rank[][][])('agrees exactly on %j', (ranks) => {
    const brute = bruteForce(ranks);
    const counts = RANKS.map((r) => ranks.filter((x) => x === r).length);
    const exact = exactOdds(counts);
    expect({
      total: exact.total,
      banker: exact.banker,
      player: exact.player,
      tie: exact.tie,
      dragon7: exact.dragon7,
      panda8: exact.panda8,
      natural: exact.natural,
      playerDraws: exact.playerDraws,
      bankerDraws: exact.bankerDraws,
      cards: exact.cardsUsed,
      // Pair bets live on their own denominator: compare as cross-multiplied fractions.
      pair: (exact.pair * exact.total) / exact.pairTotal,
    }).toEqual(brute);
  });

  it('matches hands dealt from real shuffled shoes', () => {
    let s = 99;
    const rng = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const tally = { banker: 0, player: 0, tie: 0 };
    let hands = 0;
    while (hands < 20_000) {
      let shoe = createShoe(8, rng);
      while (!shoeFinished(shoe)) {
        const dealt = dealHand(shoe);
        shoe = dealt.shoe;
        tally[dealt.hand.winner]++;
        hands++;
      }
    }
    const o = shoeOdds(8);
    for (const w of ['banker', 'player', 'tie'] as const) {
      const p = o[w] / o.total;
      const sd = Math.sqrt((p * (1 - p)) / hands);
      expect(Math.abs(tally[w] / hands - p), w).toBeLessThan(4 * sd);
    }
  });
});
