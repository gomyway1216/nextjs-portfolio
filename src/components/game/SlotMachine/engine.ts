/**
 * Classic 3-reel, single-payline slot machine with "virtual reels".
 *
 * Each reel has 22 physical stops (symbols alternating with blanks). Like real
 * machines since the 1980s, the RNG does not pick a physical stop directly: it
 * picks one of 64 virtual stops, and each virtual stop maps to a physical stop.
 * Weighting that map is how a machine sets its odds — the 7 gets a single
 * virtual stop while the blanks right next to it get many, which is why a 7
 * shows up just above or below the payline far more often than on it.
 *
 * Every outcome is one of 64³ = 262,144 equally likely virtual-stop triples, so
 * all odds below are exact (integer "ways" out of 262,144), not estimates.
 */

export type SymbolId = 'seven' | 'bar' | 'bell' | 'plum' | 'cherry' | 'blank';

export const SYMBOL_IDS: readonly SymbolId[] = ['seven', 'bar', 'bell', 'plum', 'cherry', 'blank'];

export const REEL_COUNT = 3;
export const PHYSICAL_STOPS = 22;
export const VIRTUAL_STOPS = 64;
/** Equally likely outcomes of one spin (64³). */
export const TOTAL_WAYS = VIRTUAL_STOPS ** REEL_COUNT;

export interface ReelStop {
  symbol: SymbolId;
  /** How many of the 64 virtual stops map to this physical stop. */
  weight: number;
}

/** One reel's physical strip, top to bottom. */
export type Reel = readonly ReelStop[];

/**
 * Builds a 22-stop strip from 11 symbols (blanks go between them) and the
 * virtual weights of each stop, in strip order.
 */
function strip(symbols: SymbolId[], weights: number[]): Reel {
  const stops: ReelStop[] = [];
  symbols.forEach((symbol, i) => {
    stops.push({ symbol, weight: weights[2 * i] });
    stops.push({ symbol: 'blank', weight: weights[2 * i + 1] });
  });
  return stops;
}

/*
 * Weights, in strip order (symbol, blank below it, next symbol, …); each reel
 * sums to 64. The blank after the last symbol sits just above the 7 (the strip
 * wraps), so every 7 (weight 1) is flanked by two blanks of weight 6: a 7 lands
 * just off the payline 12× as often as on it. Tuned so the RTP is ≈ 95.3%.
 */
export const REELS: readonly Reel[] = [
  strip(
    ['seven', 'cherry', 'plum', 'bar', 'bell', 'cherry', 'plum', 'bar', 'bell', 'cherry', 'plum'],
    [1, 6, 4, 2, 4, 2, 3, 2, 3, 1, 4, 2, 4, 1, 3, 2, 3, 1, 4, 2, 4, 6],
  ),
  strip(
    ['seven', 'bell', 'plum', 'cherry', 'bar', 'bell', 'plum', 'cherry', 'bar', 'bell', 'plum'],
    [1, 6, 3, 2, 4, 1, 5, 2, 3, 1, 3, 2, 4, 1, 5, 2, 3, 1, 3, 2, 4, 6],
  ),
  strip(
    ['seven', 'plum', 'bell', 'bar', 'plum', 'cherry', 'bell', 'plum', 'bar', 'bell', 'plum'],
    [1, 6, 4, 2, 3, 2, 3, 2, 4, 1, 5, 2, 3, 1, 4, 2, 3, 1, 3, 2, 4, 6],
  ),
];

export type PayRuleId = 'seven3' | 'bar3' | 'bell3' | 'plum3' | 'cherry3' | 'cherry2' | 'cherry1';

export interface PayRule {
  id: PayRuleId;
  /** Credits paid per credit bet. */
  pays: number;
  /** Symbols shown in the paytable; 'any' = anything. */
  pattern: readonly (SymbolId | 'any')[];
}

/** Checked top to bottom; a line pays for the first rule it matches only. */
export const PAY_RULES: readonly PayRule[] = [
  { id: 'seven3', pays: 1000, pattern: ['seven', 'seven', 'seven'] },
  { id: 'bar3', pays: 150, pattern: ['bar', 'bar', 'bar'] },
  { id: 'bell3', pays: 50, pattern: ['bell', 'bell', 'bell'] },
  { id: 'plum3', pays: 25, pattern: ['plum', 'plum', 'plum'] },
  { id: 'cherry3', pays: 15, pattern: ['cherry', 'cherry', 'cherry'] },
  { id: 'cherry2', pays: 6, pattern: ['cherry', 'cherry', 'any'] },
  { id: 'cherry1', pays: 2, pattern: ['cherry', 'any', 'any'] },
];

