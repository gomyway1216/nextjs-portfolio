/**
 * Riichi Mahjong — legal action enumeration.
 *
 * `gameState.ts` owns the transitions; this module owns the question "what may
 * seat X do right now?". Keeping the two apart means the state machine has a
 * single validation path (`applyAction` refuses anything
 * {@link legalActions} did not offer) and the AI has a ready-made move list.
 *
 * ## What is enumerated
 *
 * Actions are enumerated by **physical tile**, not by kind, wherever the choice
 * of copy is observable. A hand holding the red 5m plus two ordinary 5m can
 * pon in two materially different ways — melding the red copy or keeping it —
 * and those hands score differently, so both appear as separate
 * {@link PonAction}s. Choices that are genuinely indistinguishable (two
 * ordinary 5m) are collapsed to one entry, so the list never contains two
 * actions that lead to the same position.
 *
 * ## Phases
 *
 * - `discard`: only `state.turn` may act — discard (riichi-flagged or not),
 *   tsumo, ankan, kakan, kyuushu kyuuhai.
 * - `call`: every seat except the discarder may answer — ron, pon, chi (from
 *   the left only), minkan, pass. A kakan in flight (`pendingDiscard.chankan`)
 *   offers only ron (chankan) and pass; an ankan is never robbable in v1.
 * - `draw` / `ended`: nobody acts. `draw` is transient — the engine always
 *   draws for the player before handing control back.
 *
 * Like the rest of `engine/`, nothing here touches React or the DOM.
 */

import { isFuriten } from './furiten';
import { riichiCost, MAX_KAN_COUNT } from './rules';
import { isComplete, isTenpai, waits } from './shanten';
import {
  isHonor,
  isRedFive,
  kindOf,
  rankOf,
  sortTiles,
  tilesToCounts,
  YAOCHUU_KINDS,
} from './tiles';
import {
  isMenzen,
  type Action,
  type ChiAction,
  type DiscardAction,
  type Meld,
  type MinkanAction,
  type PlayerState,
  type PonAction,
  type RoundState,
  type Rules,
  type Seat,
  type TileId,
  type TileKind,
  type Wind,
} from './types';
import { isExhausted } from './wall';
import { evaluateHand, hasYaku, makeWinContext, type WinContext } from './yaku';

/** Minimum distinct terminal/honour kinds needed to abort with kyuushu kyuuhai. */
export const KYUUSHU_MIN_KINDS = 9;

// ---------------------------------------------------------------------------
// Win contexts
// ---------------------------------------------------------------------------

/** Seat wind of `seat`: East for the dealer, then South/West/North clockwise. */
export function seatWindOf(state: RoundState, seat: Seat): Wind {
  return (((seat - state.dealer) % 4) + 4) % 4 as Wind;
}

/**
 * Build the {@link WinContext} for a win that is happening *right now*.
 *
 * Every situational flag is derived from the round rather than passed in, so
 * `legalActions` (deciding whether a win has a yaku) and `applyAction`
 * (scoring it) can never disagree about, say, whether a tile was the haitei:
 *
 * - `rinshan` — the tile in hand came off the dead wall after a kan.
 * - `haitei` — a tsumo of the very last live tile. A rinshan draw is *not* a
 *   haitei even when the live wall is empty: the tile came from the dead wall.
 * - `houtei` — a ron on the final discard. A chankan is never a houtei.
 * - `tenhou` / `chiihou` — a tsumo on the player's very first draw with no
 *   call anywhere in between (`firstGoAround`).
 *
 * For a ron the winning tile is appended to a copy of the hand; the player's
 * own tiles are never mutated.
 */
export function buildWinContext(
  state: RoundState,
  seat: Seat,
  winTile: TileId,
  isTsumo: boolean,
): WinContext {
  const player = state.players[seat];
  const chankan = !isTsumo && state.pendingDiscard?.chankan === true;
  const hand = isTsumo
    ? [...player.hand]
    : sortTiles([...player.hand, winTile]);
  const firstDraw =
    state.firstGoAround && player.discards.length === 0 && state.lastDrawSource === 'wall';

  return makeWinContext({
    hand,
    melds: player.melds,
    winTile,
    isTsumo,
    seatWind: seatWindOf(state, seat),
    roundWind: state.roundWind,
    riichi: player.riichi !== null,
    doubleRiichi: player.riichi?.double === true,
    ippatsu: state.rules.ippatsu && player.ippatsu,
    chankan,
    rinshan: isTsumo && state.lastDrawSource === 'rinshan',
    // Haitei and houtei are deliberately asymmetric. Haitei raoyue is winning
    // on *the last tile drawn from the live wall*, so a replacement tile never
    // qualifies — that win is rinshan kaihou instead, which is why this checks
    // `lastDrawSource === 'wall'`. Houtei raoyui is winning on *the last
    // discard of the hand*, and the discard that follows a replacement draw is
    // still the last discard once the live wall is empty, so it correctly does
    // not exclude rinshan.
    haitei: isTsumo && state.lastDrawSource === 'wall' && isExhausted(state.wall),
    houtei: !isTsumo && !chankan && isExhausted(state.wall),
    tenhou: isTsumo && seat === state.dealer && state.turnCount === 0 && firstDraw,
    chiihou: isTsumo && seat !== state.dealer && firstDraw,
    doraIndicators: state.wall.doraIndicators,
    uraIndicators: state.wall.uraIndicators,
    rules: state.rules,
  });
}

