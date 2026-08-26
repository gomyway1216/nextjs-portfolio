/**
 * Riichi Mahjong — random-play smoke test.
 *
 * Plays whole games with every seat choosing uniformly at random from
 * `legalActions`, and re-checks the engine's structural invariants **after
 * every single action**. It is the mahjong equivalent of the shogi perft
 * harness: it proves nothing about strength, but any bookkeeping mistake in
 * the state machine (a tile duplicated by a call, a riichi stick created
 * twice, a hand left the wrong size after a kan, a position where nobody can
 * move) shows up within a few thousand hands.
 *
 * Usage:
 *
 *     node -r tsx/cjs scripts/mahjong-sim-smoke.ts --hands=5000 --seed=1
 *
 * `package.json` is byte-sealed for this repository, so there is deliberately
 * no npm script wrapper. `tests/unit/components/game/Mahjong/gameState.test.ts`
 * imports {@link runSmoke} to run a smaller budget inside vitest.
 *
 * Exits non-zero and prints the offending hand and action index on the first
 * violation.
 */

import {
  advanceHand,
  applyAction,
  currentActors,
  startGame,
} from '../src/components/game/Mahjong/engine/gameState';
import { legalActions } from '../src/components/game/Mahjong/engine/actions';
import { createRng, type Rng } from '../src/components/game/Mahjong/engine/random';
import { DEFAULT_RULES } from '../src/components/game/Mahjong/engine/rules';
import { shanten } from '../src/components/game/Mahjong/engine/shanten';
import { tilesToCounts } from '../src/components/game/Mahjong/engine/tiles';
import {
  TILE_COUNT,
  type Action,
  type DiscardAction,
  type GameState,
  type RoundState,
  type Rules,
  type Seat,
  type TileId,
} from '../src/components/game/Mahjong/engine/types';

/** Hard stop per hand; a real hand never needs anywhere near this many plies. */
const MAX_ACTIONS_PER_HAND = 2000;
/** Hard stop per game; dealer repeats are unbounded in v1 (no agari-yame). */
const MAX_HANDS_PER_GAME = 60;

export interface SmokeOptions {
  /** Number of hands to play in total. */
  hands: number;
  seed: number | string;
  rules?: Rules;
}

export interface SmokeSummary {
  hands: number;
  games: number;
  actions: number;
  tsumo: number;
  ron: number;
  multiRon: number;
  exhaustiveDraws: number;
  kyuushuDraws: number;
  riichiDeclarations: number;
  kans: number;
  calls: number;
}

// ---------------------------------------------------------------------------
// Invariants
// ---------------------------------------------------------------------------

/**
 * Every tile id `0..135`, gathered from where it physically is:
 *
 * - still in the wall — any index at or after `drawIndex` that has not been
 *   handed out as a replacement tile (the dead wall slots and the tiles the
 *   kans pushed out of the live end are all still sitting there);
 * - in a concealed hand;
 * - in a meld;
 * - face up in a pond, unless that discard was claimed into a meld, in which
 *   case the meld already accounts for it.
 */
function locateTiles(state: RoundState): TileId[] {
  const { wall } = state;
  const tiles: TileId[] = [];

  const takenReplacements = new Set<number>();
  for (let n = 0; n < wall.rinshanDrawn; n += 1) takenReplacements.add(135 - n);
  for (let i = wall.drawIndex; i < wall.tiles.length; i += 1) {
    if (takenReplacements.has(i)) continue;
    tiles.push(wall.tiles[i]);
  }

  const inMelds = new Set<TileId>();
  for (const player of state.players) {
    for (const meld of player.melds) for (const tile of meld.tiles) inMelds.add(tile);
  }

  for (const player of state.players) {
    tiles.push(...player.hand);
    for (const meld of player.melds) tiles.push(...meld.tiles);
    for (const entry of player.discards) {
      if (!inMelds.has(entry.tile)) tiles.push(entry.tile);
    }
  }
  return tiles;
}

function checkTileConservation(state: RoundState): void {
  const tiles = locateTiles(state);
  if (tiles.length !== TILE_COUNT) {
    throw new Error(
      `tile conservation: found ${tiles.length} tiles, expected ${TILE_COUNT}`,
    );
  }
  const seen = new Uint8Array(TILE_COUNT);
  for (const tile of tiles) {
    if (tile < 0 || tile >= TILE_COUNT) {
      throw new Error(`tile conservation: tile id ${tile} out of range`);
    }
    if (seen[tile] > 0) {
      throw new Error(`tile conservation: tile id ${tile} appears more than once`);
    }
    seen[tile] = 1;
  }
}

