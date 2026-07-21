/**
 * Daifugo AI self-play A/B harness.
 *
 * Mirrors the measurement discipline used for the Shogi/Othello engines
 * (scripts/shogi-ai-match.ts, scripts/othello-ai-match.ts): run N complete
 * headless games with the REAL rule engine (gameLogic.applyAction) and the
 * REAL AI (decideDaifugoAction), with a seeded deterministic RNG and seat
 * rotation so deal/position advantage cancels out.
 *
 * The candidate config occupies `--candSeats` seats (default 1) and rotates
 * around the table every game; every rotation group of `--players` games
 * replays the SAME deal so each config sees every seat of every deal.
 *
 * Player spec format for --cand / --base:  <impl>:<difficulty>
 *   impl        'cur'  -> current production DaifugoAI.ts
 *               'base' -> frozen baseline copy (scripts/daifugo-ai-baseline.ts)
 *   difficulty  easy | medium | hard | expert | master
 *
 * Usage:
 *   node -r tsx/cjs scripts/daifugo-ai-match.ts --games 1000 --seed 1 \
 *     --cand cur:master --base base:master
 *   node -r tsx/cjs scripts/daifugo-ai-match.ts --games 1000 --cand cur:master --base cur:hard
 *
 * Metrics (per config): win rate (finished 1st), average final place, and a
 * 95% CI on the candidate win rate / its difference vs the equal-strength
 * null (candSeats / players).
 */

import { applyAction, createInitialDaifugoState } from '../src/components/game/Daifugo/gameLogic';
import {
  decideDaifugoAction as decideCurrent,
  type DaifugoDifficulty,
  type DaifugoAIDecision,
} from '../src/components/game/Daifugo/DaifugoAI';
import { decideDaifugoAction as decideBaseline } from './daifugo-ai-baseline';
import type { DaifugoAction, DaifugoNetworkState } from '../src/components/game/Daifugo/multiplayerTypes';

// ----------------------------------------------------------------------------
// Deterministic RNG (mulberry32) — the engine and AI call Math.random, so the
// harness swaps Math.random for a seeded stream (deal stream + play stream)
// without changing production code.
// ----------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mixSeed(seed: number, salt: number): number {
  return ((seed | 0) ^ Math.imul((salt | 0) + 1, 0x9e3779b9)) >>> 0;
}

// ----------------------------------------------------------------------------
// Player specs
// ----------------------------------------------------------------------------

type ImplName = 'cur' | 'base';
type DecideFn = (
  state: DaifugoNetworkState,
  playerId: string,
  difficulty: DaifugoDifficulty
) => DaifugoAIDecision;

interface PlayerSpec {
  label: string;
  impl: ImplName;
  difficulty: DaifugoDifficulty;
  decide: DecideFn;
}

const DIFFICULTIES: DaifugoDifficulty[] = ['easy', 'medium', 'hard', 'expert', 'master'];

function parsePlayerSpec(raw: string | undefined, fallback: string): PlayerSpec {
  const value = raw ?? fallback;
  const [implRaw, diffRaw] = value.split(':');
  const impl: ImplName = implRaw === 'base' ? 'base' : 'cur';
  if (implRaw !== 'base' && implRaw !== 'cur') {
    throw new Error(`invalid impl "${implRaw}" in spec "${value}" (expected cur|base)`);
  }
  const difficulty = DIFFICULTIES.find(d => d === diffRaw);
  if (!difficulty) {
    throw new Error(`invalid difficulty "${diffRaw}" in spec "${value}"`);
  }
  return {
    label: value,
    impl,
    difficulty,
    decide: impl === 'base' ? (decideBaseline as DecideFn) : decideCurrent,
  };
}

// ----------------------------------------------------------------------------
// Config
// ----------------------------------------------------------------------------

interface MatchConfig {
  games: number;
  players: number;
  candSeats: number;
  cand: PlayerSpec;
  base: PlayerSpec;
  seed: number;
  maxSteps: number;
  quiet: boolean;
  verbose: boolean;
}

function parseIntArg(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseArgs(argv: string[]): MatchConfig {
  const argMap = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      argMap.set(key, next);
      i++;
    } else {
      argMap.set(key, 'true');
    }
  }

  const players = Math.max(2, parseIntArg(argMap.get('players'), 4));
  const candSeats = Math.min(players - 1, Math.max(1, parseIntArg(argMap.get('candSeats'), 1)));

  return {
    games: Math.max(1, parseIntArg(argMap.get('games'), 1000)),
    players,
    candSeats,
    cand: parsePlayerSpec(argMap.get('cand'), 'cur:master'),
    base: parsePlayerSpec(argMap.get('base'), 'base:master'),
    seed: parseIntArg(argMap.get('seed'), 1),
    maxSteps: parseIntArg(argMap.get('maxSteps'), 4000),
    quiet: argMap.get('quiet') === 'true',
    verbose: argMap.get('verbose') === 'true',
  };
}

