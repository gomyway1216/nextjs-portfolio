/**
 * Riichi Mahjong — core type contract.
 *
 * This file is the single source of truth shared by every engine/AI/UI module.
 * The representations defined here (tile ids, hand shape, wall layout, actions)
 * are frozen: changing them breaks every other module, so extend rather than
 * redefine.
 *
 * Nothing in `engine/` or `ai/` may import React or touch the DOM — these
 * modules are executed directly from Node by the self-play harness in
 * `scripts/`.
 */

// ---------------------------------------------------------------------------
// Tiles
// ---------------------------------------------------------------------------

/**
 * Tile kind: `0..33`.
 *
 * - `0..8`   manzu 1-9  (m)
 * - `9..17`  pinzu 1-9  (p)
 * - `18..26` souzu 1-9  (s)
 * - `27..30` East, South, West, North
 * - `31..33` Haku, Hatsu, Chun
 */
export type TileKind = number;

/**
 * Physical tile id: `0..135`. There are exactly four copies of each kind and
 * `kind = tileId >> 2`. The copy index is `tileId & 3`.
 *
 * Red fives (aka dora) are copy 0 of 5m/5p/5s — see `RED_FIVE_TILE_IDS`.
 */
export type TileId = number;

export type Suit = 'm' | 'p' | 's' | 'z';

/** Number of distinct tile kinds. Hand count arrays always have this length. */
export const TILE_KIND_COUNT = 34;

/** Number of physical tiles in a wall. */
export const TILE_COUNT = 136;

/** Tile ids that are red fives when `rules.redFives` is enabled. */
export const RED_FIVE_TILE_IDS: readonly TileId[] = [16, 52, 88];

/**
 * Concealed-tile histogram, length {@link TILE_KIND_COUNT}, indexed by
 * {@link TileKind}. Shanten/ukeire routines take this shape.
 */
export type TileCounts = Uint8Array;

// ---------------------------------------------------------------------------
// Seats and winds
// ---------------------------------------------------------------------------

/**
 * Absolute seat index `0..3`, fixed for the whole game. Turn order is
 * ascending modulo 4 (seat 0 -> 1 -> 2 -> 3 -> 0), i.e. seat `n + 1` is the
 * shimocha (right-hand / next) player of seat `n`.
 *
 * Seat 0 is always the human player in the UI.
 */
export type Seat = 0 | 1 | 2 | 3;

/** Wind index: 0 = East, 1 = South, 2 = West, 3 = North. */
export type Wind = 0 | 1 | 2 | 3;

export const SEATS: readonly Seat[] = [0, 1, 2, 3];

// ---------------------------------------------------------------------------
// Melds
// ---------------------------------------------------------------------------

export type MeldType = 'chi' | 'pon' | 'minkan' | 'ankan' | 'kakan';

export interface Meld {
  type: MeldType;
  /** Tile ids in the meld, ascending. Length 3 for chi/pon, 4 for any kan. */
  tiles: TileId[];
  /** The claimed tile. `null` for `ankan`. */
  calledTile: TileId | null;
  /** Seat the claimed tile came from. `null` for `ankan`. */
  fromSeat: Seat | null;
}

/** A meld is concealed for menzen purposes only when it is an ankan. */
export function isConcealedMeld(meld: Meld): boolean {
  return meld.type === 'ankan';
}

/** True when the hand has no open melds (ankan does not break menzen). */
export function isMenzen(melds: readonly Meld[]): boolean {
  return melds.every(isConcealedMeld);
}

// ---------------------------------------------------------------------------
// Discards
// ---------------------------------------------------------------------------

export interface DiscardEntry {
  tile: TileId;
  /** This discard was the sideways riichi declaration tile. */
  riichi: boolean;
  /** Discarded straight after drawing it. */
  tsumogiri: boolean;
  /** Seat that claimed this discard (pon/chi/kan/ron), or `null`. */
  calledBy: Seat | null;
}

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------

export interface RiichiState {
  /** Discard index (into the declarer's own pond) of the declaration tile. */
  declaredAtDiscard: number;
  /** Global turn counter when the declaration happened. */
  declaredAtTurn: number;
  /** Declared on the very first uninterrupted go-around. */
  double: boolean;
}

export interface PlayerState {
  seat: Seat;
  /**
   * Concealed tiles, ascending by tile id, melds excluded. Includes the
   * freshly drawn tile while it is in hand, so the length is
   * `13 - 3 * melds.length` before a draw and one more after.
   */
  hand: TileId[];
  /** The tile drawn this turn (also present in `hand`), or `null`. */
  drawn: TileId | null;
  melds: Meld[];
  discards: DiscardEntry[];
  riichi: RiichiState | null;
  score: number;
  /** Temporary furiten: cleared on this player's next draw. */
  temporaryFuriten: boolean;
  /** Permanent (post-riichi missed win) furiten: lasts the whole hand. */
  riichiFuriten: boolean;
  /** Ippatsu is live (set on riichi declaration, cleared by any call or draw). */
  ippatsu: boolean;
}

