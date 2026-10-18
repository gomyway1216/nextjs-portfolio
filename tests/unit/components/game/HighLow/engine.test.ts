import { describe, expect, it } from 'vitest';

import {
  BETS,
  BET_MOST,
  DECK,
  LADDER,
  RANKS,
  RULE_OF_THUMB_ENDS,
  TOP,
  TOP_MULTIPLE,
  UNIT,
  analyzeLadder,
  checkGames,
  drawCard,
  endingsUnder,
  guessRight,
  isBet,
  likelier,
  nearTheEnds,
  payFor,
  rankOf,
  ranksFor,
  returnUnder,
  seeded,
  suitOf,
  takeAfter,
  valueOf,
  type Fraction,
  type Guess,
  type Move,
  type Policy,
} from '@/components/game/HighLow/engine';

// The High & Low Ladder's rules and its exact odds. The figures pinned here are the machine's published ones (the
// Odds tab, the floor's rules): any change to the ladder, the bets or the tie rule has to change them here too.

const ratio = (f: Fraction): string => `${f.num}/${f.den}`;
const sum = (fs: Fraction[]): Fraction => fs.reduce((a, b) => ({ num: a.num * b.den + b.num * a.den, den: a.den * b.den }), { num: BigInt(0), den: BigInt(1) });
const same = (a: Fraction, b: Fraction): boolean => a.num * b.den === b.num * a.den;

/**
 * Best play worked out a second way: plain numbers, every state's value the larger of taking and the better guess,
 * with the chances of the next card counted card by card over the 52 (not rank by rank).
 */
function bestByCards(): { value: number; moves: Move[][] } {
  const value: number[][] = Array.from({ length: TOP + 1 }, () => new Array<number>(DECK).fill(0));
  const moves: Move[][] = Array.from({ length: TOP }, () => new Array<Move>(RANKS).fill('high'));
  for (let card = 0; card < DECK; card++) value[TOP][card] = LADDER[TOP - 1] / UNIT;
  for (let rung = TOP - 1; rung >= 0; rung--) {
    for (let card = 0; card < DECK; card++) {
      let high = 0;
      let low = 0;
      for (let next = 0; next < DECK; next++) {
        if (guessRight(card, next, 'high')) high += value[rung + 1][next] / DECK;
        if (guessRight(card, next, 'low')) low += value[rung + 1][next] / DECK;
      }
      const take = rung === 0 ? -1 : LADDER[rung - 1] / UNIT;
      const go = Math.max(high, low);
      value[rung][card] = Math.max(take, go);
      moves[rung][rankOf(card)] = take >= go - 1e-12 ? 'take' : high >= low - 1e-12 ? 'high' : 'low';
    }
  }
  return { value: value[0].reduce((a, b) => a + b, 0) / DECK, moves };
}

