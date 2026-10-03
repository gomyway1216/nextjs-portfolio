import { describe, expect, it } from 'vitest';

import {
  DEALER_HANDS,
  EV_FOLD,
  HAND_COUNT,
  TOTAL_COMBINATIONS,
  handCounts,
  handIndex,
  handOdds,
  highCardCurve,
  orbitCards,
  orbits,
  pairPlusOdds,
  playsOptimally,
  policyOdds,
  qualifyingHands,
  ranksOdds,
  scoreOdds,
  scoreRanksOf,
  strategyOdds,
} from '@/components/game/ThreeCardPoker/analysis';
import {
  CATEGORIES,
  PAIR_PLUS_PAYS,
  PAIR_PLUS_PAYS_OLD,
  PLAY_THRESHOLD_SCORE,
  QUALIFY_SCORE,
  STRATEGY_PLAYS,
  cardAt,
  cardIndex,
  evaluate,
  settle,
  type Card,
  type Category,
  type Rank,
} from '@/components/game/ThreeCardPoker/engine';

const SUIT_OF = { s: '♠', h: '♥', d: '♦', c: '♣' } as const;
const hand = (text: string): Card[] =>
  text.split(' ').map((c) => ({ rank: c[0] as Rank, suit: SUIT_OF[c[1] as keyof typeof SUIT_OF] }));

describe('the enumeration itself', () => {
  it('plays all 407,170,400 combinations in well under a second', () => {
    // First call in this file: nothing is cached yet.
    const start = performance.now();
    const all = orbits();
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(1000);
    expect(HAND_COUNT).toBe((52 * 51 * 50) / 6);
    expect(DEALER_HANDS).toBe((49 * 48 * 47) / 6);
    expect(TOTAL_COMBINATIONS).toBe(407_170_400);
    // One representative per suit-symmetry class, weighted by the size of its class.
    expect(all).toHaveLength(1755);
    expect(all.reduce((sum, o) => sum + o.weight, 0)).toBe(HAND_COUNT);
    const sizes = new Map<number, number>();
    for (const o of all) sizes.set(o.weight, (sizes.get(o.weight) ?? 0) + 1);
    expect(Object.fromEntries(sizes)).toEqual({ 4: 299, 12: 1170, 24: 286 });
    // Every representative met every dealer hand exactly once.
    expect(all.every((o) => o.notQualified + o.win + o.tie + o.lose === DEALER_HANDS)).toBe(true);
    expect(all.reduce((sum, o) => sum + o.weight * (o.notQualified + o.win + o.tie + o.lose), 0)).toBe(TOTAL_COMBINATIONS);
  });

  it('indexes the 22,100 hands without gaps', () => {
    expect(handIndex(0, 1, 2)).toBe(0);
    expect(handIndex(49, 50, 51)).toBe(HAND_COUNT - 1);
    const seen = new Uint8Array(HAND_COUNT);
    for (let c2 = 2; c2 < 52; c2++) for (let c1 = 1; c1 < c2; c1++) for (let c0 = 0; c0 < c1; c0++) seen[handIndex(c0, c1, c2)]++;
    expect(seen.every((n) => n === 1)).toBe(true);
  });

  it('picks a representative whose suit relabelings cover its whole class', () => {
    // A class of n hands has n distinct images of its representative under the 24 suit permutations.
    const perms: number[][] = [];
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) for (let c = 0; c < 4; c++) for (let d = 0; d < 4; d++) {
      if (new Set([a, b, c, d]).size === 4) perms.push([a, b, c, d]);
    }
    expect(perms).toHaveLength(24);
    const mismatched = orbits().filter((o) => {
      const cards = orbitCards(o);
      const images = new Set(perms.map((p) => cards.map((c) => (c & ~3) | p[c & 3]).sort((x, y) => x - y).join(',')));
      return images.size !== o.weight;
    });
    expect(mismatched).toEqual([]);
  });
});