// ---------------------------------------------------------------------------
// Wall
// ---------------------------------------------------------------------------

/**
 * Wall layout (indices into `tiles`, which is the shuffled 136-tile order):
 *
 * - Live wall: `[drawIndex, liveEnd)`. Dealing and normal draws advance
 *   `drawIndex`; the haitei tile is `tiles[liveEnd - 1]`.
 * - Dead wall slots: indices `122..135` — the fourteen fixed positions holding
 *   the ten indicator tiles and the four replacement tiles. They never move.
 *   Each kan additionally takes one tile out of the live wall, modelled by
 *   decrementing `liveEnd`, so after `k` kans the non-drawable region begins at
 *   `liveEnd = 122 - k`, that is `k` tiles before the fixed slots.
 * - Dora indicator `i` is at index `130 - 2 * i`, ura indicator `i` at
 *   `131 - 2 * i`, for `i` in `0..4`.
 * - Replacement (rinshan) draw `n` (0-based) takes `tiles[135 - n]`.
 */
export interface WallState {
  /** The full shuffled order. Never mutated after deal. */
  tiles: TileId[];
  /** Index of the next live draw. */
  drawIndex: number;
  /** Exclusive end of the live wall; decreases by one per kan. */
  liveEnd: number;
  /** How many replacement tiles have been drawn (0..4). */
  rinshanDrawn: number;
  /** Face-up dora indicators, in reveal order. */
  doraIndicators: TileId[];
  /** Ura indicators matching `doraIndicators`, revealed only on a riichi win. */
  uraIndicators: TileId[];
}

/** First index of the dead wall. */
export const DEAD_WALL_START = 122;
/** Dead wall size. */
export const DEAD_WALL_SIZE = 14;

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type ActionType =
  | 'discard'
  | 'tsumo'
  | 'ron'
  | 'chi'
  | 'pon'
  | 'minkan'
  | 'ankan'
  | 'kakan'
  | 'kyuushu'
  | 'pass';

export interface DiscardAction {
  type: 'discard';
  seat: Seat;
  tile: TileId;
  /** Declare riichi with this discard. */
  riichi?: boolean;
}

export interface TsumoAction {
  type: 'tsumo';
  seat: Seat;
}

export interface RonAction {
  type: 'ron';
  seat: Seat;
}

export interface ChiAction {
  type: 'chi';
  seat: Seat;
  /** The two tiles taken from the caller's own hand, ascending. */
  tiles: [TileId, TileId];
}

export interface PonAction {
  type: 'pon';
  seat: Seat;
  /** The two tiles taken from the caller's own hand, ascending. */
  tiles: [TileId, TileId];
}

export interface MinkanAction {
  type: 'minkan';
  seat: Seat;
  /** The three tiles taken from the caller's own hand, ascending. */
  tiles: [TileId, TileId, TileId];
}

export interface AnkanAction {
  type: 'ankan';
  seat: Seat;
  kind: TileKind;
}

export interface KakanAction {
  type: 'kakan';
  seat: Seat;
  /** The fourth tile added to an existing pon. */
  tile: TileId;
}

export interface KyuushuAction {
  type: 'kyuushu';
  seat: Seat;
}

export interface PassAction {
  type: 'pass';
  seat: Seat;
}

export type Action =
  | DiscardAction
  | TsumoAction
  | RonAction
  | ChiAction
  | PonAction
  | MinkanAction
  | AnkanAction
  | KakanAction
  | KyuushuAction
  | PassAction;

// ---------------------------------------------------------------------------
// Round phases
// ---------------------------------------------------------------------------

/**
 * - `draw`: the player at `turn` must draw (engine-internal, auto-advanced).
 * - `discard`: the player at `turn` holds a drawn tile and must act.
 * - `call`: a discard is on the table; other seats may claim it or pass.
 * - `ended`: `result` is populated.
 */
export type RoundPhase = 'draw' | 'discard' | 'call' | 'ended';

// ---------------------------------------------------------------------------
// Hand value and results
// ---------------------------------------------------------------------------

export type YakuId = string;

export interface YakuEntry {
  id: YakuId;
  han: number;
  /** Yakuman multiplier (1 = single, 2 = double). 0 for normal yaku. */
  yakuman: number;
}

export type LimitName =
  | 'mangan'
  | 'haneman'
  | 'baiman'
  | 'sanbaiman'
  | 'yakuman';

/**
 * Value of a winning hand before honba and riichi sticks are applied.
 */
export interface HandValue {
  yaku: YakuEntry[];
  han: number;
  fu: number;
  /** Total yakuman multiplier; `0` for a normal hand. */
  yakuman: number;
  limit: LimitName | null;
  /** Total points moved to the winner, excluding honba and riichi sticks. */
  points: number;
  /** Non-dealer tsumo payment (dealer pays `tsumoDealer`). `0` for ron. */
  tsumoNonDealer: number;
  tsumoDealer: number;
}

