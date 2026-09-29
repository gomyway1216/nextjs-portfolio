import { describe, expect, it } from 'vitest';

import {
  P,
  TABLE_RULES,
  VALUES,
  addValue,
  dealerOutcome,
  gameValue,
  optimalChart,
  policyValue,
  upcard,
  type Value,
} from '@/components/game/Blackjack/analysis';
import {
  HARD_CHART,
  PAIR_CHART,
  RANKS,
  SOFT_CHART,
  act,
  answerInsurance,
  cardValue,
  handValue,
  playRound,
  startRound,
  type Card,
  type Decider,
  type Rank,
  type Round,
  type Shoe,
} from '@/components/game/Blackjack/engine';

const RANK_OF: Record<Value, Rank> = { 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: 'K', 11: 'A' };
const shoeOf = (ranks: Rank[]): Shoe => ({ decks: 1, cards: [{ rank: '2', suit: '♠' }, ...ranks.map((rank) => ({ rank, suit: '♠' as const }))], next: 1, cutIndex: 1e9 });

/**
 * Runs the real engine over every sequence of cards that can follow `prefix`
 * with infinite-deck probabilities: whenever the engine runs out of cards the
 * sequence branches on all ten values.
 */
function enumerate(prefix: Rank[], play: (round: Round) => Round, visit: (round: Round, p: number) => void) {
  const walk = (extra: Value[], p: number) => {
    let round: Round;
    try {
      round = play(startRound(shoeOf([...prefix, ...extra.map((v) => RANK_OF[v])]), 1));
    } catch (e) {
      if (e instanceof Error && /ran out/.test(e.message)) {
        for (const v of VALUES) walk([...extra, v], p * P[v]);
        return;
      }
      throw e;
    }
    visit(round, p);
  };
  walk([], 1);
}

const declineThen = (fn: (r: Round) => Round) => (r: Round) => {
  const next = r.phase === 'insurance' ? answerInsurance(r, false) : r;
  return next.phase === 'player' ? fn(next) : next;
};

/** Expected net per unit bet, given the dealer does not have blackjack. */
function evNoDealerBj(prefix: Rank[], play: (r: Round) => Round) {
  let ev = 0;
  let mass = 0;
  enumerate(prefix, declineThen(play), (round, p) => {
    if (round.result!.dealerBlackjack) return;
    ev += p * round.result!.net;
    mass += p;
  });
  return ev / mass;
}

/** Plays the analysis' best hit / stand from here on. */
const hitOrStandBest = (r: Round): Round => {
  let round = r;
  while (round.phase === 'player') {
    const a = upcard(cardValue(round.dealer[0]) as Value);
    const v = handValue(round.hands[round.active].cards);
    round = act(round, a.hit(v) > a.stand(v.total) ? 'hit' : 'stand');
  }
  return round;
};

describe('the dealer', () => {
  it('matches the engine’s dealer on every card sequence, for every up card', () => {
    for (const up of VALUES) {
      const tally = { 17: 0, 18: 0, 19: 0, 20: 0, 21: 0, bust: 0, blackjack: 0 };
      // Player K,Q = 20 stands, so the dealer always plays out.
      enumerate(['K', RANK_OF[up], 'Q'], declineThen((r) => act(r, 'stand')), (round, p) => {
        const res = round.result!;
        if (res.dealerBlackjack) tally.blackjack += p;
        else if (res.dealerBust) tally.bust += p;
        else tally[res.dealerTotal as 17 | 18 | 19 | 20 | 21] += p;
      });
      const exact = dealerOutcome(up);
      for (const k of Object.keys(tally) as (keyof typeof tally)[]) {
        expect(tally[k], `up ${up}: ${k}`).toBeCloseTo(exact[k], 12);
      }
    }
  });

  it('busts most often under a 5 or 6 and least under an ace', () => {
    const bust = VALUES.map((up) => dealerOutcome(up).bust);
    expect(Math.max(...bust)).toBe(bust[4]); // 6
    expect(bust[3]).toBeGreaterThan(0.41); // 5
    expect(Math.min(...bust)).toBe(bust[9]); // A
    expect(dealerOutcome(11).blackjack).toBeCloseTo(4 / 13, 12);
    expect(dealerOutcome(10).blackjack).toBeCloseTo(1 / 13, 12);
  });
});

describe('the value of each play', () => {
  it('prices standing and doubling exactly as the engine plays them', () => {
    expect(evNoDealerBj(['9', 'K', '7'], (r) => act(r, 'stand'))).toBeCloseTo(upcard(10).stand(16), 12);
    expect(evNoDealerBj(['6', '6', '5'], (r) => act(r, 'double'))).toBeCloseTo(upcard(6).double({ total: 11, soft: false }), 12);
    // Under an ace the dealer has already checked: conditional on no blackjack.
    expect(evNoDealerBj(['K', 'A', '9'], (r) => act(r, 'stand'))).toBeCloseTo(upcard(11).stand(19), 12);
  });

  it('prices hitting a hard 12 exactly (then the best of hit / stand)', () => {
    expect(evNoDealerBj(['K', '4', '2'], (r) => hitOrStandBest(act(r, 'hit')))).toBeCloseTo(upcard(4).hit({ total: 12, soft: false }), 12);
  });

  it('prices hitting a soft 18 exactly (then the best of hit / stand)', () => {
    expect(evNoDealerBj(['A', '9', '7'], (r) => hitOrStandBest(act(r, 'hit')))).toBeCloseTo(upcard(9).hit({ total: 18, soft: true }), 12);
  });

  it('prices split aces (one card each) exactly', () => {
    expect(evNoDealerBj(['A', '7', 'A'], (r) => act(r, 'split'))).toBeCloseTo(upcard(7).split(11), 12);
  });

  it('prices splits with resplits and doubles (statistically, through the engine)', () => {
    let s = 5;
    const rng = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const randomRank = () => RANKS[Math.floor(rng() * 13)];
    const a = upcard(6);
    const best: Decider = (hand, _up, legal) => {
      const v = handValue(hand.cards);
      const opts: [string, number][] = [
        ['stand', a.stand(v.total)],
        ['hit', a.hit(v)],
      ];
      if (legal.double) opts.push(['double', a.double(v)]);
      if (legal.split && cardValue(hand.cards[0]) === 8) opts.push(['split', Infinity]);
      return opts.sort((x, y) => y[1] - x[1])[0][0] as 'hit';
    };
    const rounds = 60_000;
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < rounds; i++) {
      const ranks: Rank[] = ['8', '6', '8'];
      for (let k = 0; k < 40; k++) ranks.push(randomRank());
      let round = startRound(shoeOf(ranks), 1);
      while (round.phase === 'player') round = act(round, best(round.hands[round.active], round.dealer[0], legalFor(round), round));
      sum += round.result!.net;
      sumSq += round.result!.net ** 2;
    }
    const mean = sum / rounds;
    const se = Math.sqrt((sumSq / rounds - mean * mean) / rounds);
    expect(Math.abs(mean - a.split(8))).toBeLessThan(4 * se);
  });
});

