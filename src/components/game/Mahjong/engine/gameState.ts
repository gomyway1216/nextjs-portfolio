/**
 * Riichi Mahjong — the round and game state machine.
 *
 * This module owns every transition. `actions.ts` answers "what is legal?",
 * `score.ts` answers "who pays whom?", and everything in between — turn order,
 * call priority, riichi bookkeeping, kan timing, furiten updates, draws and
 * hand progression — lives here.
 *
 * ## Mutation contract
 *
 * {@link applyAction} and {@link advanceHand} **mutate the state they are
 * given and return that same object**. This matches the wall helpers in
 * `wall.ts`, which already mutate in place, and keeps the fuzz harness cheap
 * (no 136-tile copy per ply). Callers that need history — a UI undo stack, an
 * AI search — take an explicit snapshot with {@link cloneRoundState} first.
 * An illegal action throws and leaves the state untouched.
 *
 * ## The turn loop
 *
 * ```
 *   draw ──▶ discard ──▶ call ──┬──▶ (nobody claims) next seat draws
 *             │  ▲              ├──▶ chi/pon ──▶ caller discards
 *             │  │              ├──▶ minkan ──▶ caller draws from the dead wall
 *             │  └── kan ───────┤
 *             │                 └──▶ ron ──▶ ended
 *             └── tsumo / kyuushu ──▶ ended
 * ```
 *
 * `phase === 'draw'` is never observable from outside: {@link startRound} and
 * every transition that hands the turn on perform the draw before returning.
 *
 * ## Response priority
 *
 * A discard is not passed on until every seat the engine is waiting on has
 * answered, because claims are ranked, not first-come:
 *
 * 1. **ron** beats everything. With `rules.doubleRon` every ron is paid; the
 *    winners are ordered head-bump first (closest counter-clockwise from the
 *    discarder), which is what gives `wins[0]` the honba and the riichi
 *    sticks in {@link settleWin}. With double ron off only the head bump wins.
 * 2. **pon / minkan** beat chi. At most one seat can ever hold two copies of
 *    the discarded tile, so these never collide with each other.
 * 3. **chi**, and only from the seat to the caller's left.
 *
 * Once any ron is declared the engine stops waiting on seats that can only
 * pon or chi — their claims could not win anyway.
 *
 * ## Timing rules implemented here
 *
 * - **Riichi**: the 1000 points leave the declarer when the declaration tile
 *   is resolved — uncalled, called, or ronned; a ron on the declaration tile
 *   still collects the stick.
 * - **Ippatsu** is set by the declaration, cleared by any call from any seat
 *   (an ankan included) and by the declarer's own next draw.
 * - **firstGoAround** (double riichi, tenhou, chiihou, kyuushu) is cleared by
 *   any call.
 * - **Kan**: the new dora indicator flips immediately for every kan type — for
 *   a kakan that means *before* the chankan window — then the replacement tile
 *   is drawn and `lastDrawSource` becomes `'rinshan'`. An ankan is never
 *   robbable in v1. A fifth kan is impossible and is refused by the legality
 *   check rather than by the wall throwing.
 * - **Furiten** is refreshed for every seat that let a winning tile go past,
 *   whether they were asked to respond or not.
 *
 * Deliberately not implemented in v1 (see §1 of the development plan):
 * suukaikan, suufon renda, suucha riichi, nagashi mangan, pao, kuikae,
 * agari-yame and sudden-death extensions past East 4 / South 4.
 */

import {
  buildWinContext,
  isLegalAction,
  legalActions,
  meldFromCall,
} from './actions';
import { clearTemporaryFuriten, markIfMissedWin } from './furiten';
import type { Rng } from './random';
import { baseHandCount, riichiCost } from './rules';
import {
  settleAbortiveDraw,
  settleExhaustiveDraw,
  settleWin,
  type Settlement,
  type WinEntry,
} from './score';
import { isTenpai } from './shanten';
import { kindOf, sortTiles, tilesToCounts } from './tiles';
import {
  SEATS,
  type Action,
  type AgariResult,
  type AnkanAction,
  type ChiAction,
  type DiscardAction,
  type DrawResult,
  type GameState,
  type KakanAction,
  type Meld,
  type MinkanAction,
  type PlayerState,
  type PonAction,
  type RoundState,
  type Rules,
  type Seat,
  type TileId,
  type Wind,
} from './types';
import {
  buildWall,
  dealHands,
  drawReplacementTile,
  drawTile,
  isExhausted,
  revealKanDora,
} from './wall';
import { evaluateHand } from './yaku';