export type Line = readonly [SymbolId, SymbolId, SymbolId];

/** The rule a payline matches, or null for a losing line. */
export function evaluateLine(line: Line, rules: readonly PayRule[] = PAY_RULES): PayRule | null {
  for (const rule of rules) {
    if (rule.pattern.every((p, i) => p === 'any' || p === line[i])) return rule;
  }
  return null;
}

// ---------- Spinning ----------

/** Physical stop index for each virtual stop of a reel. */
export function virtualMap(reel: Reel): number[] {
  const map: number[] = [];
  reel.forEach((stop, index) => {
    for (let k = 0; k < stop.weight; k++) map.push(index);
  });
  if (map.length !== VIRTUAL_STOPS) {
    throw new Error(`reel weights must sum to ${VIRTUAL_STOPS}, got ${map.length}`);
  }
  return map;
}

const VIRTUAL_MAPS = REELS.map(virtualMap);

/** Physical stop (the one on the payline) for each reel. */
export type Stops = readonly [number, number, number];

export function spinReels(rng: () => number = Math.random, reels: readonly Reel[] = REELS): Stops {
  const maps = reels === REELS ? VIRTUAL_MAPS : reels.map(virtualMap);
  const pick = (r: number) => maps[r][Math.floor(rng() * VIRTUAL_STOPS)];
  return [pick(0), pick(1), pick(2)];
}

const wrap = (i: number) => ((i % PHYSICAL_STOPS) + PHYSICAL_STOPS) % PHYSICAL_STOPS;

/** Symbol `offset` rows below the payline (−1 = row above) on a reel. */
export function symbolAt(reel: Reel, stop: number, offset = 0): SymbolId {
  return reel[wrap(stop + offset)].symbol;
}

export function paylineOf(stops: Stops, reels: readonly Reel[] = REELS): Line {
  return [symbolAt(reels[0], stops[0]), symbolAt(reels[1], stops[1]), symbolAt(reels[2], stops[2])];
}

export interface SpinResult {
  stops: Stops;
  /** Credits staked on this spin. */
  bet: number;
  line: Line;
  rule: PayRule | null;
  /** Credits won for a bet of `bet` (0 on a loss). */
  win: number;
}

export function resolveSpin(stops: Stops, bet: number, reels: readonly Reel[] = REELS): SpinResult {
  const line = paylineOf(stops, reels);
  const rule = evaluateLine(line);
  return { stops, bet, line, rule, win: rule ? rule.pays * bet : 0 };
}

/** Reels whose payline symbol makes up a rule's win (cherries count from the left). */
export function winningReels(rule: PayRule | null): number[] {
  if (!rule) return [];
  return rule.pattern.flatMap((p, i) => (p === 'any' ? [] : [i]));
}

/** 7-7 on the first two reels and a 7 directly above or below the payline on the third. */
export function isJackpotNearMiss(stops: Stops, reels: readonly Reel[] = REELS): boolean {
  return (
    symbolAt(reels[0], stops[0]) === 'seven' &&
    symbolAt(reels[1], stops[1]) === 'seven' &&
    (symbolAt(reels[2], stops[2], -1) === 'seven' || symbolAt(reels[2], stops[2], 1) === 'seven')
  );
}

// ---------- Exact analysis ----------

export interface RuleOdds {
  rule: PayRule;
  /** Outcomes (out of TOTAL_WAYS) that pay this rule. */
  ways: number;
  probability: number;
  /** Share of each credit bet returned through this rule. */
  rtpContribution: number;
}

export interface MachineOdds {
  totalWays: number;
  rules: RuleOdds[];
  /** Total credits returned over all TOTAL_WAYS outcomes of a 1-credit bet. */
  totalReturn: number;
  /** Return to player: expected credits back per credit bet. */
  rtp: number;
  houseEdge: number;
  winningWays: number;
  hitFrequency: number;
  /** Variance and standard deviation of the per-credit payout. */
  variance: number;
  stdDev: number;
  /**
   * Spins needed before the observed return is within ±1 point of the RTP
   * 95% of the time (normal approximation: (1.96σ / 0.01)²).
   */
  spinsForOnePercent: number;
}

/** Virtual weight of each symbol landing on the payline, per reel. */
export function paylineWeights(reel: Reel): Record<SymbolId, number> {
  const w = Object.fromEntries(SYMBOL_IDS.map((s) => [s, 0])) as Record<SymbolId, number>;
  for (const stop of reel) w[stop.symbol] += stop.weight;
  return w;
}