// ----------------------------------------------------------------------------
// One game
// ----------------------------------------------------------------------------

interface GameOutcome {
  /** Final place (1 = daifugo/best) per seat id. */
  placeBySeat: Map<string, number>;
  steps: number;
  anomalies: number;
}

/**
 * Final placement, reproducing the engine's rank adjustment for あがり禁止札
 * (forbidden finishers moved to the end). 都落ち does not apply to a fresh
 * round (startDaifugoId is null).
 */
function computePlacement(state: DaifugoNetworkState): Map<string, number> {
  const forbidden = new Set(state.forbiddenFinishers);
  const kept = state.finishedOrder.filter(id => !forbidden.has(id));
  const moved = state.finishedOrder.filter(id => forbidden.has(id));
  const adjusted = [...kept, ...moved];
  const placeBySeat = new Map<string, number>();
  adjusted.forEach((id, i) => placeBySeat.set(id, i + 1));
  return placeBySeat;
}

function playOneGame(
  config: MatchConfig,
  seatSpecs: Map<string, PlayerSpec>,
  seatIds: string[],
  dealRng: () => number,
  playRng: () => number,
  setActiveRng: (rng: () => number) => void
): GameOutcome {
  setActiveRng(dealRng);
  let state = createInitialDaifugoState(seatIds);
  setActiveRng(playRng);

  let steps = 0;
  let anomalies = 0;

  while (!state.finished && steps < config.maxSteps) {
    steps++;
    const pid = state.currentTurnPlayerId;
    const spec = seatSpecs.get(pid)!;
    const decision = spec.decide(state, pid, spec.difficulty);

    const action: DaifugoAction = decision.type === 'play'
      ? {
        actionId: `g${steps}`,
        type: 'play',
        playerId: pid,
        cardIds: decision.cardIds,
        giveCardIds: decision.giveCardIds,
        discardCardIds: decision.discardCardIds,
        timestamp: 0,
      }
      : { actionId: `g${steps}`, type: 'pass', playerId: pid, timestamp: 0 };

    const result = applyAction(state, action);
    if (result.ok) {
      state = result.state;
      continue;
    }

    // The AI should never produce an illegal action; count it loudly and fall
    // back to a pass so the game can proceed.
    anomalies++;
    const pass = applyAction(state, { actionId: `g${steps}p`, type: 'pass', playerId: pid, timestamp: 0 });
    if (!pass.ok) {
      throw new Error(
        `stuck game: illegal AI action (${result.error}) and cannot pass (${pass.error}) at step ${steps}`
      );
    }
    state = pass.state;
  }

  if (!state.finished) {
    throw new Error(`game did not finish within ${config.maxSteps} steps`);
  }

  return { placeBySeat: computePlacement(state), steps, anomalies };
}

// ----------------------------------------------------------------------------
// Stats
// ----------------------------------------------------------------------------

interface ConfigStats {
  samples: number; // seat-games
  wins: number; // finished 1st
  placeSum: number;
}

function winRate(s: ConfigStats): number {
  return s.samples > 0 ? s.wins / s.samples : 0;
}

/** 95% normal-approximation CI half-width for a binomial proportion. */
function ciHalfWidth(p: number, n: number): number {
  if (n <= 0) return 0;
  return 1.96 * Math.sqrt((p * (1 - p)) / n);
}

function pct(x: number): string {
  return `${(100 * x).toFixed(2)}%`;
}

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------

