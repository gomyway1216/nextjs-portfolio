/**
 * Othello AI self-play A/B harness.
 *
 * Mirrors the discipline used for the Shogi engine (scripts/shogi-ai-match.ts):
 * pit two engine configurations against each other from a set of randomized
 * opening positions, playing each opening twice with colors swapped so neither
 * engine gets a first-move advantage. Report win/loss/draw and disc-difference
 * stats from engine A's perspective, plus a binomial-ish confidence read.
 *
 * The only production hook required is OthelloAI's `midEvaluator` injection
 * option (see AI.ts / OthelloAIOptions) — everything else lives in this script.
 *
 * Usage:
 *   npx tsx scripts/othello-ai-match.ts --a mid --b mid --games 40 --difficulty medium
 *   npx tsx scripts/othello-ai-match.ts --a mid --b random --games 40   # sanity: engine crushes random
 *
 * Evaluator names for --a / --b:
 *   mid     -> current production MidEvaluator
 *   random  -> plays uniformly random legal moves (bypasses search; sanity baseline)
 */

import { Board } from '../src/components/game/Othello/Board';
import { OthelloAI } from '../src/components/game/Othello/AI';
import { MidEvaluator, type Evaluator } from '../src/components/game/Othello/Evaluator';
import {
  BLACK,
  WHITE,
  MAX_TURNS,
  type Color,
  type Difficulty,
  type Point,
} from '../src/components/game/Othello/types';

// ----------------------------------------------------------------------------
// Deterministic RNG (mulberry32) so opening sets are reproducible across runs.
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

// ----------------------------------------------------------------------------
// Player specifications
// ----------------------------------------------------------------------------
// 'mid'    -> current production default (MidEvaluator with the mobility fix)
// 'legacy' -> frozen pre-fix production eval (buggy mobility frame); kept as an
//             immutable A/B baseline so we can always reproduce past deltas.
// 'random' -> uniformly random legal moves (sanity baseline)
type EvaluatorName = 'mid' | 'legacy' | 'random';

interface PlayerSpec {
  name: string;
  evaluator: EvaluatorName;
  difficulty: Difficulty;
}

function makeEvaluator(name: EvaluatorName): Evaluator | null {
  switch (name) {
    case 'mid':
      return new MidEvaluator();
    case 'legacy':
      return new MidEvaluator({ mobilityFrameFix: false });
    case 'random':
      return null; // handled by random mover, no engine
    default:
      throw new Error(`Unknown evaluator: ${name}`);
  }
}

/** Pick a move for a player from the given legal moves on `board`. */
function pickMove(
  spec: PlayerSpec,
  board: Board,
  legalMoves: Point[],
  rng: () => number,
): Point {
  if (spec.evaluator === 'random') {
    return legalMoves[Math.floor(rng() * legalMoves.length)];
  }
  const ai = new OthelloAI(spec.difficulty, {
    midEvaluator: makeEvaluator(spec.evaluator) ?? undefined,
  });
  const mv = ai.getBestMove(board);
  // getBestMove returns null only when there are no legal moves, which the
  // caller has already excluded — but guard anyway.
  return mv ?? legalMoves[0];
}

// ----------------------------------------------------------------------------
// Game play
// ----------------------------------------------------------------------------
interface GameResult {
  /** final black - white disc difference */
  discDiff: number;
  plies: number;
}

/** Generate a random opening as a sequence of points from the initial position. */
function randomOpening(plies: number, rng: () => number): Point[] {
  const board = new Board();
  const moves: Point[] = [];
  for (let i = 0; i < plies; i++) {
    const legal = board.getMovablePos();
    if (legal.length === 0) {
      // rare this early; a pass ends the random opening
      break;
    }
    const mv = legal[Math.floor(rng() * legal.length)];
    board.move(mv);
    moves.push(mv);
  }
  return moves;
}

/**
 * Play one full game. `blackPlayer` moves as BLACK, `whitePlayer` as WHITE.
 * The opening move sequence is applied first (deterministically), then the two
 * players take over.
 */
function playGame(
  blackPlayer: PlayerSpec,
  whitePlayer: PlayerSpec,
  opening: Point[],
  rng: () => number,
): GameResult {
  const board = new Board();
  for (const mv of opening) {
    board.move(mv);
  }

  let passStreak = 0;
  while (board.getTurns() < MAX_TURNS) {
    const legal = board.getMovablePos();
    if (legal.length === 0) {
      board.pass();
      passStreak++;
      if (passStreak >= 2) break; // both sides stuck -> game over
      continue;
    }
    passStreak = 0;
    const toMove: Color = board.getCurrentColor();
    const spec = toMove === BLACK ? blackPlayer : whitePlayer;
    const mv = pickMove(spec, board, legal, rng);
    board.move(mv);
  }

  return {
    discDiff: board.countDisc(BLACK) - board.countDisc(WHITE),
    plies: board.getTurns(),
  };
}