export interface AgariResult {
  type: 'tsumo' | 'ron';
  winner: Seat;
  /** Discarder for ron / chankan; `null` for tsumo. */
  loser: Seat | null;
  winTile: TileId;
  value: HandValue;
}

export type DrawReason =
  | 'exhaustive'
  | 'kyuushu'
  | 'suukaikan'
  | 'suufonrenda'
  | 'suuchariichi';

export interface DrawResult {
  type: 'draw';
  reason: DrawReason;
  /** Seats that were tenpai at an exhaustive draw. */
  tenpaiSeats: Seat[];
}

export interface RoundResult {
  /** One entry per winner (length > 1 only on a double/triple ron). */
  agari: AgariResult[];
  draw: DrawResult | null;
  /** Net score change per seat, including honba and riichi sticks. */
  scoreDeltas: [number, number, number, number];
  /** Whether the dealer keeps the deal. */
  dealerRepeat: boolean;
  /** Riichi sticks carried into the next hand. */
  riichiSticksCarried: number;
  /** Honba count for the next hand. */
  nextHonba: number;
}

// ---------------------------------------------------------------------------
// Round and game state
// ---------------------------------------------------------------------------

export interface PendingDiscard {
  seat: Seat;
  tile: TileId;
  /** True when the tile came from a kakan and may be robbed (chankan). */
  chankan: boolean;
}

export interface RoundState {
  rules: Rules;
  roundWind: Wind;
  /** Seat currently dealing (oya). */
  dealer: Seat;
  honba: number;
  riichiSticks: number;
  wall: WallState;
  players: [PlayerState, PlayerState, PlayerState, PlayerState];
  /** Seat whose turn it is (owner of the pending draw/discard). */
  turn: Seat;
  phase: RoundPhase;
  pendingDiscard: PendingDiscard | null;
  /** Seats that have already responded to `pendingDiscard`. */
  pendingResponses: Seat[];
  /**
   * What each responder chose, parallel to {@link pendingResponses}: entry `i`
   * is the action seat `pendingResponses[i]` declared (`pass` included).
   *
   * Claims cannot be executed the moment they arrive — ron beats pon/kan beats
   * chi, and a double ron needs every ron declared before the payments can be
   * ordered head-bump first — so they are parked here until every seat the
   * engine is waiting on has answered.
   */
  pendingClaims: Action[];
  /** How the tile in hand was obtained; drives rinshan/haitei yaku. */
  lastDrawSource: 'wall' | 'rinshan' | null;
  kanCount: number;
  /** Number of discards made this hand. */
  turnCount: number;
  /** No call has interrupted the first go-around yet (for double riichi etc). */
  firstGoAround: boolean;
  result: RoundResult | null;
}

export interface GameState {
  rules: Rules;
  /** Index of the hand within the game: 0 = East 1. */
  handIndex: number;
  roundWind: Wind;
  dealer: Seat;
  honba: number;
  riichiSticks: number;
  scores: [number, number, number, number];
  round: RoundState | null;
  finished: boolean;
  /** Seats ordered best to worst, populated when `finished`. */
  placements: Seat[] | null;
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

export type GameLength = 'tonpuu' | 'hanchan';

export interface Rules {
  length: GameLength;
  startingScore: number;
  /** Score needed at the end to place; used for uma/oka display only. */
  returnScore: number;
  redFives: boolean;
  ippatsu: boolean;
  uraDora: boolean;
  kanDora: boolean;
  kanUraDora: boolean;
  /** Open tanyao allowed. */
  kuitan: boolean;
  /** Multiple ron on the same discard all pay. */
  doubleRon: boolean;
  kyuushuKyuuhai: boolean;
  /** Game ends when any seat drops below zero. */
  tobi: boolean;
  /** Double yakuman for kokushi 13-wait, suuankou tanki, junsei chuuren. */
  doubleYakuman: boolean;
  /** Counted yakuman at 13+ han. */
  kazoeYakuman: boolean;
  honbaValue: number;
  riichiStickValue: number;
  noTenPenalty: number;
}

// ---------------------------------------------------------------------------
// Shanten / ukeire
// ---------------------------------------------------------------------------

export interface ShantenBreakdown {
  /** Minimum over the three shapes. `-1` means the hand is complete. */
  shanten: number;
  standard: number;
  chiitoitsu: number;
  kokushi: number;
}

export interface UkeireEntry {
  kind: TileKind;
  /** Tiles of this kind not visible to the player. */
  remaining: number;
}

export interface UkeireResult {
  shanten: number;
  tiles: UkeireEntry[];
  /** Sum of `remaining` over `tiles`. */
  total: number;
}

/** Result of evaluating one candidate discard. */
export interface DiscardCandidate {
  tile: TileId;
  shanten: number;
  ukeire: UkeireResult;
}