describe('hand frequencies', () => {
  it('counts every category exactly', () => {
    expect(handCounts()).toEqual({
      straightFlush: 48,
      threeOfAKind: 52,
      straight: 720,
      flush: 1096,
      pair: 3744,
      highCard: 16440,
    });
    expect(CATEGORIES.reduce((sum, c) => sum + handCounts()[c], 0)).toBe(22_100);
  });

  it('agrees with the engine’s own ranking of all 22,100 hands', () => {
    const tally = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;
    let qualifying = 0;
    for (let c2 = 2; c2 < 52; c2++) {
      for (let c1 = 1; c1 < c2; c1++) {
        for (let c0 = 0; c0 < c1; c0++) {
          const value = evaluate([cardAt(c0), cardAt(c1), cardAt(c2)]);
          tally[value.category]++;
          if (value.score >= QUALIFY_SCORE) qualifying++;
        }
      }
    }
    expect(tally).toEqual(handCounts());
    expect(qualifying).toBe(qualifyingHands());
  });

  it('has the dealer qualify 69.59% of the time', () => {
    expect(qualifyingHands()).toBe(15_380);
    expect(((qualifyingHands() / HAND_COUNT) * 100).toFixed(2)).toBe('69.59');
  });
});

describe('Pair Plus', () => {
  it('has a 7.28% house edge at 1-3-6-30-40', () => {
    const odds = pairPlusOdds(PAIR_PLUS_PAYS);
    expect(odds.net).toBe(-1608);
    expect(odds.ev).toBe(-1608 / 22_100);
    expect((-odds.ev * 100).toFixed(2)).toBe('7.28');
    expect(odds.win).toBe(5660 / 22_100);
    expect(odds.rows.reduce((sum, r) => sum + r.contribution, 0)).toBeCloseTo(odds.ev, 12);
    expect(pairPlusOdds()).toEqual(odds);
  });

  it('has a 2.32% house edge at the old 1-4-6-30-40', () => {
    const odds = pairPlusOdds(PAIR_PLUS_PAYS_OLD);
    expect(odds.net).toBe(-512);
    expect((-odds.ev * 100).toFixed(2)).toBe('2.32');
    expect(odds.rows.find((r) => r.category === 'flush')).toMatchObject({ count: 1096, pays: 4 });
  });
});

describe('Ante & Play', () => {
  it('reproduces the published optimal-strategy numbers', () => {
    const o = strategyOdds('optimal');
    expect(o.fold + o.notQualified + o.win + o.tie + o.lose).toBe(TOTAL_COMBINATIONS);
    expect(o).toMatchObject({
      played: 14_900,
      fold: 132_652_800,
      notQualified: 85_493_652,
      win: 97_354_684,
      tie: 267_648,
      lose: 91_401_616,
      net: -13_733_780,
    });
    expect(o.ev).toBe(-13_733_780 / 407_170_400);
    // House edge 3.37% of the Ante, element of risk 2.01%, 67.42% of hands played.
    expect((o.houseEdge * 100).toFixed(2)).toBe('3.37');
    expect(o.houseEdge).toBeCloseTo(0.03373, 5);
    expect((o.elementOfRisk * 100).toFixed(2)).toBe('2.01');
    expect(o.elementOfRisk).toBeCloseTo(0.020147, 6);
    expect((o.playRate * 100).toFixed(2)).toBe('67.42');
    expect(o.averageWager).toBeCloseTo(1.674208, 6);
    // The books: ±1 and ±2 antes per outcome plus the bonus add up to the net.
    const bonus = CATEGORIES.reduce((sum, c) => sum + o.bonus[c], 0);
    expect(-o.fold + o.notQualified + 2 * o.win - 2 * o.lose + bonus).toBe(o.net);
  });

  it('pays the Ante Bonus on every straight or better', () => {
    const o = strategyOdds('optimal');
    expect(o.bonus).toEqual({
      highCard: 0,
      pair: 0,
      flush: 0,
      straight: 720 * DEALER_HANDS,
      threeOfAKind: 52 * 4 * DEALER_HANDS,
      straightFlush: 48 * 5 * DEALER_HANDS,
    });
    const total = CATEGORIES.reduce((sum, c) => sum + o.bonus[c], 0) / TOTAL_COMBINATIONS;
    expect(total).toBeCloseTo(1168 / 22_100, 12);
    expect(((o.houseEdge + total) * 100).toFixed(2)).toBe('8.66');
  });

  it('prices always playing and playing like the dealer', () => {
    const always = strategyOdds('always');
    expect(always).toMatchObject({ played: 22_100, fold: 0, net: -31_163_984, playRate: 1, averageWager: 2 });
    expect((always.houseEdge * 100).toFixed(2)).toBe('7.65');
    expect((always.elementOfRisk * 100).toFixed(2)).toBe('3.83');
    const mimic = strategyOdds('mimic');
    expect(mimic).toMatchObject({ played: 15_380, net: -14_043_800 });
    expect((mimic.houseEdge * 100).toFixed(2)).toBe('3.45');
    // A showdown between two qualifying hands is symmetric: the mimic wins as often as it loses.
    expect(mimic.win).toBe(mimic.lose);
    // Nothing beats the hand-by-hand optimum.
    const best = strategyOdds('optimal');
    expect(best.net).toBeGreaterThan(mimic.net);
    expect(mimic.net).toBeGreaterThan(always.net);
    expect(policyOdds(() => false)).toMatchObject({ played: 0, net: -TOTAL_COMBINATIONS, ev: -1, averageWager: 1 });
  });
});

