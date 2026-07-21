/**
 * Bigger Number — headless AI match harness.
 *
 * Pits AI difficulty tiers and human-like opponent models against each other
 * using the real gameLogic + BiggerNumberAI, seeded and reproducible.
 *
 * Usage:
 *   node -r tsx/cjs scripts/bigger-number-ai-match.ts --a hard --b panel --matches 500 --seed 42
 *   node -r tsx/cjs scripts/bigger-number-ai-match.ts --a hard --b medium --matches 1000
 *   node -r tsx/cjs scripts/bigger-number-ai-match.ts --exploit        # solver convergence diagnostics
 *   node -r tsx/cjs scripts/bigger-number-ai-match.ts --timing        # per-decision latency
 *
 * Agents:
 *   AI tiers: easy | medium | hard | master
 *   Human models: greedy-max | save-big | random | copy-last | escalate | minimal-winner
 *   Meta: panel (run --a against every human model), all (AI ladder cross table)
 */

import {
  pickAICard,
  solveZeroSumGame,
  createOpponentModel,
  observeOpponentPlay,
  computeHardStrategy,
  DEFAULT_HARD_OPTIONS,
  type HardOptions,
  type MatchContext,
  type OpponentModelState,
} from '../src/components/game/BiggerNumber/BiggerNumberAI';
import { freshHand, removeCard, resolveRound, evaluateMatch, isDragon } from '../src/components/game/BiggerNumber/gameLogic';
import { DEFAULT_RULES, type AIDifficulty, type BiggerNumberRules, type CardValue } from '../src/components/game/BiggerNumber/types';

// ---------------------------------------------------------------------------
// Deterministic PRNG (mulberry32) — same generator the unit tests use.
// ---------------------------------------------------------------------------

function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

const AI_TIERS = ['easy', 'medium', 'hard', 'master'] as const;
const HUMAN_MODELS = [
  'greedy-max',
  'save-big',
  'random',
  'copy-last',
  'escalate',
  'minimal-winner',
] as const;

/**
 * Agent spec strings. AI tiers accept tuning suffixes for A/B experiments:
 *   hard:hd=0        heuristicDepth (0 = myopic one-round matrix at big hands)
 *   hard:a=0.6       leafScoreWeight (wins-needed term of the leaf eval)
 *   hard:b=0.35      leafEdgeWeight (hand-edge term of the leaf eval)
 *   hard:xc=6        exactMaxCards (exact lookahead threshold)
 *   hard:top=10000   top-level solver iterations
 *   hard:int=300     interior solver iterations
 * e.g. `hard:hd=0` reproduces the pre-change production hard AI.
 */
type AgentName = string;

function parseHardOptions(spec: string): { base: string; opts: HardOptions } {
  const [base, ...params] = spec.split(':');
  const opts: HardOptions = { ...DEFAULT_HARD_OPTIONS };
  for (const p of params) {
    const [k, v] = p.split('=');
    const num = Number(v);
    if (k === 'hd') opts.heuristicDepth = num;
    else if (k === 'a') opts.leafScoreWeight = num;
    else if (k === 'b') opts.leafEdgeWeight = num;
    else if (k === 'xc') opts.exactMaxCards = num;
    else if (k === 'top') opts.topIterations = num;
    else if (k === 'int') opts.interiorIterations = num;
    else throw new Error(`Unknown agent param: ${p}`);
  }
  return { base, opts };
}

function sampleFrom(dist: number[], rng: () => number): number {
  let r = rng();
  for (let i = 0; i < dist.length; i++) {
    r -= dist[i];
    if (r <= 0) return i;
  }
  return dist.length - 1;
}

interface RoundView {
  myHand: CardValue[];
  oppHand: CardValue[];
  myWins: number;
  oppWins: number;
  round: number;
  /** Opponent's revealed card last round (null on round 1 / after replay reset). */
  oppLastCard: CardValue | null;
  /** Did I lose the previous round? */
  lostLast: boolean;
  rules: BiggerNumberRules;
  rng: () => number;
}

