import { describe, expect, it } from 'vitest';

import {
  DECKS,
  RANKS,
  STRATEGIES,
  act,
  answerInsurance,
  basicStrategy,
  createShoe,
  handValue,
  isBlackjack,
  isPair,
  legalActions,
  needsShuffle,
  playRound,
  startRound,
  totalStaked,
  type Card,
  type Rank,
  type Round,
  type Shoe,
} from '@/components/game/Blackjack/engine';

const c = (rank: Rank): Card => ({ rank, suit: '♠' });
const cards = (...ranks: Rank[]) => ranks.map(c);
/** A shoe that deals exactly these cards after the burn card. */
const scripted = (...ranks: Rank[]): Shoe => ({ decks: 1, cards: [c('2'), ...cards(...ranks)], next: 1, cutIndex: 1_000 });
const ALL = { double: true, split: true };

function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

describe('hands', () => {
  it('counts aces as 11 until that would bust', () => {
    expect(handValue(cards('K', 'Q'))).toEqual({ total: 20, soft: false });
    expect(handValue(cards('A', '6'))).toEqual({ total: 17, soft: true });
    expect(handValue(cards('A', '6', 'T'))).toEqual({ total: 17, soft: false });
    expect(handValue(cards('A', 'A'))).toEqual({ total: 12, soft: true });
    expect(handValue(cards('A', 'A', '9', 'K'))).toEqual({ total: 21, soft: false });
    expect(isBlackjack(cards('A', 'K'))).toBe(true);
    expect(isBlackjack(cards('7', '7', '7'))).toBe(false);
    expect(isPair(cards('K', 'Q'))).toBe(true);
    expect(isPair(cards('9', '8'))).toBe(false);
  });

  it('shuffles six decks, burns one card and cuts at 75%', () => {
    const shoe = createShoe(DECKS, seeded(1));
    expect(shoe.cards).toHaveLength(312);
    for (const rank of RANKS) expect(shoe.cards.filter((x) => x.rank === rank)).toHaveLength(24);
    expect(shoe.next).toBe(1);
    expect(shoe.cutIndex).toBe(234);
    expect(needsShuffle({ ...shoe, next: 234 })).toBe(true);
  });
});

describe('a round', () => {
  it('deals player, dealer, player, dealer and waits for the player', () => {
    const r = startRound(scripted('9', '6', '7', 'K'), 10);
    expect(r.hands[0].cards).toEqual(cards('9', '7'));
    expect(r.dealer).toEqual(cards('6', 'K'));
    expect(r.phase).toBe('player');
    expect(legalActions(r)).toEqual({ hit: true, stand: true, double: true, split: false });
    expect(totalStaked(r)).toBe(10);
  });

  it('pays a natural 3:2 at once and pushes it against a dealer natural', () => {
    const bj = startRound(scripted('A', '9', 'K', '8'), 10);
    expect(bj.phase).toBe('done');
    expect(bj.result).toMatchObject({ net: 15, returned: 25 });
    expect(bj.result!.hands[0].outcome).toBe('blackjack');
    const both = startRound(scripted('A', 'K', 'Q', 'A'), 10);
    expect(both.result!.hands[0].outcome).toBe('push');
    expect(both.result!.returned).toBe(10);
  });

  it('peeks under a ten: a dealer natural ends the round before the player acts', () => {
    const r = startRound(scripted('9', 'K', '9', 'A'), 10);
    expect(r.phase).toBe('done');
    expect(r.result).toMatchObject({ dealerBlackjack: true, net: -10, returned: 0 });
  });

  it('offers insurance under an ace and pays it 2:1 when the dealer has blackjack', () => {
    const r = startRound(scripted('9', 'A', '9', 'K'), 10);
    expect(r.phase).toBe('insurance');
    expect(legalActions(r).hit).toBe(false);
    const insured = answerInsurance(r, true);
    expect(insured.result).toMatchObject({ dealerBlackjack: true, net: 0, returned: 15 });
    expect(insured.result!.insurance).toEqual({ stake: 5, profit: 10 });
    // Declined and no dealer blackjack: play on.
    const played = answerInsurance(startRound(scripted('9', 'A', '9', '6'), 10), false);
    expect(played.phase).toBe('player');
    // Taken but lost: the stake is gone and play continues.
    const lost = answerInsurance(startRound(scripted('9', 'A', '9', '6'), 10), true);
    expect(lost.insurance).toBe(5);
    const done = act(lost, 'stand'); // dealer A,6 = soft 17 stands
    expect(done.result).toMatchObject({ dealerTotal: 17, insurance: { stake: 5, profit: -5 } });
    expect(done.result!.net).toBe(10 - 5);
  });

  it('draws the dealer to 17 and stands on soft 17', () => {
    const r = act(startRound(scripted('T', '6', '8', '5', '3', '5'), 10), 'stand'); // dealer 6+5+3+5 = 19
    expect(r.dealer).toEqual(cards('6', '5', '3', '5'));
    expect(r.result).toMatchObject({ dealerTotal: 19, net: -10 });
    const soft = act(answerInsurance(startRound(scripted('T', 'A', '8', '6'), 10), false), 'stand'); // A,6 stands
    expect(soft.dealer).toHaveLength(2);
    expect(soft.result).toMatchObject({ dealerTotal: 17, net: 10 });
  });

  it('busts, doubles and ends a hand on 21', () => {
    const bust = act(startRound(scripted('T', '7', '6', 'K', 'Q'), 10), 'hit');
    expect(bust.phase).toBe('done');
    expect(bust.result!.hands[0].outcome).toBe('bust');
    // Every hand busted: the dealer turns the hole card but draws nothing.
    expect(bust.dealer).toHaveLength(2);
    const doubled = act(startRound(scripted('6', '6', '5', 'T', 'K', '9'), 10), 'double');
    expect(doubled.hands[0]).toMatchObject({ bet: 20, doubled: true });
    expect(doubled.hands[0].cards).toHaveLength(3);
    expect(doubled.result).toMatchObject({ net: 20, returned: 40 }); // 21 vs dealer 16 + 9 = bust
    const twentyOne = act(startRound(scripted('9', '7', '2', 'T', 'K'), 10), 'hit');
    expect(handValue(twentyOne.hands[0].cards).total).toBe(21);
    expect(twentyOne.phase).toBe('done');
  });

  it('splits into hands played one at a time, dealing each its second card in turn', () => {
    // 8,8 vs 6: split; hand 1 gets a 3 (11) and doubles onto a K; hand 2 gets a T and stands.
    let r: Round = startRound(scripted('8', '6', '8', 'T', '3', 'K', 'T', '7'), 10);
    r = act(r, 'split');
    expect(r.hands).toHaveLength(2);
    expect(r.hands[0].cards).toEqual(cards('8', '3'));
    expect(r.hands[1].cards).toEqual(cards('8')); // second card comes when it is played
    expect(totalStaked(r)).toBe(20);
    r = act(r, 'double');
    expect(r.active).toBe(1);
    expect(r.hands[1].cards).toEqual(cards('8', 'T'));
    r = act(r, 'stand');
    expect(r.phase).toBe('done');
    // Dealer 6,T,7 = 23 busts: +20 on the double, +10 on the other hand.
    expect(r.result).toMatchObject({ dealerBust: true, net: 30, returned: 60 });
    expect(r.hands[0].split && r.hands[1].split).toBe(true);
  });

  it('gives split aces one card each and never counts a split 21 as blackjack', () => {
    const r = act(startRound(scripted('A', '9', 'A', '8', 'K', '5'), 10), 'split');
    expect(r.phase).toBe('done');
    expect(r.hands.map((h) => h.cards)).toEqual([cards('A', 'K'), cards('A', '5')]);
    // A,K = 21 pays 1:1; A,5 = 16 loses to 17.
    expect(r.result!.hands.map((h) => [h.outcome, h.profit])).toEqual([
      ['win', 10],
      ['lose', -10],
    ]);
  });

  it('caps splitting at four hands and rejects illegal moves', () => {
    let r: Round = startRound(scripted('8', '6', '8', 'T', '8', '8', '8', 'K', 'K', 'K', 'K', 'K'), 5);
    r = act(r, 'split'); // hand 1 gets another 8
    r = act(r, 'split');
    r = act(r, 'split');
    expect(r.hands).toHaveLength(4);
    expect(legalActions(r).split).toBe(false);
    expect(() => act(r, 'split')).toThrow();
    const done = act(startRound(scripted('T', '7', '9', 'K'), 5), 'stand');
    expect(() => act(done, 'hit')).toThrow();
  });
});