describe('the Q-6-4 threshold', () => {
  it('is exactly the optimal strategy', () => {
    // The hand-by-hand optimum plays precisely the hands that are Q-6-4 or better …
    const disagreements = orbits().filter((o) => playsOptimally(o) !== STRATEGY_PLAYS.optimal(o.score));
    expect(disagreements).toEqual([]);
    expect(policyOdds((o) => STRATEGY_PLAYS.optimal(o.score))).toEqual(strategyOdds('optimal'));
    // … and no hand is a toss-up.
    expect(orbits().filter((o) => o.playNet === EV_FOLD * DEALER_HANDS)).toEqual([]);
  });

  it('puts Q-6-4 just above folding and Q-6-3 just below', () => {
    const q64 = ranksOdds(['Q', '6', '4']);
    const q63 = ranksOdds(['Q', '6', '3']);
    expect(q64.score).toBe(PLAY_THRESHOLD_SCORE);
    expect(q64.hands).toBe(60);
    expect(q63.hands).toBe(60);
    // Whatever the suits: the worst Q-6-4 still beats −1 and the best Q-6-3 doesn't.
    expect(q64.evMin).toBeGreaterThan(EV_FOLD);
    expect(q63.evMax).toBeLessThan(EV_FOLD);
    expect(q64.evPlay).toBeCloseTo(-0.993888, 6);
    expect(q63.evPlay).toBeCloseTo(-1.00305, 6);
    expect(q64.notQualified + q64.win + q64.tie + q64.lose).toBe(60 * DEALER_HANDS);
    expect(() => scoreOdds(1)).toThrow(/no hand/);
  });

  it('gives the table the exact value of the hand in front of the player', () => {
    const q64 = handOdds(hand('Qs 6h 4d'));
    expect(q64).toEqual({
      notQualified: 5758,
      win: 305,
      tie: 26,
      lose: 12335,
      bonus: 0,
      playNet: -18302,
      evPlay: -18302 / 18424,
      evFold: -1,
      best: 'play',
    });
    const q63 = handOdds(hand('Qs 6h 3d'));
    expect(q63.evPlay).toBeLessThan(-1);
    expect(q63.best).toBe('fold');
    // A hand below Queen-high only wins when the dealer fails to qualify.
    const low = handOdds(hand('Js Th 8d'));
    expect(low).toMatchObject({ win: 0, tie: 0, best: 'fold' });
    expect(low.playNet).toBe(low.notQualified - 2 * low.lose);
    // The Ante Bonus is part of the value of playing.
    const trips = handOdds(hand('9s 9h 9d'));
    expect(trips.bonus).toBe(4);
    expect(trips.playNet).toBe(trips.notQualified + 2 * trips.win - 2 * trips.lose + 4 * DEALER_HANDS);
    expect(trips.evPlay).toBeGreaterThan(5);
    // Suits can be relabeled and cards reordered without changing anything.
    expect(handOdds(hand('4c Qd 6s'))).toEqual(q64);
    expect(() => handOdds(hand('Qs 6h'))).toThrow(/three cards/);
    expect(() => handOdds(hand('Qs Qs 4d'))).toThrow(/different/);
  });

  it('draws the curve that crosses −1 at Q-6-4', () => {
    const curve = highCardCurve();
    // 274 = the C(13,3) rank sets minus the 12 straights.
    expect(curve).toHaveLength(274);
    expect(curve.every((p, i) => i === 0 || p.score > curve[i - 1].score)).toBe(true);
    expect(scoreRanksOf(curve[0].score)).toEqual([5, 3, 2]);
    expect(scoreRanksOf(curve[273].score)).toEqual([14, 13, 11]);
    const cut = curve.findIndex((p) => p.score >= PLAY_THRESHOLD_SCORE);
    expect(scoreRanksOf(curve[cut].score)).toEqual([12, 6, 4]);
    expect(scoreRanksOf(curve[cut - 1].score)).toEqual([12, 6, 3]);
    expect(curve.slice(0, cut).every((p) => p.evPlay < EV_FOLD)).toBe(true);
    expect(curve.slice(cut).every((p) => p.evPlay > EV_FOLD)).toBe(true);
  });
});