// ----------------------------------------------------------------------------
// Match orchestration
// ----------------------------------------------------------------------------
interface MatchStats {
  aWins: number;
  bWins: number;
  draws: number;
  games: number;
  aDiscDiffSum: number; // summed (A discs - B discs) across games
}

function runMatch(
  playerA: PlayerSpec,
  playerB: PlayerSpec,
  numOpenings: number,
  openingPlies: number,
  seed: number,
): MatchStats {
  const stats: MatchStats = { aWins: 0, bWins: 0, draws: 0, games: 0, aDiscDiffSum: 0 };
  const openingRng = mulberry32(seed);
  // A fresh play RNG per game keeps random movers reproducible & independent.
  let gameCounter = 0;

  for (let o = 0; o < numOpenings; o++) {
    const opening = randomOpening(openingPlies, openingRng);

    // Game 1: A = Black, B = White
    {
      const rng = mulberry32(seed * 1000003 + gameCounter++);
      const r = playGame(playerA, playerB, opening, rng);
      recordResult(stats, r.discDiff, /*aIsBlack=*/ true);
    }
    // Game 2: A = White, B = Black (same opening, colors swapped)
    {
      const rng = mulberry32(seed * 1000003 + gameCounter++);
      const r = playGame(playerB, playerA, opening, rng);
      recordResult(stats, r.discDiff, /*aIsBlack=*/ false);
    }
  }
  return stats;
}

function recordResult(stats: MatchStats, blackMinusWhite: number, aIsBlack: boolean): void {
  const aDiff = aIsBlack ? blackMinusWhite : -blackMinusWhite;
  stats.games++;
  stats.aDiscDiffSum += aDiff;
  if (aDiff > 0) stats.aWins++;
  else if (aDiff < 0) stats.bWins++;
  else stats.draws++;
}

// ----------------------------------------------------------------------------
// CLI
// ----------------------------------------------------------------------------
function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
      out[key] = val;
    }
  }
  return out;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const aName = (args.a ?? 'mid') as EvaluatorName;
  const bName = (args.b ?? 'mid') as EvaluatorName;
  const difficulty = (args.difficulty ?? 'medium') as Difficulty;
  const numOpenings = parseInt(args.games ?? '20', 10);
  const openingPlies = parseInt(args['opening-plies'] ?? '6', 10);
  const seed = parseInt(args.seed ?? '12345', 10);

  const playerA: PlayerSpec = { name: `A:${aName}`, evaluator: aName, difficulty };
  const playerB: PlayerSpec = { name: `B:${bName}`, evaluator: bName, difficulty };

  console.log(
    `Othello A/B match: A=${aName} vs B=${bName} | difficulty=${difficulty} | ` +
      `${numOpenings} openings x2 = ${numOpenings * 2} games | openingPlies=${openingPlies} | seed=${seed}`,
  );

  // Silence the per-move AI logging during play; restore for reporting.
  const origLog = console.log;
  const t0 = Date.now();
  console.log = () => {};
  const stats = runMatch(playerA, playerB, numOpenings, openingPlies, seed);
  console.log = origLog;
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  const { aWins, bWins, draws, games, aDiscDiffSum } = stats;
  const decisive = aWins + bWins;
  const winRate = decisive > 0 ? (aWins / decisive) * 100 : 50;
  const scoreRate = ((aWins + draws * 0.5) / games) * 100; // draws as half-points
  // Standard error of the score rate (Bernoulli approx), for a rough CI.
  const p = scoreRate / 100;
  const se = Math.sqrt((p * (1 - p)) / games) * 100;

  console.log('');
  console.log(`Games: ${games} | time: ${elapsed}s`);
  console.log(`A wins: ${aWins} | B wins: ${bWins} | draws: ${draws}`);
  console.log(`A win rate (decisive only): ${winRate.toFixed(1)}%`);
  console.log(`A score rate (draws=0.5):   ${scoreRate.toFixed(1)}% ± ${se.toFixed(1)}% (1σ)`);
  console.log(`A avg disc margin: ${(aDiscDiffSum / games).toFixed(2)} discs/game`);
}

main();