interface Agent {
  name: AgentName;
  pick(view: RoundView): CardValue;
  /** Called after each reveal so stateful agents can learn. */
  observe?(oppHandBeforePlay: CardValue[], oppCard: CardValue, view: RoundView): void;
  /** Reset any cross-round state between matches (model persistence is separate). */
  resetMatch?(): void;
}

/** Strength ordering a human would intuit: 1..9, dragon strongest. */
function strength(card: CardValue, rules: BiggerNumberRules): number {
  if (isDragon(card)) return rules.dragonRule === 'beats-all' ? 10 : 9.5;
  return card;
}

function sortedByStrength(hand: CardValue[], rules: BiggerNumberRules): CardValue[] {
  return [...hand].sort((a, b) => strength(a, rules) - strength(b, rules));
}

function contextFor(view: RoundView): MatchContext {
  return {
    myWinsNeeded: Math.max(1, view.rules.winsToWin - view.myWins),
    oppWinsNeeded: Math.max(1, view.rules.winsToWin - view.oppWins),
    roundsLeft: Math.max(1, view.rules.totalRounds - (view.round - 1)),
  };
}

function makeAgent(spec: AgentName, harnessOpts: { persistModel: boolean }): Agent {
  const { base, opts } = parseHardOptions(spec);

  if ((AI_TIERS as readonly string[]).includes(base)) {
    const difficulty = base as AIDifficulty;
    const tuned = spec.includes(':');
    let model: OpponentModelState | null = difficulty === 'master' ? createOpponentModel() : null;
    return {
      name: spec,
      pick(view) {
        const context = contextFor(view);
        if (tuned && difficulty === 'hard') {
          // Variant agent for A/B: same machinery, explicit tuning options.
          if (view.oppHand.length === 0) return view.myHand[0];
          const { strategy } = computeHardStrategy(
            view.rules, view.myHand, view.oppHand, context, opts,
          );
          return view.myHand[sampleFrom(strategy, view.rng)];
        }
        return pickAICard(
          difficulty,
          view.rules,
          view.myHand,
          view.oppHand,
          context,
          view.rng,
          model ?? undefined,
        ).card;
      },
      observe(oppHandBeforePlay, oppCard, view) {
        if (model) {
          observeOpponentPlay(model, view.rules, oppHandBeforePlay, oppCard, {
            oppWins: view.oppWins,
            myWins: view.myWins,
          });
        }
      },
      resetMatch() {
        if (model && !harnessOpts.persistModel) model = createOpponentModel();
      },
    };
  }

  switch (base) {
    case 'greedy-max':
      return {
        name: spec,
        pick: (v) => sortedByStrength(v.myHand, v.rules)[v.myHand.length - 1],
      };
    case 'save-big':
      return { name: spec, pick: (v) => sortedByStrength(v.myHand, v.rules)[0] };
    case 'random':
      return { name: spec, pick: (v) => v.myHand[Math.floor(v.rng() * v.myHand.length)] };
    case 'copy-last':
      // Mirrors the opponent: plays own card closest in strength to what the
      // opponent showed last round. Round 1: middle of hand.
      return {
        name: spec,
        pick(v) {
          const sorted = sortedByStrength(v.myHand, v.rules);
          if (v.oppLastCard == null) return sorted[Math.floor(sorted.length / 2)];
          const target = strength(v.oppLastCard, v.rules);
          let best = sorted[0];
          for (const c of sorted) {
            if (Math.abs(strength(c, v.rules) - target) < Math.abs(strength(best, v.rules) - target)) {
              best = c;
            }
          }
          return best;
        },
      };
    case 'escalate':
      // Tilts after a loss (slams the strongest tile), relaxes after a win/tie.
      return {
        name: spec,
        pick(v) {
          const sorted = sortedByStrength(v.myHand, v.rules);
          if (v.round === 1) return sorted[Math.floor(sorted.length / 2)];
          return v.lostLast ? sorted[sorted.length - 1] : sorted[0];
        },
      };
    case 'minimal-winner':
      // Expects the opponent to repeat similar strength; plays the weakest tile
      // that would beat the opponent's last card, else the weakest tile.
      return {
        name: spec,
        pick(v) {
          const sorted = sortedByStrength(v.myHand, v.rules);
          if (v.oppLastCard == null) return sorted[Math.floor(sorted.length / 2)];
          for (const c of sorted) {
            if (resolveRound(v.rules, c, v.oppLastCard).outcome === 'p1') return c;
          }
          return sorted[0];
        },
      };
    default:
      throw new Error(`Unknown agent: ${spec}`);
  }
}