describe('engine vs analysis', () => {
  /**
   * Settles the real engine against every one of the 18,424 dealer hands and
   * tallies what happened — an independent check of the enumeration, the
   * qualifying rule, the tie-breaks and the Ante Bonus.
   */
  function bruteForce(player: Card[]) {
    const taken = new Set(player.map(cardIndex));
    const rest: Card[] = [];
    for (let i = 0; i < 52; i++) if (!taken.has(i)) rest.push(cardAt(i));
    const tally = { dealerHands: 0, notQualified: 0, win: 0, tie: 0, lose: 0, playNet: 0, foldNet: 0 };
    const bets = { ante: 1, pairPlus: 0 };
    for (let a = 0; a < rest.length; a++) {
      for (let b = a + 1; b < rest.length; b++) {
        for (let c = b + 1; c < rest.length; c++) {
          const dealer = [rest[a], rest[b], rest[c]];
          const played = settle(bets, 'play', player, dealer);
          tally.dealerHands++;
          tally[played.showdown as 'notQualified' | 'win' | 'tie' | 'lose']++;
          tally.playNet += played.net;
          tally.foldNet += settle(bets, 'fold', player, dealer).net;
        }
      }
    }
    return tally;
  }

  it.each([
    ['Qs 6h 4d'], // the threshold hand
    ['Qs 6h 3d'], // the best fold
    ['Js Th 8d'], // can never beat a dealer who qualifies
    ['5s 3h 2d'], // the worst hand in the game
    ['As Ks Js'], // flush
    ['7s 7h 2d'], // pair
    ['Ks Qh Jd'], // straight (Ante Bonus 1)
    ['9s 9h 9d'], // three of a kind (Ante Bonus 4)
    ['Ah 2h 3h'], // the lowest straight flush (Ante Bonus 5)
  ])('agrees exactly on %s', (text) => {
    const player = hand(text);
    const brute = bruteForce(player);
    const odds = handOdds(player);
    expect({
      dealerHands: DEALER_HANDS,
      notQualified: odds.notQualified,
      win: odds.win,
      tie: odds.tie,
      lose: odds.lose,
      playNet: odds.playNet,
      foldNet: EV_FOLD * DEALER_HANDS,
    }).toEqual(brute);
    // The whole-game enumeration used the same numbers for this hand's symmetry class.
    const score = evaluate(player).score;
    const sameClass = orbits().filter(
      (o) => o.score === score && o.notQualified === odds.notQualified && o.win === odds.win && o.tie === odds.tie && o.lose === odds.lose,
    );
    expect(sameClass.length).toBeGreaterThan(0);
  });
});