/** True when `seat` may declare a win on `winTile` — complete shape *and* a yaku. */
function winIsScorable(
  state: RoundState,
  seat: Seat,
  winTile: TileId,
  isTsumo: boolean,
): boolean {
  const ctx = buildWinContext(state, seat, winTile, isTsumo);
  return hasYaku(evaluateHand(ctx, seat === state.dealer));
}

// ---------------------------------------------------------------------------
// Tile choice helpers
// ---------------------------------------------------------------------------

/**
 * Group key for "tiles the player cannot tell apart". Two ordinary 5m are
 * interchangeable; the red 5m is not, because melding or discarding it changes
 * the hand's dora count.
 */
function tileClass(tile: TileId, rules: Rules): number {
  return kindOf(tile) * 2 + (rules.redFives && isRedFive(tile) ? 1 : 0);
}

/** Concealed tiles of one kind, ascending (the red copy sorts first). */
function heldOfKind(player: PlayerState, kind: TileKind): TileId[] {
  return player.hand.filter((tile) => kindOf(tile) === kind);
}

/** Every distinct pair of tiles from `tiles`, deduplicated by red content. */
function distinctPairs(tiles: readonly TileId[], rules: Rules): [TileId, TileId][] {
  const seen = new Set<string>();
  const out: [TileId, TileId][] = [];
  for (let i = 0; i < tiles.length; i += 1) {
    for (let j = i + 1; j < tiles.length; j += 1) {
      const pair: [TileId, TileId] = [tiles[i], tiles[j]];
      const key = pair.map((t) => tileClass(t, rules)).join('/');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(pair);
    }
  }
  return out;
}