describe('the rules', () => {
  it('draws any of the 52 cards from a fresh deck, each as likely: one random number, cut into 52 equal parts', () => {
    const seen = new Array<number>(DECK).fill(0);
    for (let i = 0; i < DECK * 10; i++) seen[drawCard(() => (i % DECK) / DECK + 1e-9)] += 1;
    expect(seen.every((n) => n === 10)).toBe(true);
    expect(drawCard(() => 0)).toBe(0);
    expect(drawCard(() => 0.999_999_999)).toBe(51);
    // A card's rank and suit: four of each rank, aces high.
    expect(rankOf(0)).toBe(0);
    expect(rankOf(51)).toBe(12);
    expect(suitOf(5)).toBe(1);
    for (let rank = 0; rank < RANKS; rank++) expect(Array.from({ length: DECK }, (_, c) => c).filter((c) => rankOf(c) === rank)).toHaveLength(4);
  });

  it('a guess is right on a strictly higher or lower rank; the same rank loses either way, whatever the suit', () => {
    const seven = 5 * 4; // the 7 of spades
    const eight = 6 * 4 + 1;
    const anotherSeven = 5 * 4 + 3;
    expect(guessRight(seven, eight, 'high')).toBe(true);
    expect(guessRight(seven, eight, 'low')).toBe(false);
    expect(guessRight(eight, seven, 'low')).toBe(true);
    expect(guessRight(seven, anotherSeven, 'high')).toBe(false);
    expect(guessRight(seven, anotherSeven, 'low')).toBe(false);
    for (let rank = 0; rank < RANKS; rank++) {
      const { high, low, tie } = ranksFor(rank);
      expect(high + low + tie).toBe(RANKS);
      expect(tie).toBe(1);
      // Counted over the 52 cards: four of each winning rank.
      const shown = rank * 4;
      for (const side of ['high', 'low'] as Guess[]) expect(Array.from({ length: DECK }, (_, c) => c).filter((c) => guessRight(shown, c, side))).toHaveLength(4 * (side === 'high' ? high : low));
    }
    // The likelier side: HIGH from 2 to 8 (an 8 is even), LOW from 9 to A.
    expect(Array.from({ length: RANKS }, (_, r) => likelier(r))).toEqual([...new Array(7).fill('high'), ...new Array(6).fill('low')]);
  });

  it('has a ladder of twelve growing rungs, paid in whole medals on every bet, the bet included', () => {
    expect(TOP).toBe(12);
    expect([...LADDER]).toEqual([6, 8, 10, 12, 15, 20, 28, 40, 55, 80, 120, 200]);
    for (let i = 1; i < TOP; i++) expect(LADDER[i]).toBeGreaterThan(LADDER[i - 1]);
    expect([...BETS]).toEqual([5, 10, 20, 50]);
    expect(BET_MOST).toBe(50);
    expect(TOP_MULTIPLE).toBe(40);
    for (const bet of BETS) {
      expect(isBet(bet)).toBe(true);
      for (let rung = 1; rung <= TOP; rung++) expect(Number.isInteger(payFor(bet, rung))).toBe(true);
      // Every rung pays more than the bet: the first right guess already wins something.
      expect(payFor(bet, 1)).toBeGreaterThan(bet);
    }
    expect(payFor(5, 0)).toBe(0);
    expect(payFor(50, TOP)).toBe(2_000);
    expect(isBet(7)).toBe(false);
  });
});

