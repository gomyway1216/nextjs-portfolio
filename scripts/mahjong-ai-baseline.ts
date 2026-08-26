/**
 * Riichi Mahjong — M5 baseline instrument.
 *
 * Seats the heuristic AI at seat 0 and three uniform-random-legal players at
 * seats 1..3, plays N tonpuu games from seeded walls, and prints the numbers
 * the M5 gate is written against:
 *
 *     average placement (the gate: < 1.8), average final score,
 *     win rate, deal-in rate, riichi rate, call rate
 *
 * Usage:
 *
 *     node -r tsx/cjs scripts/mahjong-ai-baseline.ts --games=300 --seed=1
 *     node -r tsx/cjs scripts/mahjong-ai-baseline.ts --games=300 --difficulty=easy
 *
 * `package.json` is byte-sealed for this repository, so there is deliberately
 * no npm script wrapper — the same convention `mahjong-sim-smoke.ts` follows.
 *
 * This is **not** the strength harness. Random players are a sanity bar, not
 * an opponent: the whole point is that a policy which cannot beat them is
 * broken rather than merely weak. M7 replaces this file with
 * `scripts/mahjong-ai-match.ts`, which plays duplicate walls with the seat
 * under test rotated through all four positions and compares two arms.
 *
 * Everything is driven from one seeded {@link Rng}, so a run is byte-for-byte
 * reproducible: the wall, the random players' choices, and the per-decision
 * seed handed to the AI all come out of the same stream.
 */

import { legalActions } from '../src/components/game/Mahjong/engine/actions';
import {
  advanceHand,
  applyAction,
  currentActors,
  startGame,
} from '../src/components/game/Mahjong/engine/gameState';
import { createRng, type Rng } from '../src/components/game/Mahjong/engine/random';
import { DEFAULT_RULES } from '../src/components/game/Mahjong/engine/rules';
import type {
  GameState,
  RoundState,
  Seat,
} from '../src/components/game/Mahjong/engine/types';
import type { Difficulty } from '../src/components/game/common/types';
import { chooseActionSync } from '../src/components/game/Mahjong/mahjongAiWorkerClient';

/** The seat the AI under test occupies. Seats 1..3 always play at random. */
const AI_SEAT: Seat = 0;

/** Hard stop per hand; a real hand never needs anywhere near this many plies. */
const MAX_ACTIONS_PER_HAND = 2000;
/** Hard stop per game; dealer repeats are unbounded in v1 (no agari-yame). */
const MAX_HANDS_PER_GAME = 40;

export interface BaselineOptions {
  games: number;
  seed: number | string;
  difficulty: Difficulty;
}

export interface BaselineSummary {
  games: number;
  hands: number;
  decisions: number;
  decisionMs: number;
  /** Placement counts for the AI seat, index 0 = first place. */
  placements: [number, number, number, number];
  averagePlacement: number;
  averageScore: number;
  /** Hands in which the AI seat won (tsumo or ron). */
  wins: number;
  /** Hands in which the AI seat paid a ron. */
  dealIns: number;
  /** Hands in which the AI seat declared riichi. */
  riichi: number;
  /** Hands in which the AI seat made at least one open call. */
  calls: number;
}

function emptySummary(): BaselineSummary {
  return {
    games: 0,
    hands: 0,
    decisions: 0,
    decisionMs: 0,
    placements: [0, 0, 0, 0],
    averagePlacement: 0,
    averageScore: 0,
    wins: 0,
    dealIns: 0,
    riichi: 0,
    calls: 0,
  };
}

function playHand(
  round: RoundState,
  rng: Rng,
  difficulty: Difficulty,
  summary: BaselineSummary,
): void {
  let plies = 0;
  let called = false;

  while (round.phase !== 'ended') {
    plies += 1;
    if (plies > MAX_ACTIONS_PER_HAND) {
      throw new Error(`hand did not finish within ${MAX_ACTIONS_PER_HAND} actions`);
    }
    const actors = currentActors(round);
    if (actors.length === 0) throw new Error(`no actor in phase ${round.phase}`);
    const seat = actors[rng.nextInt(actors.length)];

    let action;
    if (seat === AI_SEAT) {
      const seed = rng.next();
      const started = process.hrtime.bigint();
      action = chooseActionSync({ state: round, seat, difficulty, seed });
      summary.decisionMs += Number(process.hrtime.bigint() - started) / 1e6;
      summary.decisions += 1;
    } else {
      const choices = legalActions(round, seat);
      if (choices.length === 0) throw new Error(`seat ${seat} has no legal action`);
      action = choices[rng.nextInt(choices.length)];
    }

    if (
      seat === AI_SEAT &&
      (action.type === 'chi' || action.type === 'pon' || action.type === 'minkan')
    ) {
      called = true;
    }
    applyAction(round, action);
  }

  summary.hands += 1;
  if (called) summary.calls += 1;
  if (round.players[AI_SEAT].riichi !== null) summary.riichi += 1;

  const result = round.result;
  if (result !== null) {
    for (const agari of result.agari) {
      if (agari.winner === AI_SEAT) summary.wins += 1;
      else if (agari.loser === AI_SEAT) summary.dealIns += 1;
    }
  }
}