/** Every distinct combination of one tile from each of two kinds (for chi). */
function distinctCross(
  first: readonly TileId[],
  second: readonly TileId[],
  rules: Rules,
): [TileId, TileId][] {
  const seen = new Set<string>();
  const out: [TileId, TileId][] = [];
  for (const a of first) {
    for (const b of second) {
      const pair = sortTiles([a, b]) as [TileId, TileId];
      const key = pair.map((t) => tileClass(t, rules)).join('/');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(pair);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Turn actions
// ---------------------------------------------------------------------------

/**
 * Distinct tiles the player may discard. A player who has declared riichi is
 * locked to tsumogiri — the tile they have just drawn, and nothing else.
 */
export function discardChoices(state: RoundState, seat: Seat): TileId[] {
  const player = state.players[seat];
  if (player.riichi !== null) {
    return player.drawn === null ? [] : [player.drawn];
  }
  const seen = new Set<number>();
  const out: TileId[] = [];
  for (const tile of player.hand) {
    const key = tileClass(tile, state.rules);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tile);
  }
  return out;
}

/**
 * Whether a riichi declaration is possible at all this turn, ignoring which
 * tile would be discarded: closed hand, not already declared, enough points
 * for the stick, and at least one live tile left to draw afterwards.
 */
function canDeclareRiichi(state: RoundState, player: PlayerState): boolean {
  return (
    player.riichi === null &&
    isMenzen(player.melds) &&
    player.score >= riichiCost(state.rules) &&
    !isExhausted(state.wall)
  );
}

/** A kan needs an unused dora indicator and a dead-wall tile to replace it. */
function canKanAtAll(state: RoundState): boolean {
  return state.kanCount < MAX_KAN_COUNT && !isExhausted(state.wall);
}

/**
 * Kinds the player may ankan.
 *
 * A player in riichi is far more restricted: the kan must use the tile they
 * have just drawn (the hand is otherwise frozen), and it must leave the wait
 * *exactly* as it was — compared by running {@link waits} on the hand before
 * and after the kan.
 */
export function ankanKinds(state: RoundState, seat: Seat): TileKind[] {
  if (!canKanAtAll(state)) return [];
  const player = state.players[seat];
  if (player.drawn === null) return [];

  const counts = tilesToCounts(player.hand);
  const out: TileKind[] = [];
  for (let kind = 0; kind < counts.length; kind += 1) {
    if (counts[kind] < 4) continue;
    if (player.riichi !== null) {
      if (kindOf(player.drawn) !== kind) continue;
      if (!ankanKeepsWait(player, kind)) continue;
    }
    out.push(kind);
  }
  return out;
}

/** True when melding all four `kind` leaves the waiting hand's waits untouched. */
function ankanKeepsWait(player: PlayerState, kind: TileKind): boolean {
  if (player.drawn === null) return false;
  const drawn = player.drawn;
  const before = tilesToCounts(player.hand.filter((tile) => tile !== drawn));
  const after = tilesToCounts(player.hand.filter((tile) => kindOf(tile) !== kind));
  const meldCount = player.melds.length;
  const beforeWaits = waits(before, meldCount).join(',');
  const afterWaits = waits(after, meldCount + 1).join(',');
  return beforeWaits === afterWaits;
}

/**
 * Tiles the player may add to one of their own pon melds (kakan). Never
 * available after a riichi declaration: the hand is frozen and only an ankan
 * that preserves the wait is tolerated.
 */
export function kakanTiles(state: RoundState, seat: Seat): TileId[] {
  if (!canKanAtAll(state)) return [];
  const player = state.players[seat];
  if (player.riichi !== null) return [];
  const ponKinds = new Set<TileKind>(
    player.melds
      .filter((meld) => meld.type === 'pon')
      .map((meld) => kindOf(meld.tiles[0])),
  );
  if (ponKinds.size === 0) return [];
  return player.hand.filter((tile) => ponKinds.has(kindOf(tile)));
}

/**
 * Kyuushu kyuuhai: on the player's very first draw, with no call having
 * interrupted the go-around, a hand holding at least
 * {@link KYUUSHU_MIN_KINDS} distinct terminal/honour kinds may abort the hand.
 */
export function canKyuushu(state: RoundState, seat: Seat): boolean {
  const player = state.players[seat];
  if (!state.rules.kyuushuKyuuhai) return false;
  if (!state.firstGoAround) return false;
  if (player.discards.length > 0) return false;
  if (player.melds.length > 0) return false;
  if (player.drawn === null) return false;
  const counts = tilesToCounts(player.hand);
  let distinct = 0;
  for (const kind of YAOCHUU_KINDS) if (counts[kind] > 0) distinct += 1;
  return distinct >= KYUUSHU_MIN_KINDS;
}

function turnActions(state: RoundState, seat: Seat): Action[] {
  const player = state.players[seat];
  const out: Action[] = [];

  if (player.drawn !== null && isComplete(tilesToCounts(player.hand), player.melds.length)) {
    if (winIsScorable(state, seat, player.drawn, true)) {
      out.push({ type: 'tsumo', seat });
    }
  }

  const riichiPossible = canDeclareRiichi(state, player);
  const meldCount = player.melds.length;
  for (const tile of discardChoices(state, seat)) {
    const discard: DiscardAction = { type: 'discard', seat, tile };
    out.push(discard);
    if (!riichiPossible) continue;
    const counts = tilesToCounts(player.hand.filter((held) => held !== tile));
    if (isTenpai(counts, meldCount)) {
      out.push({ type: 'discard', seat, tile, riichi: true });
    }
  }

  for (const kind of ankanKinds(state, seat)) {
    out.push({ type: 'ankan', seat, kind });
  }
  for (const tile of kakanTiles(state, seat)) {
    out.push({ type: 'kakan', seat, tile });
  }
  if (canKyuushu(state, seat)) out.push({ type: 'kyuushu', seat });

  return out;
}

// ---------------------------------------------------------------------------
// Response actions
// ---------------------------------------------------------------------------

/** True when `seat` may ron the pending tile: shape, yaku and furiten all pass. */
export function canRon(state: RoundState, seat: Seat): boolean {
  const pending = state.pendingDiscard;
  if (pending === null || pending.seat === seat) return false;
  const player = state.players[seat];
  if (player.hand.length !== 13 - 3 * player.melds.length) return false;
  const counts = tilesToCounts(player.hand);
  const kind = kindOf(pending.tile);
  counts[kind] += 1;
  if (!isComplete(counts, player.melds.length)) return false;
  if (isFuriten(player, state)) return false;
  return winIsScorable(state, seat, pending.tile, false);
}

function chiChoices(state: RoundState, seat: Seat): [TileId, TileId][] {
  const pending = state.pendingDiscard;
  if (pending === null) return [];
  const player = state.players[seat];
  const kind = kindOf(pending.tile);
  if (isHonor(kind)) return [];

  const rank = rankOf(kind);
  const out: [TileId, TileId][] = [];
  const offsets: [number, number][] = [
    [-2, -1],
    [-1, 1],
    [1, 2],
  ];
  for (const [a, b] of offsets) {
    if (rank + a < 1 || rank + a > 9 || rank + b < 1 || rank + b > 9) continue;
    const first = heldOfKind(player, kind + a);
    const second = heldOfKind(player, kind + b);
    if (first.length === 0 || second.length === 0) continue;
    out.push(...distinctCross(first, second, state.rules));
  }
  return out;
}

function responseActions(state: RoundState, seat: Seat): Action[] {
  const pending = state.pendingDiscard;
  if (pending === null) return [];
  if (pending.seat === seat) return [];
  if (state.pendingResponses.includes(seat)) return [];

  const out: Action[] = [];
  if (canRon(state, seat)) out.push({ type: 'ron', seat });

  // A kan in flight can only be robbed, never called on.
  if (!pending.chankan) {
    const player = state.players[seat];
    // Riichi locks the hand: no melds, only ron.
    if (player.riichi === null && !isExhausted(state.wall)) {
      const kind = kindOf(pending.tile);
      const held = heldOfKind(player, kind);

      for (const tiles of distinctPairs(held, state.rules)) {
        const pon: PonAction = { type: 'pon', seat, tiles };
        out.push(pon);
      }
      if (held.length >= 3 && canKanAtAll(state)) {
        const tiles = sortTiles(held.slice(0, 3)) as [TileId, TileId, TileId];
        const minkan: MinkanAction = { type: 'minkan', seat, tiles };
        out.push(minkan);
      }
      // Chi only from the caller's kamicha — the seat that plays immediately
      // before the caller. Turn order is ascending mod 4, so the caller's
      // kamicha is `seat - 1` and, equivalently, the caller is the
      // discarder's shimocha. During a call phase `state.turn` is still the
      // discarder, hence the test below.
      if (state.turn === ((seat + 3) % 4)) {
        for (const tiles of chiChoices(state, seat)) {
          const chi: ChiAction = { type: 'chi', seat, tiles };
          out.push(chi);
        }
      }
    }
  }

  out.push({ type: 'pass', seat });
  return out;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Every action `seat` may legally take in the current position.
 *
 * In `call` phase a seat with nothing to claim still gets a lone `pass`, so a
 * UI can always offer "skip"; {@link RoundState.pendingResponses} makes the
 * second call from the same seat return `[]`. `gameState.currentActors` is the
 * narrower question of whose answer the engine is actually waiting for.
 */
export function legalActions(state: RoundState, seat: Seat): Action[] {
  if (state.phase === 'discard') {
    return state.turn === seat ? turnActions(state, seat) : [];
  }
  if (state.phase === 'call') return responseActions(state, seat);
  return [];
}

/** Structural equality for two actions of the same seat. */
export function sameAction(a: Action, b: Action): boolean {
  if (a.type !== b.type || a.seat !== b.seat) return false;
  switch (a.type) {
    case 'discard': {
      const other = b as DiscardAction;
      return a.tile === other.tile && (a.riichi === true) === (other.riichi === true);
    }
    case 'chi':
    case 'pon':
    case 'minkan': {
      const other = b as ChiAction | PonAction | MinkanAction;
      return (
        a.tiles.length === other.tiles.length &&
        a.tiles.every((tile, i) => tile === other.tiles[i])
      );
    }
    case 'ankan':
      return a.kind === (b as { kind: TileKind }).kind;
    case 'kakan':
      return a.tile === (b as { tile: TileId }).tile;
    default:
      return true;
  }
}

/** True when `action` appears in {@link legalActions} for its own seat. */
export function isLegalAction(state: RoundState, action: Action): boolean {
  return legalActions(state, action.seat).some((legal) => sameAction(legal, action));
}

/** Build the meld a call action produces. Exported for `gameState.ts`. */
export function meldFromCall(
  action: ChiAction | PonAction | MinkanAction,
  calledTile: TileId,
  fromSeat: Seat,
): Meld {
  const type = action.type === 'chi' ? 'chi' : action.type === 'pon' ? 'pon' : 'minkan';
  return {
    type,
    tiles: sortTiles([...action.tiles, calledTile]),
    calledTile,
    fromSeat,
  };
}