describe('the exact odds', () => {
  it('best play brings back 89.965% of every medal bet, exactly, and no way of playing brings back more', () => {
    const odds = analyzeLadder();
    expect(ratio(odds.best)).toBe('272481482437688/302875106592253');
    expect(valueOf(odds.best)).toBeCloseTo(0.89964965, 8);
    // About 90%, and never more than 100%: best play is the most any way of playing brings back.
    expect(valueOf(odds.best)).toBeGreaterThan(0.895);
    expect(valueOf(odds.best)).toBeLessThan(0.9);
    // Worked out a second way, over the 52 cards in floating point: the same value, and the same play everywhere.
    const again = bestByCards();
    expect(again.value).toBeCloseTo(valueOf(odds.best), 12);
    expect(again.moves).toEqual(odds.moves);
  });

  it('plays best by taking from the middle cards and going on from the ends, more of them higher up the ladder', () => {
    const { moves } = analyzeLadder();
    const row = (rung: number) => moves[rung].map((m) => (m === 'take' ? 'T' : m === 'high' ? 'H' : 'L')).join('');
    expect(row(0)).toBe('HHHHHHHLLLLLL');
    expect(row(1)).toBe('HHHTTTTTTTLLL');
    expect(row(2)).toBe('HHTTTTTTTTTLL');
    expect(row(3)).toBe('HHTTTTTTTTTLL');
    expect(row(4)).toBe('HHHTTTTTTTLLL');
    expect(row(5)).toBe('HHHHTTTTTLLLL');
    for (let rung = 6; rung < TOP; rung++) expect(row(rung)).toBe('HHHHHTTTLLLLL');
    // Wherever it goes on, it guesses the likelier side.
    for (let rung = 0; rung < TOP; rung++) for (let rank = 0; rank < RANKS; rank++) if (moves[rung][rank] !== 'take') expect(moves[rung][rank]).toBe(likelier(rank));
  });

  it('pins every simple way of playing: taking on each rung, climbing to the top, and the rule of thumb', () => {
    const odds = analyzeLadder();
    expect(odds.takeAfter.map(ratio)).toEqual([
      '144/169',
      '8504/10985',
      '18846/28561',
      '1002696/1856465',
      '2222769/4826809',
      '26279516/62748517',
      '1631172704/4078653605',
      '4132533968/10604499373',
      '50385277976/137858491849',
      '649853534704/1792160394037',
      '664887122064/1792160394037',
      '127739306011240/302875106592253',
    ]);
    // Taking at once on the first rung: 120 of the 169 first two cards win the likelier side, ×1.2.
    expect(same(odds.takeAfter[0], { num: BigInt(120 * 6), den: BigInt(169 * 5) })).toBe(true);
    expect(valueOf(odds.takeAfter[0])).toBeCloseTo(0.852071, 6);
    expect(valueOf(odds.takeAfter[TOP - 1])).toBeCloseTo(0.421756, 6);
    // Climbing every game reaches the top about once in 95 games.
    expect(ratio(odds.climbTop)).toBe('3193482650281/302875106592253');
    expect(1 / valueOf(odds.climbTop)).toBeCloseTo(94.84, 2);
    // The rule of thumb (take from 5 to J) comes within a fifth of a point of best play.
    expect(RULE_OF_THUMB_ENDS).toBe(3);
    expect(ratio(odds.thumb)).toBe('1359581018177624/1514375532961265');
    expect(valueOf(odds.thumb)).toBeCloseTo(0.897783, 6);
    // Every one of them brings back less than best play.
    for (const value of [...odds.takeAfter, odds.thumb]) expect(valueOf(value)).toBeLessThan(valueOf(odds.best));
  });

  it('follows best play to its endings: they add up to every game, and what they pay to its return', () => {
    const { bestEndings, best } = analyzeLadder();
    expect(ratio(bestEndings.lose)).toBe('103162484452725/302875106592253');
    expect(ratio(bestEndings.take[0])).toBe('75/169');
    expect(ratio(bestEndings.take[1])).toBe('388/2197');
    expect(ratio(bestEndings.take[TOP - 1])).toBe('6107190808/302875106592253');
    // About one game in 49,593 reaches the top, played the best way.
    expect(1 / valueOf(bestEndings.take[TOP - 1])).toBeCloseTo(49_593.2, 1);
    const all = sum([bestEndings.lose, ...bestEndings.take]);
    expect(all.num).toBe(all.den);
    const paid = sum(bestEndings.take.map((f, i) => ({ num: f.num * BigInt(LADDER[i]), den: f.den * BigInt(UNIT) })));
    expect(same(paid, best)).toBe(true);
    // Reaching a rung is reaching it and taking it, or going on from it.
    expect(same(bestEndings.reach[0], { num: BigInt(120), den: BigInt(169) })).toBe(true);
  });

  it('no way of playing, out of thousands drawn at random, brings back more than best play', () => {
    const random = seeded(7);
    const { best } = analyzeLadder();
    for (let trial = 0; trial < 300; trial++) {
      const table: Move[][] = Array.from({ length: TOP }, (_, rung) =>
        Array.from({ length: RANKS }, (): Move => {
          const r = random();
          return rung > 0 && r < 0.4 ? 'take' : r < 0.7 ? 'high' : 'low';
        }),
      );
      const policy: Policy = (rung, rank) => table[rung][rank];
      expect(valueOf(returnUnder(policy))).toBeLessThanOrEqual(valueOf(best));
      // Its endings add up to every game too.
      const endings = endingsUnder(policy);
      const all = sum([endings.lose, ...endings.take]);
      expect(all.num).toBe(all.den);
    }
    // Nor does always guessing the unlikelier side, or the rule of thumb with other ends.
    const contrary: Policy = (_, rank) => (likelier(rank) === 'high' ? 'low' : 'high');
    expect(valueOf(returnUnder(contrary))).toBeLessThan(0.01);
    for (let ends = 1; ends <= 6; ends++) expect(valueOf(returnUnder(nearTheEnds(ends)))).toBeLessThanOrEqual(valueOf(best));
    expect(valueOf(returnUnder(takeAfter(1)))).toBeCloseTo(0.852071, 6);
  });

  it('is borne out by play: 100,000 games played the best way come back near 90%', () => {
    const odds = analyzeLadder();
    const result = checkGames(100_000, seeded(2026));
    // One game's return spreads with σ ≈ 0.85; over 100,000 games the mean is within about ±0.8 points (3σ).
    expect(Math.abs(result.back - valueOf(odds.best))).toBeLessThan(0.008);
    expect(Math.abs(result.lost / result.games - valueOf(odds.bestEndings.lose))).toBeLessThan(0.006);
  });
});