// ---------------------------------------------------------------------------
// Match runner — mirrors BiggerNumberVsAI.tsx's loop exactly.
// ---------------------------------------------------------------------------

interface MatchResult {
  /** 1 = A wins, 0 = B wins, 0.5 = draw */
  scoreA: number;
  margin: number; // aWins - bWins
  rounds: number;
  maxDecisionMs: number;
}

function playMatch(
  agentA: Agent,
  agentB: Agent,
  rules: BiggerNumberRules,
  seed: number,
): MatchResult {
  const rngA = seededRng(seed);
  const rngB = seededRng(seed ^ 0x9e3779b9);

  let handA = freshHand();
  let handB = freshHand();
  let winsA = 0;
  let winsB = 0;
  let round = 1;
  let lastA: CardValue | null = null;
  let lastB: CardValue | null = null;
  let lostLastA = false;
  let lostLastB = false;
  let roundsPlayed = 0;
  let maxDecisionMs = 0;
  let guard = 0;

  agentA.resetMatch?.();
  agentB.resetMatch?.();

  for (;;) {
    if (++guard > 1000) throw new Error('runaway match (replay loop?)');
    const viewA: RoundView = {
      myHand: handA, oppHand: handB, myWins: winsA, oppWins: winsB,
      round, oppLastCard: lastB, lostLast: lostLastA, rules, rng: rngA,
    };
    const viewB: RoundView = {
      myHand: handB, oppHand: handA, myWins: winsB, oppWins: winsA,
      round, oppLastCard: lastA, lostLast: lostLastB, rules, rng: rngB,
    };

    let t0 = performance.now();
    const cardA = agentA.pick(viewA);
    maxDecisionMs = Math.max(maxDecisionMs, performance.now() - t0);
    t0 = performance.now();
    const cardB = agentB.pick(viewB);
    maxDecisionMs = Math.max(maxDecisionMs, performance.now() - t0);

    const handABefore = handA;
    const handBBefore = handB;
    const result = resolveRound(rules, cardA, cardB);

    if (result.outcome === 'p1') winsA += 1;
    else if (result.outcome === 'p2') winsB += 1;

    if (!result.cardsReturnedToHand) {
      handA = removeCard(handA, cardA);
      handB = removeCard(handB, cardB);
      roundsPlayed += 1;
    }

    // Let stateful agents observe the opponent's reveal.
    agentA.observe?.(handBBefore, cardB, viewA);
    agentB.observe?.(handABefore, cardA, viewB);

    lastA = cardA;
    lastB = cardB;
    lostLastA = result.outcome === 'p2';
    lostLastB = result.outcome === 'p1';

    const outOfCards = handA.length === 0 || handB.length === 0;
    let winner = evaluateMatch(rules, { p1Wins: winsA, p2Wins: winsB }, roundsPlayed, {
      p1: 'A',
      p2: 'B',
    });
    if (winner === undefined && outOfCards) {
      winner = winsA > winsB ? 'A' : winsB > winsA ? 'B' : null;
    }
    if (winner !== undefined) {
      return {
        scoreA: winner === 'A' ? 1 : winner === 'B' ? 0 : 0.5,
        margin: winsA - winsB,
        rounds: roundsPlayed,
        maxDecisionMs,
      };
    }
    if (!result.cardsReturnedToHand) round += 1;
  }
}