export function analyzeMachine(reels: readonly Reel[] = REELS, rules: readonly PayRule[] = PAY_RULES): MachineOdds {
  const weights = reels.map(paylineWeights);
  const total = weights.reduce((prod, w) => prod * Object.values(w).reduce((a, b) => a + b, 0), 1);
  const perRule = new Map<PayRuleId, number>(rules.map((r) => [r.id, 0]));
  let totalReturn = 0;
  let sumSquares = 0;

  for (const a of SYMBOL_IDS) {
    for (const b of SYMBOL_IDS) {
      for (const c of SYMBOL_IDS) {
        const ways = weights[0][a] * weights[1][b] * weights[2][c];
        if (ways === 0) continue;
        const rule = evaluateLine([a, b, c], rules);
        if (!rule) continue;
        perRule.set(rule.id, (perRule.get(rule.id) ?? 0) + ways);
        totalReturn += ways * rule.pays;
        sumSquares += ways * rule.pays * rule.pays;
      }
    }
  }

  const rtp = totalReturn / total;
  const variance = sumSquares / total - rtp * rtp;
  const stdDev = Math.sqrt(variance);
  const winningWays = [...perRule.values()].reduce((a, b) => a + b, 0);

  return {
    totalWays: total,
    rules: rules.map((rule) => {
      const ways = perRule.get(rule.id) ?? 0;
      return { rule, ways, probability: ways / total, rtpContribution: (ways * rule.pays) / total };
    }),
    totalReturn,
    rtp,
    houseEdge: 1 - rtp,
    winningWays,
    hitFrequency: winningWays / total,
    variance,
    stdDev,
    spinsForOnePercent: Math.ceil(((1.96 * stdDev) / 0.01) ** 2),
  };
}

export interface NearMissOdds {
  /** P(a 7 on the payline) per reel. */
  sevenOnLine: number[];
  /** P(a 7 directly above or below the payline) per reel. */
  sevenBesideLine: number[];
  /** P(7-7 on reels 1-2 and a 7 just off the line on reel 3). */
  jackpotNearMiss: number;
  jackpot: number;
  /** Same two numbers if every physical stop were equally likely (no virtual reel). */
  uniformJackpotNearMiss: number;
  uniformJackpot: number;
}

export function analyzeNearMisses(reels: readonly Reel[] = REELS): NearMissOdds {
  const onLine = (reel: Reel, uniform: boolean) =>
    reel.reduce((sum, stop) => sum + (stop.symbol === 'seven' ? (uniform ? 1 : stop.weight) : 0), 0) /
    (uniform ? PHYSICAL_STOPS : VIRTUAL_STOPS);
  const beside = (reel: Reel, uniform: boolean) =>
    reel.reduce(
      (sum, stop, i) =>
        sum +
        (symbolAt(reel, i, -1) === 'seven' || symbolAt(reel, i, 1) === 'seven' ? (uniform ? 1 : stop.weight) : 0),
      0,
    ) / (uniform ? PHYSICAL_STOPS : VIRTUAL_STOPS);

  const product = (f: (reel: Reel) => number) => reels.reduce((p, reel) => p * f(reel), 1);
  const nearMiss = (uniform: boolean) =>
    onLine(reels[0], uniform) * onLine(reels[1], uniform) * beside(reels[2], uniform);

  return {
    sevenOnLine: reels.map((r) => onLine(r, false)),
    sevenBesideLine: reels.map((r) => beside(r, false)),
    jackpotNearMiss: nearMiss(false),
    jackpot: product((r) => onLine(r, false)),
    uniformJackpotNearMiss: nearMiss(true),
    uniformJackpot: product((r) => onLine(r, true)),
  };
}

// ---------- Simulation ----------

/** Fast per-spin payout (per credit bet) using lookup tables. */
export function createPayoutSampler(reels: readonly Reel[] = REELS, rules: readonly PayRule[] = PAY_RULES) {
  const index = new Map(SYMBOL_IDS.map((s, i) => [s, i]));
  const n = SYMBOL_IDS.length;
  const table = new Float64Array(n * n * n);
  for (const a of SYMBOL_IDS) {
    for (const b of SYMBOL_IDS) {
      for (const c of SYMBOL_IDS) {
        const rule = evaluateLine([a, b, c], rules);
        table[(index.get(a)! * n + index.get(b)!) * n + index.get(c)!] = rule ? rule.pays : 0;
      }
    }
  }
  const symbolMaps = reels.map((reel) => Uint8Array.from(virtualMap(reel), (stop) => index.get(reel[stop].symbol)!));
  return (rng: () => number): number => {
    const a = symbolMaps[0][Math.floor(rng() * VIRTUAL_STOPS)];
    const b = symbolMaps[1][Math.floor(rng() * VIRTUAL_STOPS)];
    const c = symbolMaps[2][Math.floor(rng() * VIRTUAL_STOPS)];
    return table[(a * n + b) * n + c];
  };
}