function checkHandSizes(state: RoundState): void {
  for (const player of state.players) {
    const waiting = 13 - 3 * player.melds.length;
    if (player.hand.length !== waiting && player.hand.length !== waiting + 1) {
      throw new Error(
        `hand size: seat ${player.seat} holds ${player.hand.length} tiles with `
        + `${player.melds.length} melds (expected ${waiting} or ${waiting + 1})`,
      );
    }
    if (player.drawn !== null && !player.hand.includes(player.drawn)) {
      throw new Error(`hand size: seat ${player.seat} lost its drawn tile`);
    }
  }
}

function checkScoreTotal(state: RoundState, expectedTotal: number): void {
  let total = state.riichiSticks * state.rules.riichiStickValue;
  for (const player of state.players) total += player.score;
  if (total !== expectedTotal) {
    throw new Error(
      `score conservation: scores + sticks = ${total}, expected ${expectedTotal}`,
    );
  }
}

function checkActorsHaveActions(state: RoundState): void {
  if (state.phase === 'ended') return;
  for (const seat of currentActors(state)) {
    if (legalActions(state, seat).length === 0) {
      throw new Error(
        `no legal actions for seat ${seat} while the engine waits on it `
        + `(phase ${state.phase})`,
      );
    }
  }
}

/** Run every invariant against the current round. Throws on the first failure. */
export function checkInvariants(state: RoundState, expectedTotal: number): void {
  checkTileConservation(state);
  checkHandSizes(state);
  checkScoreTotal(state, expectedTotal);
  checkActorsHaveActions(state);
}

// ---------------------------------------------------------------------------
// Random play
// ---------------------------------------------------------------------------

/**
 * How a seat picks from `legalActions`.
 *
 * - `random` is the honest fuzz: uniform over everything legal. It reaches
 *   strange positions (chi from a two-meld hand, kan chains, kyuushu) but
 *   almost never completes a hand, so it barely exercises scoring.
 * - `greedy` takes any win, declares riichi when offered, otherwise discards
 *   whatever keeps shanten lowest, and usually passes on calls to stay
 *   closed. That reaches tsumo/ron/riichi/chankan/haitei constantly.
 *
 * One eighth of `greedy` decisions fall back to uniform random so that kans,
 * kyuushu and odd calls still show up along the way. Games alternate between
 * the two policies, so a run covers both.
 */
export type SmokePolicy = 'random' | 'greedy';

function chooseAction(
  state: RoundState,
  seat: Seat,
  choices: readonly Action[],
  rng: Rng,
  policy: SmokePolicy,
): Action {
  if (policy === 'random' || rng.nextInt(8) === 0) {
    return choices[rng.nextInt(choices.length)];
  }

  const win = choices.find((a) => a.type === 'tsumo' || a.type === 'ron');
  if (win !== undefined) return win;

  const riichi = choices.filter((a) => a.type === 'discard' && a.riichi === true);
  if (riichi.length > 0) return riichi[rng.nextInt(riichi.length)];

  const discards = choices.filter(
    (a): a is DiscardAction => a.type === 'discard',
  );
  if (discards.length > 0) {
    const player = state.players[seat];
    const meldCount = player.melds.length;
    let best = Number.POSITIVE_INFINITY;
    let bestActions: DiscardAction[] = [];
    for (const action of discards) {
      const counts = tilesToCounts(
        player.hand.filter((tile) => tile !== action.tile),
      );
      const value = shanten(counts, meldCount);
      if (value < best) {
        best = value;
        bestActions = [action];
      } else if (value === best) {
        bestActions.push(action);
      }
    }
    return bestActions[rng.nextInt(bestActions.length)];
  }

  const pass = choices.find((a) => a.type === 'pass');
  if (pass !== undefined && rng.nextInt(4) !== 0) return pass;
  return choices[rng.nextInt(choices.length)];
}

function emptySummary(): SmokeSummary {
  return {
    hands: 0,
    games: 0,
    actions: 0,
    tsumo: 0,
    ron: 0,
    multiRon: 0,
    exhaustiveDraws: 0,
    kyuushuDraws: 0,
    riichiDeclarations: 0,
    kans: 0,
    calls: 0,
  };
}

function recordResult(state: RoundState, summary: SmokeSummary): void {
  const result = state.result;
  if (result === null) return;
  if (result.agari.length > 0) {
    if (result.agari.length > 1) summary.multiRon += 1;
    for (const win of result.agari) {
      if (win.type === 'tsumo') summary.tsumo += 1;
      else summary.ron += 1;
    }
  }
  if (result.draw?.reason === 'exhaustive') summary.exhaustiveDraws += 1;
  if (result.draw?.reason === 'kyuushu') summary.kyuushuDraws += 1;
  for (const player of state.players) {
    if (player.riichi !== null) summary.riichiDeclarations += 1;
  }
  summary.kans += state.kanCount;
}