// ---------------------------------------------------------------------------
// Round setup
// ---------------------------------------------------------------------------

export interface StartRoundOptions {
  rules: Rules;
  roundWind: Wind;
  /** Seat holding the deal (oya). */
  dealer: Seat;
  honba: number;
  /** Sticks already on the table from earlier hands. */
  riichiSticks: number;
  /** Scores the four seats bring into the hand. */
  scores: readonly [number, number, number, number];
  rng: Rng;
}

function makePlayer(seat: Seat, hand: TileId[], score: number): PlayerState {
  return {
    seat,
    hand,
    drawn: null,
    melds: [],
    discards: [],
    riichi: null,
    score,
    temporaryFuriten: false,
    riichiFuriten: false,
    ippatsu: false,
  };
}

/**
 * Deal a fresh hand and take it up to the dealer's first decision.
 *
 * The returned state is always in `phase === 'discard'` with the dealer
 * holding fourteen tiles — callers never see `phase === 'draw'`.
 */
export function startRound(options: StartRoundOptions): RoundState {
  const wall = buildWall(options.rng);
  const hands = dealHands(wall);
  const players = SEATS.map((seat) =>
    makePlayer(seat, hands[seat], options.scores[seat]),
  ) as [PlayerState, PlayerState, PlayerState, PlayerState];

  const state: RoundState = {
    rules: options.rules,
    roundWind: options.roundWind,
    dealer: options.dealer,
    honba: options.honba,
    riichiSticks: options.riichiSticks,
    wall,
    players,
    turn: options.dealer,
    phase: 'draw',
    pendingDiscard: null,
    pendingResponses: [],
    pendingClaims: [],
    lastDrawSource: null,
    kanCount: 0,
    turnCount: 0,
    firstGoAround: true,
    result: null,
  };

  performDraw(state);
  return state;
}

function cloneMeld(meld: Meld): Meld {
  return { ...meld, tiles: [...meld.tiles] };
}

function clonePlayer(player: PlayerState): PlayerState {
  return {
    ...player,
    hand: [...player.hand],
    melds: player.melds.map(cloneMeld),
    discards: player.discards.map((entry) => ({ ...entry })),
    riichi: player.riichi === null ? null : { ...player.riichi },
  };
}

/**
 * Deep copy of a round, sharing only the immutable `rules` object. Use it
 * before speculative play, since {@link applyAction} mutates.
 */
export function cloneRoundState(state: RoundState): RoundState {
  return {
    ...state,
    wall: {
      ...state.wall,
      tiles: [...state.wall.tiles],
      doraIndicators: [...state.wall.doraIndicators],
      uraIndicators: [...state.wall.uraIndicators],
    },
    players: state.players.map(clonePlayer) as [
      PlayerState,
      PlayerState,
      PlayerState,
      PlayerState,
    ],
    pendingDiscard:
      state.pendingDiscard === null ? null : { ...state.pendingDiscard },
    pendingResponses: [...state.pendingResponses],
    pendingClaims: state.pendingClaims.map((action) => ({ ...action })),
    result:
      state.result === null
        ? null
        : {
          ...state.result,
          agari: state.result.agari.map((entry) => ({ ...entry })),
          draw: state.result.draw === null ? null : { ...state.result.draw },
          scoreDeltas: [...state.result.scoreDeltas] as [
            number,
            number,
            number,
            number,
          ],
        },
  };
}

// ---------------------------------------------------------------------------
// Draws
// ---------------------------------------------------------------------------

function addToHand(player: PlayerState, tile: TileId): void {
  player.hand.push(tile);
  player.hand.sort((a, b) => a - b);
  player.drawn = tile;
}

/** Normal draw from the live wall for the seat whose turn it is. */
function performDraw(state: RoundState): void {
  const player = state.players[state.turn];
  clearTemporaryFuriten(player);
  // Ippatsu survives exactly one go-around: it dies on the declarer's own
  // next draw (and on any call, handled in `breakCallFlags`).
  player.ippatsu = false;
  addToHand(player, drawTile(state.wall));
  state.lastDrawSource = 'wall';
  state.phase = 'discard';
}

