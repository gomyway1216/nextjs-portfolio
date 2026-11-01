/**
 * Blokus AI self-play harness.
 *
 *   node -r tsx/cjs scripts/blokus-ai-match.ts --a expert --b hard --games 100 --mode classic --seed 1
 *
 * Classic plays A and B on alternating seats (ABAB, then BABA from the same
 * seed), so seat order cannot favour either. Duo plays each seed twice, once
 * with each arm moving first. `--players 2` plays classic as two sides of two
 * colours; `--players 3` seats A against two Bs round the shared colour, and an
 * even split is then 33%, and A takes each seat in turn. A share counts the games an arm wins, with ties split; `--no-time` drops the clock so only the node budget stops a search,
 * which makes a run reproducible. Every colour's first piece is random, because
 * the upper levels are deterministic and would otherwise replay one game.
 * `--wa`/`--wb` override an arm's evaluation: `--wa reach=0.5,rivals=1`, and
 * `--ba`/`--bb` its search, as width,horizon,sample,milliseconds.
 */
import { BEST_WEIGHTS, budgetFor, chooseMove, seededRandom, type SearchBudget, type Weights } from '../src/components/game/Blokus/ai';
import { PIECES, applyMove, legalMoves, movePiece, newGame, passTurn, scores, type Mode } from '../src/components/game/Blokus/engine';
import { defaultSeating, seatFor, seatScores, sideOf, viewsOf, type Seating } from '../src/components/game/Blokus/seating';
import type { Difficulty } from '../src/components/game/common/types';

const args = process.argv.slice(2);
const option = (name: string, fallback: string): string => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
};
const flag = (name: string): boolean => args.includes(`--${name}`);

const armA = option('a', 'hard') as Difficulty;
const armB = option('b', 'medium') as Difficulty;
const games = Number(option('games', '100'));
const mode = option('mode', 'classic') as Mode;
const seed = Number(option('seed', '1'));
const noTime = flag('no-time');
const players = Number(option('players', '4'));

const parseWeights = (text: string): Weights => {
  const weights = { ...BEST_WEIGHTS };
  for (const pair of text.split(',').filter(Boolean)) {
    const [key, value] = pair.split('=');
    weights[key as keyof Weights] = Number(value);
  }
  return weights;
};
const weightsA = parseWeights(option('wa', ''));
const weightsB = parseWeights(option('wb', ''));

/** `--ba 12,24,6,350`: width, horizon, sample and milliseconds for one arm. */
const parseBudget = (text: string): Partial<SearchBudget> => {
  if (!text) return {};
  const [width, horizon, sample, timeLimitMs] = text.split(',').map(Number);
  return { width, horizon, sample, timeLimitMs };
};
const budgetA = parseBudget(option('ba', ''));
const budgetB = parseBudget(option('bb', ''));

const budget = (level: Difficulty, base: Partial<SearchBudget>): Partial<SearchBudget> | undefined =>
  budgetFor(level) ? { ...base, ...(noTime ? { timeLimitMs: 1e9 } : {}) } : undefined;

interface Result {
  share: number;
  gap: number;
  maxMs: number;
}

const playOne = (seatsOfA: (color: number) => boolean, gameSeed: number): Result => {
  const state = newGame(mode);
  const random = seededRandom(gameSeed);
  for (let color = 0; color < state.rules.colors; color++) {
    const big = legalMoves(state).filter((move) => PIECES[movePiece(move)].size === 5);
    applyMove(state, big[Math.floor(random() * big.length)]);
  }
  let maxMs = 0;
  while (!state.over) {
    const moves = legalMoves(state);
    if (moves.length === 0) {
      passTurn(state);
      continue;
    }
    const level = seatsOfA(state.toMove) ? armA : armB;
    const started = performance.now();
    const weights = seatsOfA(state.toMove) ? weightsA : weightsB;
    const search = budget(level, seatsOfA(state.toMove) ? budgetA : budgetB);
    const move = chooseMove(state, moves, level, { random, budget: search, weights });
    if (level === armA) maxMs = Math.max(maxMs, performance.now() - started);
    applyMove(state, move);
  }
  const all = scores(state);
  const best = Math.max(...all);
  const top = all.flatMap((score, color) => (score === best ? [color] : []));
  const share = top.filter(seatsOfA).length / top.length;
  const ofA = all.filter((_, color) => seatsOfA(color));
  const ofB = all.filter((_, color) => !seatsOfA(color));
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  return { share, gap: mean(ofA) - mean(ofB), maxMs };
};

/** One game of seats: `isA` says which seat is arm A. */
const playSeats = (seating: Seating, isA: (seat: number) => boolean, gameSeed: number): Result => {
  const state = newGame(mode);
  const random = seededRandom(gameSeed);
  const views = viewsOf(seating);
  for (let color = 0; color < state.rules.colors; color++) {
    const big = legalMoves(state).filter((move) => PIECES[movePiece(move)].size === 5);
    applyMove(state, big[Math.floor(random() * big.length)]);
  }
  let maxMs = 0;
  while (!state.over) {
    const moves = legalMoves(state);
    if (moves.length === 0) {
      passTurn(state);
      continue;
    }
    const seat = seatFor(seating, state);
    const level = isA(seat) ? armA : armB;
    const started = performance.now();
    const search = budget(level, isA(seat) ? budgetA : budgetB);
    const move = chooseMove(state, moves, level, { random, budget: search, weights: isA(seat) ? weightsA : weightsB, view: sideOf(seating, seat), views });
    if (isA(seat)) maxMs = Math.max(maxMs, performance.now() - started);
    applyMove(state, move);
  }
  const all = seatScores(seating, state);
  const best = Math.max(...all);
  const top = all.flatMap((score, seat) => (score === best ? [seat] : []));
  const ofA = all.filter((_, seat) => isA(seat));
  const ofB = all.filter((_, seat) => !isA(seat));
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  return { share: top.filter(isA).length / top.length, gap: mean(ofA) - mean(ofB), maxMs };
};

const started = Date.now();
let share = 0;
let gap = 0;
let maxMs = 0;
let played = 0;
const rotations = players === 3 ? [0, 1, 2] : [0, 1];
for (let n = 0; n < games; n += rotations.length) {
  for (const parity of rotations) {
    const seatsOfA = (color: number) => color % 2 === parity;
    const gameSeed = seed * 100_003 + n;
    const result =
      players === 4
        ? playOne(seatsOfA, gameSeed)
        : playSeats(defaultSeating(mode, players), (seat) => seat === parity, gameSeed);
    share += result.share;
    gap += result.gap;
    maxMs = Math.max(maxMs, result.maxMs);
    played += 1;
  }
}
const rate = share / played;
const se = Math.sqrt((rate * (1 - rate)) / played);
console.log(
  `${mode} ${armA} vs ${armB}: A ${(rate * 100).toFixed(1)}% ±${(se * 196).toFixed(1)} of wins, ` +
    `score gap ${(gap / played).toFixed(1)}, ${played} games, slowest A move ${maxMs.toFixed(0)}ms, ${((Date.now() - started) / 1000).toFixed(0)}s`,
);