describe('basic strategy chart', () => {
  const up = (r: Rank) => c(r);
  it('plays the standard six-deck S17 chart', () => {
    expect(basicStrategy(cards('T', '6'), up('T'), ALL)).toBe('hit');
    expect(basicStrategy(cards('T', '6'), up('6'), ALL)).toBe('stand');
    expect(basicStrategy(cards('T', '2'), up('3'), ALL)).toBe('hit');
    expect(basicStrategy(cards('6', '5'), up('T'), ALL)).toBe('double');
    expect(basicStrategy(cards('6', '5'), up('A'), ALL)).toBe('hit');
    expect(basicStrategy(cards('8', '8'), up('A'), ALL)).toBe('split');
    expect(basicStrategy(cards('9', '9'), up('7'), ALL)).toBe('stand');
    expect(basicStrategy(cards('K', 'Q'), up('6'), ALL)).toBe('stand');
    expect(basicStrategy(cards('5', '5'), up('9'), ALL)).toBe('double');
    expect(basicStrategy(cards('A', '7'), up('9'), ALL)).toBe('hit');
    // Soft 19 stands against a 6 at S17 (doubling it is the H17 play).
    expect(basicStrategy(cards('A', '8'), up('6'), ALL)).toBe('stand');
  });

  it('falls back when a double or split is not possible', () => {
    expect(basicStrategy(cards('6', '5'), up('6'), { double: false, split: false })).toBe('hit');
    // Soft 18 "double else stand".
    expect(basicStrategy(cards('A', '7'), up('4'), { double: false, split: false })).toBe('stand');
    expect(basicStrategy(cards('A', '2', '2'), up('5'), { double: false, split: false })).toBe('hit');
    // 8,8 without a split is a hard 16.
    expect(basicStrategy(cards('8', '8'), up('T'), { double: true, split: false })).toBe('hit');
  });
});

describe('playRound', () => {
  it('plays whole rounds with each strategy and reshuffles after the cut card', () => {
    const rng = seeded(9);
    let shoe = createShoe(DECKS, rng);
    let reshuffles = 0;
    for (let i = 0; i < 200; i++) {
      const before = shoe;
      const r = playRound(shoe, 1, STRATEGIES.basic, rng);
      if (r.shoe.cards !== before.cards) reshuffles++;
      expect(r.phase).toBe('done');
      expect(r.result!.returned).toBeGreaterThanOrEqual(0);
      shoe = r.shoe;
    }
    expect(reshuffles).toBeGreaterThanOrEqual(2);
    const mimic = playRound(createShoe(DECKS, seeded(2)), 1, STRATEGIES.mimic);
    expect(mimic.hands.every((h) => !h.doubled)).toBe(true);
    expect(mimic.hands).toHaveLength(1);
  });
});