/** Replacement draw off the dead wall after a kan. */
function performReplacementDraw(state: RoundState): void {
  const player = state.players[state.turn];
  clearTemporaryFuriten(player);
  addToHand(player, drawReplacementTile(state.wall));
  state.lastDrawSource = 'rinshan';
  state.phase = 'discard';
}

/** Any call (chi, pon, any kan) kills every live ippatsu and the first go-around. */
function breakCallFlags(state: RoundState): void {
  for (const player of state.players) player.ippatsu = false;
  state.firstGoAround = false;
}

// ---------------------------------------------------------------------------
// Whose turn is it
// ---------------------------------------------------------------------------

/** Distance from the discarder in turn order; 1 = shimocha, 3 = kamicha. */
function headBumpOrder(discarder: Seat, seat: Seat): number {
  return (seat - discarder + 4) % 4;
}

/**
 * Seats whose input the engine is waiting on.
 *
 * In `discard` phase that is the single seat holding the tiles. In `call`
 * phase it is every seat with a real claim available — a seat that could only
 * pass is *not* listed, because the engine resolves the discard without it
 * (`legalActions` still offers that seat a `pass`, so a UI can show a skip
 * button for everyone). Once a ron has been declared, seats that can only
 * pon or chi drop out too.
 */
export function currentActors(state: RoundState): Seat[] {
  if (state.phase === 'discard') return [state.turn];
  if (state.phase !== 'call') return [];
  const pending = state.pendingDiscard;
  if (pending === null) return [];

  const ronDeclared = state.pendingClaims.some((claim) => claim.type === 'ron');
  const actors: Seat[] = [];
  for (const seat of SEATS) {
    if (seat === pending.seat) continue;
    if (state.pendingResponses.includes(seat)) continue;
    const claims = legalActions(state, seat).filter((a) => a.type !== 'pass');
    if (claims.length === 0) continue;
    if (ronDeclared && !claims.some((a) => a.type === 'ron')) continue;
    actors.push(seat);
  }
  return actors;
}

// ---------------------------------------------------------------------------
// Discards and responses
// ---------------------------------------------------------------------------

function applyDiscard(state: RoundState, action: DiscardAction): void {
  const player = state.players[action.seat];
  if (action.riichi === true) {
    player.riichi = {
      declaredAtDiscard: player.discards.length,
      declaredAtTurn: state.turnCount,
      double: state.firstGoAround && player.discards.length === 0,
    };
    player.ippatsu = state.rules.ippatsu;
  }

  const index = player.hand.indexOf(action.tile);
  player.hand.splice(index, 1);
  player.discards.push({
    tile: action.tile,
    riichi: action.riichi === true,
    tsumogiri: player.drawn === action.tile,
    calledBy: null,
  });
  player.drawn = null;
  state.turnCount += 1;

  openResponseWindow(state, action.seat, action.tile, false);
}

function openResponseWindow(
  state: RoundState,
  seat: Seat,
  tile: TileId,
  chankan: boolean,
): void {
  state.pendingDiscard = { seat, tile, chankan };
  state.pendingResponses = [];
  state.pendingClaims = [];
  state.phase = 'call';
  if (currentActors(state).length === 0) resolveResponses(state);
}

function applyResponse(state: RoundState, action: Action): void {
  state.pendingResponses.push(action.seat);
  state.pendingClaims.push(action);
  if (currentActors(state).length === 0) resolveResponses(state);
}

/**
 * The riichi stick is created when the declaration tile finishes resolving.
 * That covers all three endings the rules distinguish: passing uncalled,
 * being called, and being ronned (the stick still goes to the winner).
 */
function payPendingRiichi(state: RoundState): void {
  const pending = state.pendingDiscard;
  if (pending === null || pending.chankan) return;
  const player = state.players[pending.seat];
  if (player.riichi === null) return;
  if (player.riichi.declaredAtDiscard !== player.discards.length - 1) return;
  player.score -= riichiCost(state.rules);
  state.riichiSticks += 1;
}