function main(): void {
  const config = parseArgs(process.argv.slice(2));
  if (!config.quiet) {
    console.log('[daifugo-ai-match] config:', {
      games: config.games,
      players: config.players,
      candSeats: config.candSeats,
      cand: config.cand.label,
      base: config.base.label,
      seed: config.seed,
    });
  }

  const seatIds = Array.from({ length: config.players }, (_, i) => `s${i}`);

  // Swap Math.random for a seeded stream for the whole run.
  const originalRandom = Math.random;
  let activeRng: () => number = originalRandom;
  Math.random = () => activeRng();

  const candStats: ConfigStats = { samples: 0, wins: 0, placeSum: 0 };
  const baseStats: ConfigStats = { samples: 0, wins: 0, placeSum: 0 };
  const candWinBySeat = new Array<number>(config.players).fill(0);
  const candGamesBySeat = new Array<number>(config.players).fill(0);
  let totalSteps = 0;
  let totalAnomalies = 0;
  let decisionTimeMs = 0;

  const startedAt = Date.now();

  try {
    for (let game = 0; game < config.games; game++) {
      // Rotation: the candidate block starts at seat (game % players); each
      // rotation group of `players` games replays the same deal.
      const rotation = game % config.players;
      const dealIndex = Math.floor(game / config.players);

      const candSeatSet = new Set<number>();
      for (let i = 0; i < config.candSeats; i++) {
        candSeatSet.add((rotation + i) % config.players);
      }

      const seatSpecs = new Map<string, PlayerSpec>();
      seatIds.forEach((id, seatIdx) => {
        seatSpecs.set(id, candSeatSet.has(seatIdx) ? config.cand : config.base);
      });

      const dealRng = mulberry32(mixSeed(config.seed, dealIndex));
      const playRng = mulberry32(mixSeed(config.seed ^ 0x5bf03635, game));

      const t0 = Date.now();
      const outcome = playOneGame(
        config,
        seatSpecs,
        seatIds,
        dealRng,
        playRng,
        rng => { activeRng = rng; }
      );
      decisionTimeMs += Date.now() - t0;

      totalSteps += outcome.steps;
      totalAnomalies += outcome.anomalies;

      for (const [seatId, place] of outcome.placeBySeat) {
        const seatIdx = seatIds.indexOf(seatId);
        const isCand = candSeatSet.has(seatIdx);
        const stats = isCand ? candStats : baseStats;
        stats.samples++;
        stats.placeSum += place;
        if (place === 1) {
          stats.wins++;
          if (isCand) candWinBySeat[seatIdx]++;
        }
        if (isCand) candGamesBySeat[seatIdx]++;
      }

      if (config.verbose) {
        const places = seatIds
          .map((id, i) => `${candSeatSet.has(i) ? 'C' : 'B'}${i}:${outcome.placeBySeat.get(id)}`)
          .join(' ');
        console.log(`game ${game + 1}/${config.games} deal=${dealIndex} rot=${rotation} ${places}`);
      }
    }
  } finally {
    Math.random = originalRandom;
  }

  const elapsed = Date.now() - startedAt;

  const pCand = winRate(candStats);
  const pBase = winRate(baseStats);
  const nullRate = config.candSeats / config.players;
  const diffVsNull = pCand - nullRate;
  const ciCand = ciHalfWidth(pCand, candStats.samples);
  // Win-rate difference between the two configs (per-seat samples).
  const diffCfg = pCand - pBase;
  const ciDiff = 1.96 * Math.sqrt(
    (pCand * (1 - pCand)) / Math.max(1, candStats.samples) +
    (pBase * (1 - pBase)) / Math.max(1, baseStats.samples)
  );

  console.log('\n[daifugo-ai-match] summary');
  console.log(
    `  games=${config.games} players=${config.players} candSeats=${config.candSeats} seed=${config.seed} ` +
    `elapsed=${(elapsed / 1000).toFixed(1)}s avgSteps=${(totalSteps / config.games).toFixed(1)} ` +
    `avgGameMs=${(decisionTimeMs / config.games).toFixed(1)} anomalies=${totalAnomalies}`
  );
  console.log('  config              n      win%     avgPlace');
  console.log(
    `  cand ${config.cand.label.padEnd(12)} ${String(candStats.samples).padStart(6)} ` +
    `${pct(pCand).padStart(8)} ${(candStats.placeSum / Math.max(1, candStats.samples)).toFixed(3).padStart(9)}`
  );
  console.log(
    `  base ${config.base.label.padEnd(12)} ${String(baseStats.samples).padStart(6)} ` +
    `${pct(pBase).padStart(8)} ${(baseStats.placeSum / Math.max(1, baseStats.samples)).toFixed(3).padStart(9)}`
  );
  console.log(
    `  cand win rate: ${pct(pCand)} ± ${pct(ciCand)} (95% CI) | equal-strength null: ${pct(nullRate)} | ` +
    `diff vs null: ${diffVsNull >= 0 ? '+' : ''}${pct(diffVsNull)}`
  );
  console.log(
    `  cand-vs-base per-seat win-rate diff: ${diffCfg >= 0 ? '+' : ''}${pct(diffCfg)} ± ${pct(ciDiff)} (95% CI)`
  );
  const bySeat = candGamesBySeat
    .map((n, i) => (n > 0 ? `s${i}=${pct(candWinBySeat[i]! / n)}` : null))
    .filter(Boolean)
    .join(' ');
  console.log(`  cand win% by seat: ${bySeat}`);

  if (totalAnomalies > 0) {
    console.error(`[daifugo-ai-match] WARNING: ${totalAnomalies} illegal AI actions were auto-passed`);
    process.exitCode = 1;
  }
}

main();
