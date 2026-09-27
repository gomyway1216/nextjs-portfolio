import { describe, expect, it } from 'vitest';

import {
  PAY_RULES,
  PHYSICAL_STOPS,
  REELS,
  TOTAL_WAYS,
  VIRTUAL_STOPS,
  analyzeMachine,
  analyzeNearMisses,
  createPayoutSampler,
  evaluateLine,
  isJackpotNearMiss,
  logCheckpoints,
  paylineOf,
  resolveSpin,
  simulateConvergence,
  simulateSessions,
  spinReels,
  symbolAt,
  virtualMap,
  winningReels,
  type Line,
  type PayRuleId,
  type Stops,
} from '@/components/game/SlotMachine/engine';

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

const ruleOf = (line: Line) => evaluateLine(line)?.id ?? null;

describe('reel strips', () => {
  it('has three 22-stop reels whose virtual weights sum to 64', () => {
    expect(REELS).toHaveLength(3);
    for (const reel of REELS) {
      expect(reel).toHaveLength(PHYSICAL_STOPS);
      expect(reel.reduce((sum, stop) => sum + stop.weight, 0)).toBe(VIRTUAL_STOPS);
      expect(reel.every((stop) => Number.isInteger(stop.weight) && stop.weight >= 1)).toBe(true);
      // Symbols alternate with blanks, like a mechanical reel.
      reel.forEach((stop, i) => expect(stop.symbol === 'blank').toBe(i % 2 === 1));
    }
  });

  it('gives each 7 one virtual stop, flanked by blanks of weight 6 (the copy on the odds tab relies on this)', () => {
    for (const reel of REELS) {
      const sevens = reel.flatMap((stop, i) => (stop.symbol === 'seven' ? [i] : []));
      expect(sevens).toHaveLength(1);
      const [i] = sevens;
      expect(reel[i].weight).toBe(1);
      expect(reel[(i + 1) % PHYSICAL_STOPS]).toEqual({ symbol: 'blank', weight: 6 });
      expect(reel[(i - 1 + PHYSICAL_STOPS) % PHYSICAL_STOPS]).toEqual({ symbol: 'blank', weight: 6 });
    }
  });

  it('maps every virtual stop to a physical stop in proportion to its weight', () => {
    REELS.forEach((reel) => {
      const map = virtualMap(reel);
      expect(map).toHaveLength(VIRTUAL_STOPS);
      reel.forEach((stop, i) => expect(map.filter((p) => p === i)).toHaveLength(stop.weight));
    });
    expect(() => virtualMap([{ symbol: 'blank', weight: 3 }])).toThrow(/sum to 64/);
  });
});

describe('evaluateLine', () => {
  const cases: [Line, PayRuleId | null][] = [
    [['seven', 'seven', 'seven'], 'seven3'],
    [['bar', 'bar', 'bar'], 'bar3'],
    [['bell', 'bell', 'bell'], 'bell3'],
    [['plum', 'plum', 'plum'], 'plum3'],
    [['cherry', 'cherry', 'cherry'], 'cherry3'],
    [['cherry', 'cherry', 'seven'], 'cherry2'],
    [['cherry', 'blank', 'cherry'], 'cherry1'],
    [['cherry', 'bar', 'bar'], 'cherry1'],
    // Cherries only count from the left reel.
    [['blank', 'cherry', 'cherry'], null],
    [['seven', 'seven', 'bar'], null],
    [['seven', 'seven', 'blank'], null],
    [['blank', 'blank', 'blank'], null],
  ];
  it.each(cases)('%j → %s', (line, expected) => {
    expect(ruleOf(line)).toBe(expected);
  });

  it('pays the stake times the rule', () => {
    const cherryStop = REELS[0].findIndex((s) => s.symbol === 'cherry');
    const blankStop = REELS[1].findIndex((s) => s.symbol === 'blank');
    const spin = resolveSpin([cherryStop, blankStop, blankStop], 5);
    expect(spin.line[0]).toBe('cherry');
    expect(spin.rule?.id).toBe('cherry1');
    expect(spin.win).toBe(10);
    expect(spin.bet).toBe(5);
  });

  it('knows which reels form the win', () => {
    expect(winningReels(PAY_RULES.find((r) => r.id === 'seven3')!)).toEqual([0, 1, 2]);
    expect(winningReels(PAY_RULES.find((r) => r.id === 'cherry2')!)).toEqual([0, 1]);
    expect(winningReels(PAY_RULES.find((r) => r.id === 'cherry1')!)).toEqual([0]);
    expect(winningReels(null)).toEqual([]);
  });
});

