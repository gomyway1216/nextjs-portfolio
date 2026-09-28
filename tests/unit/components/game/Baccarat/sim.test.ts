import { describe, expect, it } from 'vitest';

import { betOdds, exactOdds } from '@/components/game/Baccarat/analysis';
import { RANKS, fullShoeCounts, playRound, type Card, type Rank, type Side } from '@/components/game/Baccarat/engine';
import {
  PATTERN_IDS,
  SIM_BETS,
  createDealer,
  lineProfit,
  logCheckpoints,
  patternChoice,
  simulateCounting,
  simulateLines,
  simulatePatterns,
  theoreticalEdge,
} from '@/components/game/Baccarat/sim';

function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

const play = (...ranks: Rank[]) => {
  const cards: Card[] = ranks.map((rank) => ({ rank, suit: '♠' }));
  let i = 0;
  return playRound(() => cards[i++]);
};

describe('bet lines', () => {
  it('settles one unit on each line with the table rules', () => {
    const dragon = play('6', '4', 'K', 'A', '2'); // banker wins with a three-card 7
    expect(lineProfit('banker', dragon)).toBeCloseTo(0.95, 12);
    expect(lineProfit('bankerEz', dragon)).toBe(0);
    expect(lineProfit('dragon7', dragon)).toBe(40);
    expect(lineProfit('panda8', dragon)).toBe(-1);
    expect(lineProfit('player', dragon)).toBe(-1);
    expect(lineProfit('tie', dragon)).toBe(-1);
    const pairs = play('9', '7', '9', '7');
    expect(lineProfit('pair', pairs)).toBe(11);
    expect(lineProfit('player', pairs)).toBe(1);
  });

  it('knows each line’s exact eight-deck edge', () => {
    expect(theoreticalEdge('banker')).toBeCloseTo(0.010579, 6);
    expect(theoreticalEdge('bankerEz')).toBeCloseTo(0.010183, 6);
    expect(theoreticalEdge('player')).toBeCloseTo(0.012351, 6);
    expect(theoreticalEdge('tie')).toBeCloseTo(0.143596, 6);
    expect(theoreticalEdge('dragon7')).toBeCloseTo(0.0761, 4);
  });

  it('deals shoe after shoe, flagging the first hand of each', () => {
    const dealer = createDealer(seeded(4));
    const firsts: number[] = [];
    for (let i = 0; i < 400; i++) if (dealer.deal().newShoe) firsts.push(i);
    expect(firsts[0]).toBe(0);
    expect(firsts.length).toBeGreaterThanOrEqual(5);
    for (let k = 1; k < firsts.length; k++) {
      const hands = firsts[k] - firsts[k - 1];
      expect(hands).toBeGreaterThan(70);
      expect(hands).toBeLessThan(90);
    }
    expect(logCheckpoints(1_000)[0]).toBe(100);
    expect(logCheckpoints(1_000).at(-1)).toBe(1_000);
  });
});

describe('simulateLines', () => {
  it('converges to every exact edge on shared cards', async () => {
    const res = (await simulateLines(150_000, {}, seeded(7)))!;
    for (const id of SIM_BETS) {
      expect(res[id].points.at(-1)!.hands).toBe(150_000);
      expect(res[id].points.at(-1)!.edge).toBe(res[id].edge);
      expect(Math.abs(res[id].edge - theoreticalEdge(id)), id).toBeLessThan(4.5 * res[id].se);
    }
    // The 40:1 side bet is far noisier than the even-money bets.
    expect(res.dragon7.se).toBeGreaterThan(5 * res.banker.se);
  });

  it('can be aborted and rejects bad input', async () => {
    const controller = new AbortController();
    controller.abort();
    expect(await simulateLines(40_001, { signal: controller.signal })).toBeNull();
    await expect(simulateLines(0)).rejects.toThrow(/positive integer/);
  });
});

describe('road systems', () => {
  const road = (s: string) => s.split('').map((c): Side => (c === 'B' ? 'banker' : 'player'));
  const coin = () => 0.9;

  it('reads the road the way players do', () => {
    expect(patternChoice('follow', road(''), coin)).toBeNull();
    expect(patternChoice('follow', road('PB'), coin)).toBe('banker');
    expect(patternChoice('chop', road('PB'), coin)).toBe('player');
    expect(patternChoice('streak3', road('BB'), coin)).toBeNull();
    expect(patternChoice('streak3', road('PBBB'), coin)).toBe('player');
    expect(patternChoice('streak3', road('BPBB'), coin)).toBeNull();
    expect(patternChoice('coin', road(''), coin)).toBe('player');
    expect(patternChoice('banker', road('PPP'), coin)).toBe('banker');
  });

  it('lands every system on the edge of the bets it made', async () => {
    const res = (await simulatePatterns(120_000, {}, seeded(11)))!;
    const s = res.strategies;
    for (const id of PATTERN_IDS) {
      expect(Math.abs(s[id].edge - s[id].expectedEdge), id).toBeLessThan(4.5 * s[id].se);
    }
    expect(s.banker.bankerBets).toBe(120_000);
    expect(s.player.bankerBets).toBe(0);
    // Follow and chop always pick opposite sides of the same hands.
    expect(s.chop.bets).toBe(s.follow.bets);
    expect(s.follow.bankerBets + s.chop.bankerBets).toBe(s.follow.bets);
    expect(s.follow.bankerBets / s.follow.bets).toBeGreaterThan(0.48);
    expect(s.follow.bankerBets / s.follow.bets).toBeLessThan(0.53);
    expect(s.streak3.bets).toBeLessThan(0.4 * 120_000);
    // One longest-streak figure per complete shoe.
    expect(res.longestStreaks).toHaveLength(res.shoes - 1);
    const mean = res.longestStreaks.reduce((a, b) => a + b, 0) / res.longestStreaks.length;
    expect(mean).toBeGreaterThan(5);
    expect(mean).toBeLessThan(8);
  });
});

describe('simulateCounting', () => {
  it('prices every hand exactly from the unseen cards', async () => {
    const res = (await simulateCounting(2, {}, seeded(3)))!;
    expect(res.shoes).toBe(2);
    const first = res.sampleShoe.banker.length;
    expect(first).toBeGreaterThan(70);
    expect(res.hands).toBeGreaterThan(first);
    for (const id of SIM_BETS) {
      expect(res.sampleShoe[id]).toHaveLength(first);
      const line = res.lines[id];
      expect(line.positive).toBeLessThanOrEqual(res.hands);
      expect(line.gain).toBeGreaterThanOrEqual(0);
      if (line.positive === 0) expect(line.realized).toBe(0);
    }
    // Before the first hand only the exposed burn card has been seen, so the
    // edges are within a hair of the full-shoe ones.
    for (const id of SIM_BETS) {
      expect(Math.abs(res.sampleShoe[id][0] + theoreticalEdge(id)), id).toBeLessThan(0.01);
    }
    // … and exactly the exact odds of that composition: the shoe minus one card.
    const candidates = RANKS.map((_, r) => {
      const counts = fullShoeCounts(8);
      counts[r]--;
      return betOdds('tie', exactOdds(counts)).ev;
    });
    expect(candidates.some((ev) => Math.abs(ev - res.sampleShoe.tie[0]) < 1e-12)).toBe(true);
  });

  it('can be aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    expect(await simulateCounting(3, { signal: controller.signal })).toBeNull();
    await expect(simulateCounting(0)).rejects.toThrow(/positive integer/);
  });
});