function resolveResponses(state: RoundState): void {
  const pending = state.pendingDiscard;
  if (pending === null) throw new Error('resolveResponses without a pending discard');

  payPendingRiichi(state);

  const ronSeats = state.pendingClaims
    .filter((claim) => claim.type === 'ron')
    .map((claim) => claim.seat)
    .sort(
      (a, b) => headBumpOrder(pending.seat, a) - headBumpOrder(pending.seat, b),
    );
  const winners = state.rules.doubleRon ? ronSeats : ronSeats.slice(0, 1);

  // Anyone who let a winning tile go past is furiten from now on, whether they
  // were asked to respond, chose to pass, or had no yaku to ron with.
  const kind = kindOf(pending.tile);
  for (const seat of SEATS) {
    if (seat === pending.seat) continue;
    if (winners.includes(seat)) continue;
    markIfMissedWin(state.players[seat], kind);
  }

  if (winners.length > 0) {
    finishWithRon(state, winners);
    return;
  }
  if (pending.chankan) {
    completeKakan(state);
    return;
  }

  const call =
    state.pendingClaims.find(
      (claim) => claim.type === 'pon' || claim.type === 'minkan',
    ) ?? state.pendingClaims.find((claim) => claim.type === 'chi');
  if (call !== undefined) {
    executeCall(state, call as ChiAction | PonAction | MinkanAction);
    return;
  }
  passDiscard(state);
}

function clearResponseWindow(state: RoundState): void {
  state.pendingDiscard = null;
  state.pendingResponses = [];
  state.pendingClaims = [];
}

function executeCall(
  state: RoundState,
  action: ChiAction | PonAction | MinkanAction,
): void {
  const pending = state.pendingDiscard;
  if (pending === null) throw new Error('executeCall without a pending discard');

  const discarder = state.players[pending.seat];
  discarder.discards[discarder.discards.length - 1].calledBy = action.seat;

  const player = state.players[action.seat];
  for (const tile of action.tiles) {
    const index = player.hand.indexOf(tile);
    if (index < 0) throw new Error(`Seat ${action.seat} does not hold tile ${tile}`);
    player.hand.splice(index, 1);
  }
  player.melds.push(meldFromCall(action, pending.tile, pending.seat));
  player.drawn = null;

  breakCallFlags(state);
  state.turn = action.seat;
  clearResponseWindow(state);

  if (action.type === 'minkan') {
    state.kanCount += 1;
    revealKanDora(state.wall);
    performReplacementDraw(state);
    return;
  }
  state.lastDrawSource = null;
  state.phase = 'discard';
}

function passDiscard(state: RoundState): void {
  const pending = state.pendingDiscard;
  if (pending === null) throw new Error('passDiscard without a pending discard');
  clearResponseWindow(state);

  if (isExhausted(state.wall)) {
    endExhaustiveDraw(state);
    return;
  }
  state.turn = ((pending.seat + 1) % 4) as Seat;
  performDraw(state);
}

// ---------------------------------------------------------------------------
// Kans
// ---------------------------------------------------------------------------

function applyAnkan(state: RoundState, action: AnkanAction): void {
  const player = state.players[action.seat];
  const tiles = sortTiles(player.hand.filter((tile) => kindOf(tile) === action.kind));
  player.hand = player.hand.filter((tile) => kindOf(tile) !== action.kind);
  player.melds.push({
    type: 'ankan',
    tiles,
    calledTile: null,
    fromSeat: null,
  });
  player.drawn = null;

  state.kanCount += 1;
  breakCallFlags(state);
  revealKanDora(state.wall);
  // An ankan is never robbable in v1, so the turn continues straight away.
  performReplacementDraw(state);
}

function applyKakan(state: RoundState, action: KakanAction): void {
  const player = state.players[action.seat];
  const kind = kindOf(action.tile);
  const meld = player.melds.find(
    (candidate) => candidate.type === 'pon' && kindOf(candidate.tiles[0]) === kind,
  );
  if (meld === undefined) {
    throw new Error(`Seat ${action.seat} has no pon of kind ${kind} to upgrade`);
  }
  player.hand.splice(player.hand.indexOf(action.tile), 1);
  meld.type = 'kakan';
  meld.tiles = sortTiles([...meld.tiles, action.tile]);
  player.drawn = null;

  state.kanCount += 1;
  breakCallFlags(state);
  // v1 flips the indicator immediately, so a chankan winner sees the new dora.
  revealKanDora(state.wall);
  // The added tile is exposed for chankan before the kan completes.
  openResponseWindow(state, action.seat, action.tile, true);
}

function completeKakan(state: RoundState): void {
  const pending = state.pendingDiscard;
  if (pending === null) throw new Error('completeKakan without a pending kan');
  clearResponseWindow(state);
  state.turn = pending.seat;
  performReplacementDraw(state);
}