describe('analyzeMachine (exact odds)', () => {
  const odds = analyzeMachine();

  it('matches brute force over all 262,144 virtual-stop combinations', () => {
    const maps = REELS.map(virtualMap);
    const ways = new Map<string, number>();
    let totalReturn = 0;
    let sumSquares = 0;
    for (let a = 0; a < VIRTUAL_STOPS; a++) {
      for (let b = 0; b < VIRTUAL_STOPS; b++) {
        for (let c = 0; c < VIRTUAL_STOPS; c++) {
          const rule = evaluateLine(paylineOf([maps[0][a], maps[1][b], maps[2][c]]));
          if (!rule) continue;
          ways.set(rule.id, (ways.get(rule.id) ?? 0) + 1);
          totalReturn += rule.pays;
          sumSquares += rule.pays * rule.pays;
        }
      }
    }
    expect(odds.totalWays).toBe(TOTAL_WAYS);
    for (const r of odds.rules) expect(r.ways).toBe(ways.get(r.rule.id) ?? 0);
    expect(odds.totalReturn).toBe(totalReturn);
    expect(odds.variance).toBeCloseTo(sumSquares / TOTAL_WAYS - (totalReturn / TOTAL_WAYS) ** 2, 10);
  });

  it('pins the published numbers', () => {
    expect(odds.totalReturn).toBe(249_724);
    expect(odds.rtp).toBeCloseTo(0.952621, 6);
    expect(odds.houseEdge).toBeCloseTo(1 - odds.rtp, 12);
    expect(odds.winningWays).toBe(52_159);
    expect(odds.hitFrequency).toBeCloseTo(52_159 / TOTAL_WAYS, 12);
    expect(odds.rules.find((r) => r.rule.id === 'seven3')?.ways).toBe(1);
    expect(odds.stdDev).toBeCloseTo(5.8047, 3);
    expect(odds.spinsForOnePercent).toBe(Math.ceil(((1.96 * odds.stdDev) / 0.01) ** 2));
  });

  it('adds up: contributions sum to the RTP and probabilities to the hit frequency', () => {
    const rtp = odds.rules.reduce((s, r) => s + r.rtpContribution, 0);
    const hit = odds.rules.reduce((s, r) => s + r.probability, 0);
    expect(rtp).toBeCloseTo(odds.rtp, 12);
    expect(hit).toBeCloseTo(odds.hitFrequency, 12);
  });
});

describe('near misses', () => {
  const near = analyzeNearMisses();

  it('shows a 7 just off the line 12× as often as on it', () => {
    expect(near.sevenOnLine).toEqual([1 / 64, 1 / 64, 1 / 64]);
    expect(near.sevenBesideLine).toEqual([12 / 64, 12 / 64, 12 / 64]);
    expect(near.jackpot).toBe(1 / TOTAL_WAYS);
    expect(near.jackpotNearMiss / near.jackpot).toBeCloseTo(12, 12);
  });

  it('would only be 2× without virtual reels', () => {
    expect(near.uniformJackpot).toBeCloseTo(1 / 22 ** 3, 15);
    expect(near.uniformJackpotNearMiss / near.uniformJackpot).toBeCloseTo(2, 12);
  });

  it('detects the 7-7-almost-7 near miss on actual stops', () => {
    const seven = (r: number) => REELS[r].findIndex((s) => s.symbol === 'seven');
    const onLine: Stops = [seven(0), seven(1), seven(2)];
    expect(isJackpotNearMiss(onLine)).toBe(false); // that's the jackpot itself
    expect(isJackpotNearMiss([seven(0), seven(1), seven(2) + 1])).toBe(true);
    expect(isJackpotNearMiss([seven(0), seven(1), seven(2) - 1 + PHYSICAL_STOPS])).toBe(true);
    expect(isJackpotNearMiss([seven(0) + 1, seven(1), seven(2) + 1])).toBe(false);
    expect(symbolAt(REELS[2], seven(2) + 1, -1)).toBe('seven');
  });
});