/** Play `options.games` tonpuu games and return the AI seat's statistics. */
export function runBaseline(options: BaselineOptions): BaselineSummary {
  const rng = createRng(options.seed);
  const summary = emptySummary();
  let scoreTotal = 0;
  let placementTotal = 0;

  for (let index = 0; index < options.games; index += 1) {
    let game: GameState = startGame({ rules: DEFAULT_RULES, rng });
    summary.games += 1;
    let handsThisGame = 0;

    while (!game.finished) {
      const round = game.round;
      if (round === null) throw new Error('game has no round to play');
      try {
        playHand(round, rng, options.difficulty, summary);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`game ${summary.games}, hand ${handsThisGame + 1}: ${message}`);
      }
      handsThisGame += 1;
      game = advanceHand(game, rng);
      if (handsThisGame >= MAX_HANDS_PER_GAME) break;
    }

    const placements = game.placements;
    if (placements === null) throw new Error('game finished without placements');
    const place = placements.indexOf(AI_SEAT) + 1;
    summary.placements[place - 1] += 1;
    placementTotal += place;
    scoreTotal += game.scores[AI_SEAT];
  }

  summary.averagePlacement = placementTotal / summary.games;
  summary.averageScore = scoreTotal / summary.games;
  return summary;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard', 'expert', 'master'];

function parseArgs(argv: string[]): BaselineOptions {
  let games = 100;
  let seed: number | string = 1;
  let difficulty: Difficulty = 'medium';

  for (const arg of argv) {
    const gamesMatch = /^--games=(\d+)$/.exec(arg);
    if (gamesMatch) {
      games = Number(gamesMatch[1]);
      continue;
    }
    const seedMatch = /^--seed=(.+)$/.exec(arg);
    if (seedMatch) {
      const raw = seedMatch[1];
      seed = /^\d+$/.test(raw) ? Number(raw) : raw;
      continue;
    }
    const difficultyMatch = /^--difficulty=(.+)$/.exec(arg);
    if (difficultyMatch) {
      const raw = difficultyMatch[1] as Difficulty;
      if (!DIFFICULTIES.includes(raw)) {
        throw new Error(`Unknown difficulty ${raw} (expected ${DIFFICULTIES.join('|')})`);
      }
      difficulty = raw;
      continue;
    }
    if (arg.startsWith('--')) {
      throw new Error(`Unknown flag ${arg} (expected --games=N, --seed=S or --difficulty=D)`);
    }
  }
  if (!Number.isInteger(games) || games <= 0) {
    throw new Error(`--games must be a positive integer, got ${games}`);
  }
  return { games, seed, difficulty };
}

function percent(part: number, whole: number): string {
  return whole === 0 ? '—' : `${((100 * part) / whole).toFixed(1)}%`;
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const started = Date.now();
  let summary: BaselineSummary;
  try {
    summary = runBaseline(options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`mahjong-ai-baseline FAILED (seed ${options.seed}): ${message}\n`);
    process.exit(1);
    return;
  }

  const seconds = (Date.now() - started) / 1000;
  process.stdout.write(
    [
      `mahjong-ai-baseline  difficulty=${options.difficulty} seed=${options.seed}`,
      `  games              ${summary.games}`,
      `  hands              ${summary.hands}`,
      `  placements 1/2/3/4 ${summary.placements.join(' / ')}`,
      `  average placement  ${summary.averagePlacement.toFixed(4)}`,
      `  average score      ${summary.averageScore.toFixed(0)}`,
      `  win rate           ${percent(summary.wins, summary.hands)}`,
      `  deal-in rate       ${percent(summary.dealIns, summary.hands)}`,
      `  riichi rate        ${percent(summary.riichi, summary.hands)}`,
      `  call rate          ${percent(summary.calls, summary.hands)}`,
      `  decisions          ${summary.decisions}`,
      `  ms / decision      ${(summary.decisionMs / Math.max(1, summary.decisions)).toFixed(4)}`,
      `  elapsed            ${seconds.toFixed(2)}s`,
      '',
    ].join('\n'),
  );
}

const invokedDirectly =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  typeof process.argv[1] === 'string' &&
  /mahjong-ai-baseline\.[cm]?ts$/.test(process.argv[1]);

if (invokedDirectly) main();
