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
// 'mid'    -> current production default (mobility fix + corner-relative + frontier)
// 'base'   -> mobility-only eval (corner/frontier off): the pre-cf production
//             eval, i.e. the immediate predecessor baseline for the cf terms.
// 'legacy' -> frozen original eval (buggy mobility frame + no cf); the oldest
//             baseline, so we can always reproduce every past delta.
// 'random' -> uniformly random legal moves (sanity baseline)
type EvaluatorName = 'mid' | 'base' | 'legacy' | 'random';

interface PlayerSpec {
  name: string;
  evaluator: EvaluatorName;
  difficulty: Difficulty;
  /** Optional mid-game search-depth override (for difficulty-ladder A/B). */
  midDepth?: number;
}

function makeEvaluator(name: EvaluatorName): Evaluator | null {
  switch (name) {
    case 'mid':
      return new MidEvaluator();
    case 'base':
      return new MidEvaluator({ cornerRelative: false, frontier: false });
    case 'legacy':
      return new MidEvaluator({ mobilityFrameFix: false, cornerRelative: false, frontier: false });
    case 'random':
      return null; // handled by random mover, no engine
    default:
      throw new Error(`Unknown evaluator: ${name}`);
  }
}

// OthelloAI carries no cross-call state (getBestMove resets everything at the
// top), so a single instance per (evaluator, difficulty) is safe to reuse and
// avoids rebuilding the evaluator's lookup tables on every ply.
const aiCache = new Map<string, OthelloAI>();

function getCachedAI(spec: PlayerSpec): OthelloAI {
  const key = `${spec.evaluator}:${spec.difficulty}:${spec.midDepth ?? 'def'}`;
  let ai = aiCache.get(key);
  if (!ai) {
    ai = new OthelloAI(spec.difficulty, {
      midEvaluator: makeEvaluator(spec.evaluator) ?? undefined,
      midDepthOverride: spec.midDepth,
    });
    aiCache.set(key, ai);
  }
  return ai;
}

/** Apply a move that is expected to be legal; fail fast if it is not. */
function safeMove(board: Board, mv: Point): void {
  if (!board.move(mv)) {
    throw new Error(
      `Illegal move (${mv.x},${mv.y}) at turn ${board.getTurns()} — move generation or AI is broken`,
    );
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
  const mv = getCachedAI(spec).getBestMove(board);
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
    safeMove(board, mv);
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
    safeMove(board, mv);
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
    safeMove(board, mv);
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
  const aDepth = args['a-depth'] ? parseInt(args['a-depth'], 10) : undefined;
  const bDepth = args['b-depth'] ? parseInt(args['b-depth'], 10) : undefined;
  // Per-player difficulty override (for ladder A/B, e.g. expert vs hard).
  const aDiff = (args['a-diff'] ?? difficulty) as Difficulty;
  const bDiff = (args['b-diff'] ?? difficulty) as Difficulty;

  const playerA: PlayerSpec = { name: `A:${aName}`, evaluator: aName, difficulty: aDiff, midDepth: aDepth };
  const playerB: PlayerSpec = { name: `B:${bName}`, evaluator: bName, difficulty: bDiff, midDepth: bDepth };

  console.log(
    `Othello A/B match: A=${aName}[${aDiff}]${aDepth ? `(d${aDepth})` : ''} vs ` +
      `B=${bName}[${bDiff}]${bDepth ? `(d${bDepth})` : ''} | ` +
      `${numOpenings} openings x2 = ${numOpenings * 2} games | openingPlies=${openingPlies} | seed=${seed}`,
  );

  // Silence the per-move AI logging during play; restore for reporting.
  // try/finally guarantees restoration even if a game throws mid-match.
  const origLog = console.log;
  const t0 = Date.now();
  console.log = () => {};
  let stats: MatchStats;
  try {
    stats = runMatch(playerA, playerB, numOpenings, openingPlies, seed);
  } finally {
    console.log = origLog;
  }
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