describe('spinning and simulation', () => {
  it('spins land on physical stops with the virtual-reel frequencies', () => {
    const rng = seeded(11);
    const counts = REELS.map(() => new Array<number>(PHYSICAL_STOPS).fill(0));
    const n = 64_000;
    for (let i = 0; i < n; i++) spinReels(rng).forEach((stop, r) => counts[r][stop]++);
    REELS.forEach((reel, r) =>
      reel.forEach((stop, i) => {
        const expected = (n * stop.weight) / VIRTUAL_STOPS;
        expect(Math.abs(counts[r][i] - expected)).toBeLessThan(5 * Math.sqrt(expected));
      }),
    );
  });

  it('the fast sampler agrees with the exact RTP', () => {
    const odds = analyzeMachine();
    const sample = createPayoutSampler();
    const rng = seeded(2024);
    const n = 2_000_000;
    let total = 0;
    for (let i = 0; i < n; i++) total += sample(rng);
    expect(Math.abs(total / n - odds.rtp)).toBeLessThan((4 * odds.stdDev) / Math.sqrt(n));
  });

  it('logCheckpoints is increasing and ends at the requested spins', () => {
    const cps = logCheckpoints(12_345);
    expect(cps[0]).toBeGreaterThanOrEqual(10);
    expect(cps[cps.length - 1]).toBe(12_345);
    for (let i = 1; i < cps.length; i++) expect(cps[i]).toBeGreaterThan(cps[i - 1]);
  });

  it('simulateConvergence reports checkpoints and can be aborted', async () => {
    const points = await simulateConvergence(50_000, {}, seeded(5));
    expect(points).not.toBeNull();
    expect(points![points!.length - 1].spins).toBe(50_000);
    expect(points!.every((p) => p.rtp >= 0)).toBe(true);

    const controller = new AbortController();
    controller.abort();
    expect(await simulateConvergence(400_001, { signal: controller.signal }, seeded(5))).toBeNull();
    await expect(simulateConvergence(0)).rejects.toThrow(/positive integer/);
  });

  it('simulateSessions keeps its books straight', async () => {
    const config = { bankroll: 50, bet: 2, maxSpins: 300 };
    const summary = await simulateSessions(config, 1_000, {}, seeded(9));
    expect(summary).not.toBeNull();
    const s = summary!;
    expect(s.finals).toHaveLength(1_000);
    expect(s.finals.every((f) => f >= 0 && Number.isInteger(f))).toBe(true);
    expect(s.bustRate).toBeCloseTo(s.finals.filter((f) => f < config.bet).length / 1_000, 12);
    expect(s.aheadRate).toBeCloseTo(s.finals.filter((f) => f > config.bankroll).length / 1_000, 12);
    expect(s.meanSpins).toBeGreaterThan(0);
    expect(s.meanSpins).toBeLessThanOrEqual(config.maxSpins);
    // The sample session is a real trajectory: starts at the bankroll, moves in bet-sized steps.
    expect(s.sampleTrajectory[0]).toBe(config.bankroll);
    expect(s.sampleTrajectory[s.sampleTrajectory.length - 1]).toBe(s.finals[0]);

    await expect(simulateSessions({ bankroll: 1, bet: 2, maxSpins: 10 }, 5)).rejects.toThrow();
  });

  it('on average loses the house edge on everything wagered', async () => {
    const odds = analyzeMachine();
    const config = { bankroll: 10_000, bet: 1, maxSpins: 1_000 }; // bankroll never runs out
    const s = (await simulateSessions(config, 4_000, {}, seeded(77)))!;
    const expected = config.bankroll - s.meanSpins * config.bet * odds.houseEdge;
    const standardError = (odds.stdDev * Math.sqrt(config.maxSpins)) / Math.sqrt(4_000);
    expect(Math.abs(s.meanFinal - expected)).toBeLessThan(4 * standardError);
  });
});