function playHand(
  state: RoundState,
  rng: Rng,
  expectedTotal: number,
  summary: SmokeSummary,
  policy: SmokePolicy,
): void {
  checkInvariants(state, expectedTotal);
  let plies = 0;
  while (state.phase !== 'ended') {
    plies += 1;
    if (plies > MAX_ACTIONS_PER_HAND) {
      throw new Error(`hand did not finish within ${MAX_ACTIONS_PER_HAND} actions`);
    }
    const actors = currentActors(state);
    if (actors.length === 0) {
      throw new Error(`no actor to move in phase ${state.phase}`);
    }
    const seat = actors[rng.nextInt(actors.length)];
    const choices = legalActions(state, seat);
    if (choices.length === 0) {
      throw new Error(`seat ${seat} has no legal action in phase ${state.phase}`);
    }
    const action = chooseAction(state, seat, choices, rng, policy);
    if (action.type === 'chi' || action.type === 'pon' || action.type === 'minkan') {
      summary.calls += 1;
    }
    applyAction(state, action);
    summary.actions += 1;
    checkInvariants(state, expectedTotal);
  }
  recordResult(state, summary);
}

/**
 * Play `options.hands` hands of random legal mahjong, checking invariants
 * after every action. Throws on the first violation; returns play statistics
 * otherwise.
 */
export function runSmoke(options: SmokeOptions): SmokeSummary {
  const rules = options.rules ?? DEFAULT_RULES;
  const rng = createRng(options.seed);
  const summary = emptySummary();
  const expectedTotal = rules.startingScore * 4;

  while (summary.hands < options.hands) {
    let game: GameState = startGame({ rules, rng });
    const policy: SmokePolicy = summary.games % 2 === 0 ? 'random' : 'greedy';
    summary.games += 1;
    let handsThisGame = 0;

    while (!game.finished && summary.hands < options.hands) {
      const round = game.round;
      if (round === null) throw new Error('game has no round to play');
      try {
        playHand(round, rng, expectedTotal, summary, policy);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
          `hand ${summary.hands + 1} (game ${summary.games}, action `
          + `${summary.actions}): ${message}`,
        );
      }
      summary.hands += 1;
      handsThisGame += 1;

      game = advanceHand(game, rng);
      if (handsThisGame >= MAX_HANDS_PER_GAME) break;
    }
  }
  return summary;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): { hands: number; seed: number | string } {
  let hands = 1000;
  let seed: number | string = 1;
  for (const arg of argv) {
    const handsMatch = /^--hands=(\d+)$/.exec(arg);
    if (handsMatch) {
      hands = Number(handsMatch[1]);
      continue;
    }
    const seedMatch = /^--seed=(.+)$/.exec(arg);
    if (seedMatch) {
      const raw = seedMatch[1];
      seed = /^\d+$/.test(raw) ? Number(raw) : raw;
      continue;
    }
    if (arg.startsWith('--')) {
      throw new Error(`Unknown flag ${arg} (expected --hands=N or --seed=S)`);
    }
  }
  if (!Number.isInteger(hands) || hands <= 0) {
    throw new Error(`--hands must be a positive integer, got ${hands}`);
  }
  return { hands, seed };
}

function main(): void {
  const { hands, seed } = parseArgs(process.argv.slice(2));
  const started = Date.now();
  let summary: SmokeSummary;
  try {
    summary = runSmoke({ hands, seed });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`mahjong-sim-smoke FAILED (seed ${seed}): ${message}\n`);
    process.exit(1);
    return;
  }
  const seconds = (Date.now() - started) / 1000;
  process.stdout.write(
    [
      `mahjong-sim-smoke OK  seed=${seed}`,
      `  hands            ${summary.hands}`,
      `  games            ${summary.games}`,
      `  actions          ${summary.actions}`,
      `  tsumo / ron      ${summary.tsumo} / ${summary.ron} (multi-ron ${summary.multiRon})`,
      `  exhaustive draws ${summary.exhaustiveDraws}`,
      `  kyuushu draws    ${summary.kyuushuDraws}`,
      `  riichi declared  ${summary.riichiDeclarations}`,
      `  kans / calls     ${summary.kans} / ${summary.calls}`,
      `  elapsed          ${seconds.toFixed(2)}s`,
      '',
    ].join('\n'),
  );
}

const invokedDirectly =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  typeof process.argv[1] === 'string' &&
  /mahjong-sim-smoke\.[cm]?ts$/.test(process.argv[1]);

if (invokedDirectly) main();