// ---------------------------------------------------------------------------
// Endings
// ---------------------------------------------------------------------------

function endRound(
  state: RoundState,
  settlement: Settlement,
  agari: AgariResult[],
  draw: DrawResult | null,
): void {
  const scoreDeltas: [number, number, number, number] = [0, 0, 0, 0];
  const cost = riichiCost(state.rules);
  for (const seat of SEATS) {
    const player = state.players[seat];
    player.score += settlement.deltas[seat];
    // Reported deltas are measured from the start of the hand, so a riichi
    // declared during it shows up as part of the seat's net change.
    scoreDeltas[seat] =
      settlement.deltas[seat] - (player.riichi !== null ? cost : 0);
  }

  state.riichiSticks = settlement.riichiSticksCarried;
  state.result = {
    agari,
    draw,
    scoreDeltas,
    dealerRepeat: settlement.dealerRepeat,
    riichiSticksCarried: settlement.riichiSticksCarried,
    nextHonba: settlement.nextHonba,
  };
  clearResponseWindow(state);
  state.phase = 'ended';
}

function applyTsumo(state: RoundState, seat: Seat): void {
  const player = state.players[seat];
  if (player.drawn === null) throw new Error('Tsumo without a drawn tile');
  const winTile = player.drawn;
  const value = evaluateHand(
    buildWinContext(state, seat, winTile, true),
    seat === state.dealer,
  );
  const settlement = settleWin({
    wins: [{ winner: seat, loser: null, value }],
    dealer: state.dealer,
    honba: state.honba,
    riichiSticks: state.riichiSticks,
    rules: state.rules,
  });
  endRound(
    state,
    settlement,
    [{ type: 'tsumo', winner: seat, loser: null, winTile, value }],
    null,
  );
}

function finishWithRon(state: RoundState, winners: readonly Seat[]): void {
  const pending = state.pendingDiscard;
  if (pending === null) throw new Error('finishWithRon without a pending discard');
  const winTile = pending.tile;
  const loser = pending.seat;

  const wins: WinEntry[] = [];
  const agari: AgariResult[] = [];
  for (const seat of winners) {
    const value = evaluateHand(
      buildWinContext(state, seat, winTile, false),
      seat === state.dealer,
    );
    wins.push({ winner: seat, loser, value });
    agari.push({ type: 'ron', winner: seat, loser, winTile, value });
  }

  if (!pending.chankan) {
    const discarder = state.players[loser];
    discarder.discards[discarder.discards.length - 1].calledBy = winners[0];
  }

  const settlement = settleWin({
    wins,
    dealer: state.dealer,
    honba: state.honba,
    riichiSticks: state.riichiSticks,
    rules: state.rules,
  });
  endRound(state, settlement, agari, null);
}

/** Seats holding a tenpai hand when the live wall runs out. */
export function tenpaiSeatsAt(state: RoundState): Seat[] {
  return SEATS.filter((seat) => {
    const player = state.players[seat];
    if (player.hand.length !== 13 - 3 * player.melds.length) return false;
    return isTenpai(tilesToCounts(player.hand), player.melds.length);
  });
}

function endExhaustiveDraw(state: RoundState): void {
  const tenpaiSeats = tenpaiSeatsAt(state);
  const settlement = settleExhaustiveDraw(
    tenpaiSeats,
    state.dealer,
    state.honba,
    state.riichiSticks,
    state.rules,
  );
  endRound(state, settlement, [], {
    type: 'draw',
    reason: 'exhaustive',
    tenpaiSeats,
  });
}

function applyKyuushu(state: RoundState): void {
  const settlement = settleAbortiveDraw(state.honba, state.riichiSticks);
  endRound(state, settlement, [], {
    type: 'draw',
    reason: 'kyuushu',
    tenpaiSeats: [],
  });
}

// ---------------------------------------------------------------------------
// Action entry point
// ---------------------------------------------------------------------------

function describeAction(action: Action): string {
  return JSON.stringify(action);
}

/**
 * Apply one action. Mutates `state` and returns it; throws when the action is
 * not in {@link legalActions} for its seat.
 */