interface SeriesStats {
  a: AgentName;
  b: AgentName;
  n: number;
  winRate: number; // draws count 0.5
  ci95: number;
  avgMargin: number;
  wins: number;
  draws: number;
  losses: number;
  rounds: number;
  maxDecisionMs: number;
}

function runSeries(
  aName: AgentName,
  bName: AgentName,
  matches: number,
  seed: number,
  rules: BiggerNumberRules,
  persistModel: boolean,
): SeriesStats {
  const agentA = makeAgent(aName, { persistModel });
  const agentB = makeAgent(bName, { persistModel });
  let wins = 0;
  let draws = 0;
  let losses = 0;
  let marginSum = 0;
  let scoreSum = 0;
  let scoreSqSum = 0;
  let rounds = 0;
  let maxDecisionMs = 0;
  for (let i = 0; i < matches; i++) {
    const r = playMatch(agentA, agentB, rules, seed + i * 7919);
    if (r.scoreA === 1) wins++;
    else if (r.scoreA === 0) losses++;
    else draws++;
    marginSum += r.margin;
    scoreSum += r.scoreA;
    scoreSqSum += r.scoreA * r.scoreA;
    rounds += r.rounds;
    maxDecisionMs = Math.max(maxDecisionMs, r.maxDecisionMs);
  }
  const p = scoreSum / matches;
  const variance = Math.max(0, scoreSqSum / matches - p * p);
  const ci95 = 1.96 * Math.sqrt(variance / matches);
  return {
    a: aName,
    b: bName,
    n: matches,
    winRate: p,
    ci95,
    avgMargin: marginSum / matches,
    wins,
    draws,
    losses,
    rounds,
    maxDecisionMs,
  };
}

function fmt(s: SeriesStats): string {
  const pct = (x: number) => (100 * x).toFixed(1);
  return (
    `${s.a.padEnd(14)} vs ${s.b.padEnd(14)} n=${String(s.n).padStart(5)}  ` +
    `win% ${pct(s.winRate).padStart(5)} ±${pct(s.ci95).padStart(4)}  ` +
    `W/D/L ${s.wins}/${s.draws}/${s.losses}  ` +
    `margin ${s.avgMargin >= 0 ? '+' : ''}${s.avgMargin.toFixed(2)}  ` +
    `maxDec ${s.maxDecisionMs.toFixed(1)}ms`
  );
}

// ---------------------------------------------------------------------------
// Solver diagnostics: exploitability of the strategy fictitious play produces.
// ---------------------------------------------------------------------------

function bestResponseGap(matrix: number[][], strategy: number[]): number {
  // Row player's guaranteed value under `strategy` = min over columns of s·M[:,c].
  const cols = matrix[0].length;
  let guaranteed = Infinity;
  for (let c = 0; c < cols; c++) {
    let v = 0;
    for (let r = 0; r < matrix.length; r++) v += strategy[r] * matrix[r][c];
    guaranteed = Math.min(guaranteed, v);
  }
  // Reference game value: very long run of the solver.
  const ref = solveZeroSumGame(matrix, 200000).value;
  return ref - guaranteed; // >= 0; 0 means exactly optimal
}

function exploitDiagnostics() {
  const rules = { ...DEFAULT_RULES };
  const full = freshHand();
  const oneRound = full.map((m) => full.map((o) => {
    const r = resolveRound(rules, m, o);
    return r.outcome === 'p1' ? 1 : r.outcome === 'p2' ? -1 : 0;
  }));
  console.log('Solver exploitability on the full-hand one-round matrix (10x10):');
  for (const iters of [300, 2000, 10000, 50000]) {
    const t0 = performance.now();
    const { strategy, value } = solveZeroSumGame(oneRound, iters);
    const ms = performance.now() - t0;
    const gap = bestResponseGap(oneRound, strategy);
    console.log(
      `  iters=${String(iters).padStart(6)}  value=${value.toFixed(4)}  ` +
      `exploitability=${gap.toFixed(4)}  (${ms.toFixed(1)}ms)`,
    );
  }
  // Rock-paper-scissors-like sub-state {1,9,D} for reference.
  const rps: CardValue[] = [1, 9, 'dragon'];
  const rpsM = rps.map((m) => rps.map((o) => {
    const r = resolveRound(rules, m, o);
    return r.outcome === 'p1' ? 1 : r.outcome === 'p2' ? -1 : 0;
  }));
  console.log('On {1,9,dragon} cycle (3x3, equilibrium = uniform):');
  for (const iters of [300, 2000, 10000]) {
    const { strategy } = solveZeroSumGame(rpsM, iters);
    const gap = bestResponseGap(rpsM, strategy);
    console.log(
      `  iters=${String(iters).padStart(6)}  strategy=[${strategy.map((p) => p.toFixed(3)).join(', ')}]  exploitability=${gap.toFixed(4)}`,
    );
  }
}