function legalFor(round: Round) {
  const hand = round.hands[round.active];
  const two = hand.cards.length === 2;
  return { hit: true, stand: true, double: two, split: two && cardValue(hand.cards[0]) === cardValue(hand.cards[1]) && round.hands.length < 4 && !hand.splitAce };
}

describe('the whole game', () => {
  it('has a 0.51% house edge under these rules, and each rule moves it the known way', () => {
    const table = gameValue();
    expect(table.houseEdge).toBeCloseTo(0.005117, 5);
    expect(table.playerBlackjack).toBeCloseTo(2 * (1 / 13) * (4 / 13), 12);
    const delta = (rules: Partial<typeof TABLE_RULES>) => gameValue({ ...TABLE_RULES, ...rules }).houseEdge - table.houseEdge;
    // 6:5 only changes what an unmatched natural pays: 0.3 × P(you have one and the dealer doesn't).
    expect(delta({ blackjackPays: 1.2 })).toBeCloseTo(0.3 * table.playerBlackjack * (1 - table.dealerBlackjack), 12);
    expect(delta({ hitSoft17: true })).toBeGreaterThan(0.0015);
    expect(delta({ hitSoft17: true })).toBeLessThan(0.0030);
    expect(delta({ doubleAfterSplit: false })).toBeGreaterThan(0.001);
    expect(delta({ surrender: true })).toBeLessThan(0);
    expect(delta({ maxHands: 2 })).toBeGreaterThan(0);
  });

  it('agrees with rounds dealt from an infinite deck through the engine (statistically)', () => {
    let s = 11;
    const rng = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const cards: Card[] = [];
    for (let i = 0; i < 2_000_000; i++) cards.push({ rank: RANKS[Math.floor(rng() * 13)], suit: '♠' });
    let shoe: Shoe = { decks: 1, cards, next: 0, cutIndex: 1e9 };
    const best: Decider = (hand, up, legal) => {
      const a = upcard(cardValue(up) as Value);
      const v = handValue(hand.cards);
      const opts: [string, number][] = [
        ['stand', a.stand(v.total)],
        ['hit', a.hit(v)],
      ];
      if (legal.double) opts.push(['double', a.double(v)]);
      if (legal.split) opts.push(['split', a.split(cardValue(hand.cards[0]) as Value)]);
      return opts.sort((x, y) => y[1] - x[1])[0][0] as 'hit';
    };
    const rounds = 250_000;
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < rounds; i++) {
      const r = playRound(shoe, 1, best, rng);
      shoe = r.shoe;
      sum += r.result!.net;
      sumSq += r.result!.net ** 2;
    }
    const mean = sum / rounds;
    const se = Math.sqrt((sumSq / rounds - mean * mean) / rounds);
    expect(Math.abs(mean - gameValue().ev)).toBeLessThan(4 * se);
  });
});

describe('strategies', () => {
  it('prices simple strategies exactly', () => {
    expect(-policyValue((h) => h.total < 17)).toBeCloseTo(0.05675, 4);
    expect(-policyValue((h) => h.total <= 11 || (h.soft && h.total < 18))).toBeCloseTo(0.06079, 4);
  });

  it('derives the six-deck chart except for two close soft doubles', () => {
    const chart = optimalChart();
    const diffs: string[] = [];
    for (const [t, row] of Object.entries(chart.hard)) row.forEach((cell, i) => cell.best !== HARD_CHART[Number(t)][i] && diffs.push(`hard ${t} vs ${VALUES[i]}`));
    for (const [t, row] of Object.entries(chart.soft)) row.forEach((cell, i) => cell.best !== SOFT_CHART[Number(t)][i] && diffs.push(`soft ${t} vs ${VALUES[i]}`));
    for (const [v, row] of Object.entries(chart.pairs)) row.forEach((cell, i) => cell.best !== PAIR_CHART[Number(v)][i] && diffs.push(`pair ${v} vs ${VALUES[i]}`));
    expect(diffs).toEqual(['soft 13 vs 5', 'soft 15 vs 4']);
    // …and both are within a cent per unit.
    for (const [t, up] of [[13, 5], [15, 4]] as const) {
      const evs = upcard(up).twoCard(addValue({ total: 11, soft: true }, (t - 11) as Value));
      expect(Math.abs(evs.hit! - evs.double!)).toBeLessThan(0.01);
    }
  });
});