export function applyAction(state: RoundState, action: Action): RoundState {
  if (state.phase === 'ended') {
    throw new Error(`The hand has ended; ${describeAction(action)} is not playable`);
  }
  if (!isLegalAction(state, action)) {
    throw new Error(`Illegal action in phase ${state.phase}: ${describeAction(action)}`);
  }

  switch (action.type) {
    case 'discard':
      applyDiscard(state, action);
      break;
    case 'tsumo':
      applyTsumo(state, action.seat);
      break;
    case 'ankan':
      applyAnkan(state, action);
      break;
    case 'kakan':
      applyKakan(state, action);
      break;
    case 'kyuushu':
      applyKyuushu(state);
      break;
    case 'ron':
    case 'pon':
    case 'chi':
    case 'minkan':
    case 'pass':
      applyResponse(state, action);
      break;
  }
  return state;
}

// ---------------------------------------------------------------------------
// Game progression
// ---------------------------------------------------------------------------

export interface StartGameOptions {
  rules: Rules;
  rng: Rng;
  /** Starting scores; defaults to `rules.startingScore` for all four seats. */
  scores?: readonly [number, number, number, number];
}

function rankSeats(scores: readonly number[]): Seat[] {
  return [...SEATS].sort((a, b) => {
    if (scores[a] !== scores[b]) return scores[b] - scores[a];
    // Ties are broken by seat order, i.e. by how early the seat took the deal.
    return a - b;
  });
}

/** Wind of hand `handIndex`: East for the first four hands, then South. */
function windOfHand(handIndex: number): Wind {
  return Math.floor(handIndex / 4) as Wind;
}

/**
 * Start a game and deal East 1. Seat 0 always takes the first deal, so the
 * dealer of hand `n` is `n % 4` and the round wind flips to South after four
 * hands.
 */
export function startGame(options: StartGameOptions): GameState {
  const start = options.rules.startingScore;
  const scores: [number, number, number, number] = options.scores
    ? [options.scores[0], options.scores[1], options.scores[2], options.scores[3]]
    : [start, start, start, start];

  const game: GameState = {
    rules: options.rules,
    handIndex: 0,
    roundWind: 0,
    dealer: 0,
    honba: 0,
    riichiSticks: 0,
    scores,
    round: null,
    finished: false,
    placements: null,
  };
  game.round = startRound({
    rules: game.rules,
    roundWind: game.roundWind,
    dealer: game.dealer,
    honba: game.honba,
    riichiSticks: game.riichiSticks,
    scores: game.scores,
    rng: options.rng,
  });
  return game;
}

/**
 * Close the finished hand and move the game on. Mutates `game` and returns it.
 *
 * - The deal repeats on a dealer win and on dealer tenpai at an exhaustive
 *   draw (both already decided by `settleWin` / `settleExhaustiveDraw`), and
 *   on an abortive draw; otherwise it passes to the next seat.
 * - Honba and riichi sticks are carried exactly as the settlement says.
 * - The game ends when the deal passes out of East 4 (tonpuu) or South 4
 *   (hanchan), or immediately on tobi. **There is no sudden-death extension
 *   and no agari-yame in v1**: a dealer who keeps winning East 4 keeps
 *   dealing, and a game that ends with everyone under the return score simply
 *   ends and records placements.
 *
 * `rng` deals the next hand. Omit it to stop after the bookkeeping, leaving
 * `game.round` null for a caller that wants to deal later.
 */
export function advanceHand(game: GameState, rng?: Rng): GameState {
  const round = game.round;
  if (round === null || round.result === null) {
    throw new Error('advanceHand: the current hand has not finished');
  }
  const result = round.result;

  game.scores = [
    round.players[0].score,
    round.players[1].score,
    round.players[2].score,
    round.players[3].score,
  ];
  game.honba = result.nextHonba;
  game.riichiSticks = result.riichiSticksCarried;
  if (!result.dealerRepeat) game.handIndex += 1;
  game.dealer = (game.handIndex % 4) as Seat;
  game.roundWind = windOfHand(game.handIndex);
  game.round = null;

  const busted = game.rules.tobi && game.scores.some((score) => score < 0);
  if (busted || game.handIndex >= baseHandCount(game.rules)) {
    game.finished = true;
    game.placements = rankSeats(game.scores);
    return game;
  }

  if (rng !== undefined) {
    game.round = startRound({
      rules: game.rules,
      roundWind: game.roundWind,
      dealer: game.dealer,
      honba: game.honba,
      riichiSticks: game.riichiSticks,
      scores: game.scores,
      rng,
    });
  }
  return game;
}