function timingDiagnostics(seed: number) {
  const rules = { ...DEFAULT_RULES };
  const rng = seededRng(seed);
  console.log('Per-decision latency for hard/master at each hand size (fresh caches):');
  for (const tier of ['hard', 'master'] as const) {
    const model = tier === 'master' ? createOpponentModel() : undefined;
    for (let size = 10; size >= 1; size--) {
      const hand = freshHand().slice(0, size);
      const ctx: MatchContext = {
        myWinsNeeded: Math.max(1, rules.winsToWin - Math.floor((10 - size) / 2)),
        oppWinsNeeded: Math.max(1, rules.winsToWin - Math.ceil((10 - size) / 2)),
        roundsLeft: Math.max(1, rules.totalRounds - (10 - size)),
      };
      const t0 = performance.now();
      pickAICard(tier, rules, hand, hand, ctx, rng, model);
      const cold = performance.now() - t0;
      const t1 = performance.now();
      for (let i = 0; i < 10; i++) pickAICard(tier, rules, hand, hand, ctx, rng, model);
      const warm = (performance.now() - t1) / 10;
      console.log(`  ${tier.padEnd(6)} hand=${String(size).padStart(2)}  cold=${cold.toFixed(1)}ms  warm=${warm.toFixed(2)}ms`);
    }
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const i = args.indexOf(`--${flag}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  return {
    a: (get('a') ?? 'hard') as AgentName,
    b: (get('b') ?? 'panel') as AgentName | 'panel' | 'ladder',
    matches: Number(get('matches') ?? 500),
    seed: Number(get('seed') ?? 42),
    exploit: args.includes('--exploit'),
    timing: args.includes('--timing'),
    resetModelPerMatch: args.includes('--resetModelPerMatch'),
  };
}

function main() {
  const opts = parseArgs();
  const rules = { ...DEFAULT_RULES };

  if (opts.exploit) {
    exploitDiagnostics();
    return;
  }
  if (opts.timing) {
    timingDiagnostics(opts.seed);
    return;
  }

  const persistModel = !opts.resetModelPerMatch;
  console.log(
    `rules: dragon=${rules.dragonRule} tie=${rules.tieRule} winsToWin=${rules.winsToWin} ` +
    `totalRounds=${rules.totalRounds}  seed=${opts.seed}  matches/pair=${opts.matches}  ` +
    `modelPersistence=${persistModel ? 'across-matches' : 'per-match'}`,
  );

  if (opts.b === 'panel') {
    for (const h of HUMAN_MODELS) {
      console.log(fmt(runSeries(opts.a, h, opts.matches, opts.seed, rules, persistModel)));
    }
    return;
  }
  if (opts.b === 'ladder') {
    const tiers: AgentName[] = ['easy', 'medium', 'hard', 'master'];
    for (const x of tiers) {
      for (const y of tiers) {
        if (x === y && x !== opts.a) continue;
        if (x !== opts.a && y !== opts.a && x !== y) continue;
        console.log(fmt(runSeries(x, y, opts.matches, opts.seed, rules, persistModel)));
      }
    }
    return;
  }
  console.log(fmt(runSeries(opts.a, opts.b as AgentName, opts.matches, opts.seed, rules, persistModel)));
}

main();