export interface ConvergencePoint {
  spins: number;
  /** Observed return per credit bet after `spins` spins. */
  rtp: number;
}

const yieldToBrowser = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export interface AsyncOptions {
  /** When aborted, the run stops at the next chunk and resolves to null. */
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
}

/**
 * Flat-bets one credit per spin and records the observed return at ~log-spaced
 * checkpoints. Yields to the event loop every 200k spins.
 */
export async function simulateConvergence(
  spins: number,
  options: AsyncOptions = {},
  rng: () => number = Math.random,
): Promise<ConvergencePoint[] | null> {
  if (!Number.isInteger(spins) || spins <= 0) throw new Error('simulateConvergence: spins must be a positive integer');
  const sample = createPayoutSampler();
  const checkpoints = logCheckpoints(spins);
  const points: ConvergencePoint[] = [];
  let returned = 0;
  let next = 0;
  const chunk = 200_000;
  for (let i = 1; i <= spins; i++) {
    returned += sample(rng);
    if (i === checkpoints[next]) {
      points.push({ spins: i, rtp: returned / i });
      next++;
    }
    if (i % chunk === 0 && i < spins) {
      options.onProgress?.(i, spins);
      if (options.signal?.aborted) return null;
      await yieldToBrowser();
    }
  }
  options.onProgress?.(spins, spins);
  return points;
}

/** ~20 checkpoints per decade from 10 spins up to `spins`, always ending at `spins`. */
export function logCheckpoints(spins: number): number[] {
  const out = new Set<number>();
  for (let e = 1; e <= Math.log10(spins) + 1e-9; e += 0.05) out.add(Math.round(10 ** e));
  out.add(spins);
  return [...out].filter((n) => n >= 1 && n <= spins).sort((a, b) => a - b);
}

export interface SessionConfig {
  bankroll: number;
  /** Credits bet per spin. */
  bet: number;
  /** Stop after this many spins (or earlier if the bankroll can't cover a bet). */
  maxSpins: number;
}

export interface SessionResult {
  final: number;
  spins: number;
  busted: boolean;
  peak: number;
}

export interface SessionSummary {
  trials: number;
  finals: number[];
  bustRate: number;
  /** Share of sessions that ended with more than they started with. */
  aheadRate: number;
  meanFinal: number;
  medianFinal: number;
  /** Average spins actually played (bust sessions stop early). */
  meanSpins: number;
  /** One session's bankroll after every spin, for the sample chart. */
  sampleTrajectory: number[];
}

/** Plays sessions of flat bets; yields to the event loop every 250 sessions. */
export async function simulateSessions(
  config: SessionConfig,
  trials: number,
  options: AsyncOptions = {},
  rng: () => number = Math.random,
): Promise<SessionSummary | null> {
  const { bankroll, bet, maxSpins } = config;
  if (!(bet > 0) || !(bankroll >= bet) || !Number.isInteger(maxSpins) || maxSpins <= 0) {
    throw new Error('simulateSessions: need bet > 0, bankroll ≥ bet and a positive integer maxSpins');
  }
  if (!Number.isInteger(trials) || trials <= 0) throw new Error('simulateSessions: trials must be a positive integer');

  const sample = createPayoutSampler();
  const finals = new Array<number>(trials);
  const sampleTrajectory: number[] = [bankroll];
  let busted = 0;
  let ahead = 0;
  let totalFinal = 0;
  let totalSpins = 0;

  for (let t = 0; t < trials; t++) {
    let credits = bankroll;
    let spins = 0;
    while (spins < maxSpins && credits >= bet) {
      credits += bet * (sample(rng) - 1);
      spins++;
      if (t === 0) sampleTrajectory.push(credits);
    }
    finals[t] = credits;
    totalFinal += credits;
    totalSpins += spins;
    if (credits < bet) busted++;
    if (credits > bankroll) ahead++;
    if ((t + 1) % 250 === 0 && t + 1 < trials) {
      options.onProgress?.(t + 1, trials);
      if (options.signal?.aborted) return null;
      await yieldToBrowser();
    }
  }
  options.onProgress?.(trials, trials);

  const sorted = [...finals].sort((a, b) => a - b);
  const mid = Math.floor(trials / 2);
  return {
    trials,
    finals,
    bustRate: busted / trials,
    aheadRate: ahead / trials,
    meanFinal: totalFinal / trials,
    medianFinal: trials % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid],
    meanSpins: totalSpins / trials,
    sampleTrajectory,
  };
}
