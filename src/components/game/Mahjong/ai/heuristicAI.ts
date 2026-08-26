/**
 * Riichi Mahjong — heuristic AI v1: the offensive half and the single
 * decision entry point.
 *
 * {@link chooseAction} is the only thing the rest of the app calls. It is
 * synchronous, deterministic given its {@link Rng}, sub-millisecond, and it is
 * guaranteed to return one of the actions `legalActions(state, seat)` offered
 * — that is asserted before the value leaves the function, because a plausible
 * but illegal action would be rejected by `applyAction` and take the whole
 * round down with it.
 *
 * ## The v1 policy in one paragraph
 *
 * Take any win the engine says is legal. Otherwise, shortlist the discards
 * that do not raise shanten, rank them by acceptance (`ukeire`) with
 * tie-breaks on tile value — dora adjacency, shape retention, and (when
 * anybody looks tenpai) safety. Declare riichi on any menzen tenpai unless the
 * wait is bad *and* the hand is cheap *and* a clear improvement is one draw
 * away. Call only when the call strictly accelerates a hand that still has a
 * yaku afterwards. Fold against a live threat when the hand is 2+ shanten, or
 * tenpai but cheap with a bad wait.
 *
 * ## Thresholds
 *
 * Every number the policy turns on is an exported, named constant in the
 * "Thresholds" section below. M7 replaces the threshold rules with an EV
 * comparison driven by `ai/evTables.ts`; until then these constants are the
 * whole tuning surface, and the baseline harness
 * (`scripts/mahjong-ai-baseline.ts`) is how a change to one of them is judged.
 *
 * ## Rules of the house
 *
 * No React, no DOM, and **never `Math.random`** — every random choice goes
 * through the injected {@link Rng} so the harness and the unit tests replay
 * byte-identically from a seed.
 */

import type { Difficulty } from '../../common/types';
import { legalActions, sameAction } from '../engine/actions';
import type { Rng } from '../engine/random';
import { shanten, waits } from '../engine/shanten';
import {
  isHonor,
  isRedFive,
  kindOf,
  rankOf,
  suitOf,
  tilesToCounts,
  YAOCHUU_KINDS,
} from '../engine/tiles';
import { ukeire } from '../engine/ukeire';
import {
  isMenzen,
  TILE_KIND_COUNT,
  type Action,
  type ChiAction,
  type DiscardAction,
  type Meld,
  type MinkanAction,
  type PonAction,
  type RoundState,
  type Seat,
  type TileCounts,
  type TileId,
  type TileKind,
} from '../engine/types';
import {
  createSafetyContext,
  doraValueOf,
  safestDiscardIn,
  threatSeats,
  weightedDangerIn,
  yakuhaiKinds,
  type SafetyContext,
  type ThreatInfo,
} from './safety';

// ---------------------------------------------------------------------------
// Thresholds — the entire tuning surface of v1. M7 replaces these with EV.
// ---------------------------------------------------------------------------

/** Fold against a live threat once the hand is this far from tenpai. */
export const FOLD_MIN_SHANTEN = 2;
/** A tenpai worth less than this many estimated han counts as "cheap". */
export const FOLD_CHEAP_HAN = 2;
/** A tenpai with fewer live winning tiles than this counts as a "bad wait". */
export const FOLD_BAD_WAIT_TILES = 4;

/** Below this many live winning tiles, a wait is bad enough to consider damaten. */
export const RIICHI_BAD_WAIT_TILES = 4;
/** A tenpai worth less than this many han (riichi excluded) is "cheap". */
export const RIICHI_CHEAP_HAN = 2;
/** Past this many of the seat's own discards, stop waiting for an improvement. */
export const RIICHI_DAMA_MAX_TURN = 9;
/** A draw is only counted as an improvement when this many copies are still live. */
export const RIICHI_IMPROVE_MIN_COPIES = 3;
/** …and only when it widens the wait by at least this many tiles. */
export const RIICHI_IMPROVE_MIN_GAIN = 2;

/** A yakuhai pon is worth making while the hand is still this far out. */
export const CALL_YAKUHAI_MAX_SHANTEN = 3;
/** Any other call has to leave the hand at most this far out. */
export const CALL_MAX_RESULT_SHANTEN = 2;
/** A closed hand this close to tenpai only opens if the call brings it to tenpai. */
export const CALL_MENZEN_PROTECT_SHANTEN = 1;

/** Distinct terminal/honour kinds at which kyuushu is declined for a kokushi run. */
export const KYUUSHU_KEEP_KOKUSHI_KINDS = 11;

/** Points per live acceptance tile when ranking discards. */
export const UKEIRE_WEIGHT = 1;
/** Cost of throwing one dora (indicator dora or a red five). */
export const DORA_KEEP_PENALTY = 6;
/** Cost of breaking a completed triplet. Deliberately larger than any ukeire gain. */
export const SET_BREAK_PENALTY = 40;
/** Cost of breaking a pair — a real block, but a cheap one. */
export const PAIR_KEEP_PENALTY = 2;
/** Bonus for throwing a tile with no neighbours and no partner. */
export const ISOLATED_BONUS = 3;
/** Weight of {@link weightedDangerIn} while pushing (not folding). */
export const DANGER_PUSH_WEIGHT = 0.8;

/** Han credited for a yakuhai triplet when estimating hand value. */
export const HAN_YAKUHAI = 1;
/** Han credited to a menzen hand for the riichi it can still declare. */
export const HAN_MENZEN = 1;
/** Han credited for an all-simples hand. */
export const HAN_TANYAO = 1;
/** Han credited for a one-suit hand (honitsu open / closed is not distinguished). */
export const HAN_FLUSH = 2;

// ---------------------------------------------------------------------------
// Difficulty
// ---------------------------------------------------------------------------

/**
 * What a difficulty level actually changes. Everything not listed here is
 * identical across levels — the v1 policy is one policy.
 */
export interface AiPolicy {
  /** `false` disables threat detection entirely: the AI pushes always. */
  useDefence: boolean;
  /** Pick uniformly from the best N discard candidates. `1` is deterministic. */
  discardRandomTop: number;
  /**
   * Reserved for M7. When the EV push/fold from `ai/evTables.ts` lands it is
   * switched on here and nowhere else, so no call site changes.
   */
  useEvPushFold: boolean;
}

/** Defence off, and the discard chosen at random from the best three. */
export const EASY_POLICY: AiPolicy = {
  useDefence: false,
  discardRandomTop: 3,
  useEvPushFold: false,
};

/** The full v1 policy. */
export const MEDIUM_POLICY: AiPolicy = {
  useDefence: true,
  discardRandomTop: 1,
  useEvPushFold: false,
};

/**
 * Identical to {@link MEDIUM_POLICY} today.
 *
 * It exists as a separate constant so M7 can flip `useEvPushFold` here and
 * attach the EV push/fold without touching a single call site. `expert` and
 * `master` alias to it, so promoting the EV policy promotes all three at once
 * — which is exactly the shogi promotion discipline.
 */
export const HARD_POLICY: AiPolicy = {
  useDefence: true,
  discardRandomTop: 1,
  useEvPushFold: false,
};

/** Map the shared {@link Difficulty} union onto a policy. */
export function policyFor(difficulty: Difficulty): AiPolicy {
  switch (difficulty) {
    case 'easy':
      return EASY_POLICY;
    case 'medium':
      return MEDIUM_POLICY;
    case 'hard':
    case 'expert':
    case 'master':
      return HARD_POLICY;
  }
}

// ---------------------------------------------------------------------------
// Hand value
// ---------------------------------------------------------------------------

/** Every tile the seat holds or has melded, as a histogram. */
function fullHandCounts(concealed: TileCounts, melds: readonly Meld[]): TileCounts {
  const counts = Uint8Array.from(concealed);
  for (const meld of melds) {
    for (const tile of meld.tiles) counts[kindOf(tile)] += 1;
  }
  return counts;
}

/** True when no tile in the hand (melds included) is a terminal or honour. */
function allSimples(counts: TileCounts): boolean {
  for (const kind of YAOCHUU_KINDS) if (counts[kind] > 0) return false;
  return true;
}

/** The single number suit the hand uses, or `null` when it spans more than one. */
function singleSuit(counts: TileCounts): string | null {
  let suit: string | null = null;
  for (let kind = 0; kind < TILE_KIND_COUNT; kind += 1) {
    if (counts[kind] === 0 || isHonor(kind)) continue;
    const own = suitOf(kind);
    if (suit === null) suit = own;
    else if (suit !== own) return null;
  }
  return suit;
}

/**
 * A rough han count for the hand as it stands: dora, red fives, yakuhai
 * triplets, and the yaku the shape is obviously heading for. Riichi is
 * included for a menzen hand because a menzen tenpai can always declare.
 *
 * This is a *comparison* value used by the fold and damaten thresholds, not a
 * score — `engine/score.ts` is the only thing that scores a real hand.
 */
export function estimateHan(state: RoundState, seat: Seat, ctx: SafetyContext): number {
  const player = state.players[seat];
  const counts = fullHandCounts(tilesToCounts(player.hand), player.melds);

  let han = 0;
  for (let kind = 0; kind < TILE_KIND_COUNT; kind += 1) {
    if (counts[kind] > 0) han += ctx.dora[kind] * counts[kind];
  }
  if (state.rules.redFives) {
    for (const tile of player.hand) if (isRedFive(tile)) han += 1;
    for (const meld of player.melds) {
      for (const tile of meld.tiles) if (isRedFive(tile)) han += 1;
    }
  }

  const yakuhai = yakuhaiKinds(state, seat);
  for (const kind of yakuhai) if (counts[kind] >= 3) han += HAN_YAKUHAI;

  if (allSimples(counts) && (state.rules.kuitan || isMenzen(player.melds))) {
    han += HAN_TANYAO;
  }
  if (singleSuit(counts) !== null) han += HAN_FLUSH;
  if (isMenzen(player.melds)) han += HAN_MENZEN;
  return han;
}

// ---------------------------------------------------------------------------
// Yaku paths for calls
// ---------------------------------------------------------------------------

/**
 * True when an **open** hand of this shape can still finish with a yaku.
 *
 * Deliberately conservative: only the yaku a call can reliably aim at are
 * listed (yakuhai, tanyao, honitsu/chinitsu, toitoi). Open sanshoku and ittsu
 * are real but hard to judge from a histogram, so the AI simply never calls
 * for them — declining a good call costs far less than opening a hand that
 * turns out to be unwinnable.
 */
export function hasOpenYakuPath(
  state: RoundState,
  seat: Seat,
  concealed: TileCounts,
  melds: readonly Meld[],
): boolean {
  const counts = fullHandCounts(concealed, melds);

  const yakuhai = yakuhaiKinds(state, seat);
  for (const kind of yakuhai) {
    if (counts[kind] >= 3) return true;
  }

  if (state.rules.kuitan && allSimples(counts)) return true;
  if (singleSuit(counts) !== null) return true;

  // Toitoi: every meld a triplet, and enough concealed pairs left to fill the
  // remaining blocks without a run.
  if (melds.length >= 2 && melds.every((meld) => meld.type !== 'chi')) {
    let pairs = 0;
    for (let kind = 0; kind < TILE_KIND_COUNT; kind += 1) {
      if (concealed[kind] >= 2) pairs += 1;
    }
    if (pairs >= 4 - melds.length) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Discard candidates
// ---------------------------------------------------------------------------

export interface DiscardOption {
  /** The concrete tile the AI would put on the table. */
  tile: TileId;
  kind: TileKind;
  /** Shanten of what is left behind. */
  shanten: number;
  /** Live acceptance of what is left behind; only filled for the shortlist. */
  acceptance: number;
  /** Live winning tiles, when the remainder is tenpai. */
  waitTiles: number;
  score: number;
}

/**
 * Pick the physical copy to throw for a kind: never the red five while an
 * ordinary copy of the same kind is also on offer.
 */
function preferredCopy(actions: readonly DiscardAction[]): TileId {
  let best = actions[0].tile;
  for (const action of actions) {
    if (isRedFive(best) && !isRedFive(action.tile)) best = action.tile;
  }
  return best;
}

/** True when the kind has no partner and no neighbour within two ranks. */
function isIsolated(counts: TileCounts, kind: TileKind): boolean {
  if (counts[kind] > 1) return false;
  if (isHonor(kind)) return true;
  const rank = rankOf(kind);
  for (let delta = -2; delta <= 2; delta += 1) {
    if (delta === 0) continue;
    if (rank + delta < 1 || rank + delta > 9) continue;
    if (counts[kind + delta] > 0) return false;
  }
  return true;
}

/**
 * Rank the discards that do not raise shanten.
 *
 * Two passes on purpose: shanten alone (34 cheap evaluations) narrows a
 * fourteen-tile hand to the two or three candidates that matter, and only
 * those pay for a full `ukeire` scan. Running `bestDiscards` over the whole
 * hand instead measured 1.2ms per decision, most of it spent on acceptance
 * counts for tiles the AI would never throw.
 */
function rankDiscards(
  state: RoundState,
  seat: Seat,
  ctx: SafetyContext,
  threats: readonly ThreatInfo[],
  choices: readonly DiscardAction[],
): DiscardOption[] {
  const player = state.players[seat];
  const meldCount = player.melds.length;
  const counts = tilesToCounts(player.hand);

  const byKind = new Map<TileKind, DiscardAction[]>();
  for (const action of choices) {
    const kind = kindOf(action.tile);
    const list = byKind.get(kind);
    if (list === undefined) byKind.set(kind, [action]);
    else list.push(action);
  }

  let bestShanten = Number.POSITIVE_INFINITY;
  const shantenByKind = new Map<TileKind, number>();
  for (const kind of byKind.keys()) {
    counts[kind] -= 1;
    const value = shanten(counts, meldCount);
    counts[kind] += 1;
    shantenByKind.set(kind, value);
    if (value < bestShanten) bestShanten = value;
  }

  const options: DiscardOption[] = [];
  for (const [kind, actions] of byKind) {
    if (shantenByKind.get(kind) !== bestShanten) continue;
    counts[kind] -= 1;
    const result = ukeire(counts, meldCount, ctx.visible);
    const waitTiles = bestShanten === 0 ? result.total : 0;
    counts[kind] += 1;

    const tile = preferredCopy(actions);
    let score = result.total * UKEIRE_WEIGHT;
    score -= DORA_KEEP_PENALTY * doraValueOf(state, tile, ctx.dora);
    if (counts[kind] >= 3) score -= SET_BREAK_PENALTY;
    else if (counts[kind] === 2) score -= PAIR_KEEP_PENALTY;
    if (isIsolated(counts, kind)) score += ISOLATED_BONUS;
    score -= DANGER_PUSH_WEIGHT * weightedDangerIn(ctx, kind, threats);

    options.push({ tile, kind, shanten: bestShanten, acceptance: result.total, waitTiles, score });
  }

  options.sort((a, b) => b.score - a.score || a.kind - b.kind);
  return options;
}

// ---------------------------------------------------------------------------
// Push / fold
// ---------------------------------------------------------------------------

/**
 * The v1 push/fold rule. Threshold-based on purpose — M7 replaces the body
 * with an EV comparison and keeps the signature.
 */
export function shouldFold(
  threats: readonly ThreatInfo[],
  handShanten: number,
  estimatedHan: number,
  waitTiles: number,
): boolean {
  if (threats.length === 0) return false;
  if (handShanten >= FOLD_MIN_SHANTEN) return true;
  if (handShanten === 0 && estimatedHan < FOLD_CHEAP_HAN && waitTiles < FOLD_BAD_WAIT_TILES) {
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Riichi
// ---------------------------------------------------------------------------

/**
 * True when a single live draw would widen the wait by at least
 * {@link RIICHI_IMPROVE_MIN_GAIN} tiles — the "a clear improvement is one tile
 * away" half of the damaten rule.
 *
 * Bounded on both sides so it stays cheap: only draws with
 * {@link RIICHI_IMPROVE_MIN_COPIES} live copies that touch a tile already in
 * hand are tried, and only floating tiles (single copies) are considered as
 * the tile to let go of. It runs only when the wait is already bad and the
 * hand already cheap, which is a small minority of tenpai decisions.
 */
function hasClearImprovement(
  counts: TileCounts,
  meldCount: number,
  visible: TileCounts,
  currentWaitTiles: number,
): boolean {
  const target = currentWaitTiles + RIICHI_IMPROVE_MIN_GAIN;

  for (let draw = 0; draw < TILE_KIND_COUNT; draw += 1) {
    if (counts[draw] >= 4) continue;
    if (4 - visible[draw] < RIICHI_IMPROVE_MIN_COPIES) continue;
    if (!touchesHand(counts, draw)) continue;

    counts[draw] += 1;
    for (let drop = 0; drop < TILE_KIND_COUNT; drop += 1) {
      if (counts[drop] !== 1) continue;
      counts[drop] -= 1;
      const tenpai = shanten(counts, meldCount) === 0;
      let total = 0;
      if (tenpai) {
        for (const kind of waits(counts, meldCount)) total += Math.max(0, 4 - visible[kind]);
      }
      counts[drop] += 1;
      if (tenpai && total >= target) {
        counts[draw] -= 1;
        return true;
      }
    }
    counts[draw] -= 1;
  }
  return false;
}

/** True when the hand already holds `kind` or a tile within two ranks of it. */
function touchesHand(counts: TileCounts, kind: TileKind): boolean {
  if (counts[kind] > 0) return true;
  if (isHonor(kind)) return false;
  const rank = rankOf(kind);
  for (let delta = -2; delta <= 2; delta += 1) {
    if (delta === 0) continue;
    if (rank + delta < 1 || rank + delta > 9) continue;
    if (counts[kind + delta] > 0) return true;
  }
  return false;
}

/**
 * Riichi is the default on any menzen tenpai. It is declined only when all
 * three of the damaten conditions hold at once: the wait is bad, the hand is
 * cheap, and a clear improvement is one draw away with turns left to find it.
 */
export function shouldDeclareRiichi(
  state: RoundState,
  seat: Seat,
  option: DiscardOption,
  estimatedHan: number,
  visible: TileCounts,
): boolean {
  const player = state.players[seat];
  const badWait = option.waitTiles < RIICHI_BAD_WAIT_TILES;
  if (!badWait) return true;
  // `estimateHan` credits a menzen hand the riichi it has not declared yet;
  // the cheapness test is about the hand's own value, so take it back off.
  const ownHan = estimatedHan - HAN_MENZEN;
  if (ownHan >= RIICHI_CHEAP_HAN) return true;
  if (player.discards.length >= RIICHI_DAMA_MAX_TURN) return true;

  const counts = tilesToCounts(player.hand);
  counts[option.kind] -= 1;
  const improvable = hasClearImprovement(
    counts,
    player.melds.length,
    visible,
    option.waitTiles,
  );
  return !improvable;
}

// ---------------------------------------------------------------------------
// Turn actions
// ---------------------------------------------------------------------------

/** Distinct terminal/honour kinds in hand — the kokushi progress measure. */
function yaochuuKindCount(counts: TileCounts): number {
  let distinct = 0;
  for (const kind of YAOCHUU_KINDS) if (counts[kind] > 0) distinct += 1;
  return distinct;
}

function chooseTurnAction(
  state: RoundState,
  seat: Seat,
  policy: AiPolicy,
  rng: Rng,
  legal: readonly Action[],
): Action {
  const player = state.players[seat];
  const ctx = createSafetyContext(state, seat);
  const threats = policy.useDefence ? threatSeats(state, seat) : [];

  const kyuushu = legal.find((action) => action.type === 'kyuushu');
  if (kyuushu !== undefined) {
    const distinct = yaochuuKindCount(tilesToCounts(player.hand));
    if (distinct < KYUUSHU_KEEP_KOKUSHI_KINDS) return kyuushu;
  }

  const discards = legal.filter((action): action is DiscardAction => action.type === 'discard');
  const plain = discards.filter((action) => action.riichi !== true);
  if (plain.length === 0) {
    // Only reachable if the engine ever offers a riichi discard without its
    // plain counterpart; take whatever is legal rather than inventing a move.
    return legal[0];
  }

  const options = rankDiscards(state, seat, ctx, threats, plain);
  const best = options[0];
  const estimatedHan = estimateHan(state, seat, ctx);

  // A kan is only ever taken while pushing: it hands every opponent a fresh
  // dora indicator, and a kakan can be robbed.
  if (threats.length === 0) {
    const kan = chooseKan(state, seat, legal, best.shanten);
    if (kan !== null) return kan;
  }

  if (
    player.riichi === null &&
    shouldFold(threats, best.shanten, estimatedHan, best.waitTiles)
  ) {
    const tile = safestDiscardIn(ctx, plain.map((action) => action.tile), threats);
    const folded = plain.find((action) => action.tile === tile);
    if (folded !== undefined) return folded;
  }

  const limit = Math.max(1, Math.min(policy.discardRandomTop, options.length));
  const chosen = limit === 1 ? best : options[rng.nextInt(limit)];

  if (chosen.shanten === 0) {
    const riichi = discards.find(
      (action) => action.riichi === true && action.tile === chosen.tile,
    );
    if (
      riichi !== undefined &&
      shouldDeclareRiichi(state, seat, chosen, estimatedHan, ctx.visible)
    ) {
      return riichi;
    }
  }

  const discard = plain.find((action) => action.tile === chosen.tile);
  return discard ?? plain[0];
}

/**
 * An ankan or kakan worth making: one that does not push the hand further from
 * tenpai. Both add a dora indicator and a free draw, so "no worse" is enough.
 */
function chooseKan(
  state: RoundState,
  seat: Seat,
  legal: readonly Action[],
  currentShanten: number,
): Action | null {
  const player = state.players[seat];
  const meldCount = player.melds.length;

  for (const action of legal) {
    if (action.type === 'ankan') {
      const counts = tilesToCounts(player.hand);
      counts[action.kind] -= 4;
      if (shanten(counts, meldCount + 1) <= currentShanten) return action;
    } else if (action.type === 'kakan') {
      const counts = tilesToCounts(player.hand);
      counts[kindOf(action.tile)] -= 1;
      if (shanten(counts, meldCount) <= currentShanten) return action;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------

type CallAction = ChiAction | PonAction | MinkanAction;

interface CallEvaluation {
  action: CallAction;
  shantenAfter: number;
  /** Dora (red fives included) the call would bury in a meld. */
  doraUsed: number;
}

/**
 * Shanten of the hand that a call leaves behind.
 *
 * A chi or pon leaves one tile too many, so the answer is the best available
 * discard; a minkan leaves the hand at exactly waiting size and the rinshan
 * draw comes next, so it is read directly.
 */
function shantenAfterCall(
  concealed: TileCounts,
  meldCount: number,
  needsDiscard: boolean,
): number {
  if (!needsDiscard) return shanten(concealed, meldCount);
  let best = Number.POSITIVE_INFINITY;
  for (let kind = 0; kind < TILE_KIND_COUNT; kind += 1) {
    if (concealed[kind] === 0) continue;
    concealed[kind] -= 1;
    const value = shanten(concealed, meldCount);
    concealed[kind] += 1;
    if (value < best) best = value;
  }
  return best;
}

function chooseCall(
  state: RoundState,
  seat: Seat,
  policy: AiPolicy,
  legal: readonly Action[],
): Action {
  const pass = legal.find((action) => action.type === 'pass');
  const calls = legal.filter(
    (action): action is CallAction =>
      action.type === 'chi' || action.type === 'pon' || action.type === 'minkan',
  );
  if (calls.length === 0 || pass === undefined) return pass ?? legal[0];

  const player = state.players[seat];
  const pending = state.pendingDiscard;
  if (pending === null) return pass;

  const ctx = createSafetyContext(state, seat);
  const threats = policy.useDefence ? threatSeats(state, seat) : [];
  const meldCount = player.melds.length;
  const concealed = tilesToCounts(player.hand);
  const shantenBefore = shanten(concealed, meldCount);

  if (threats.length > 0 && shantenBefore >= FOLD_MIN_SHANTEN) return pass;

  const menzen = isMenzen(player.melds);
  const yakuhai = yakuhaiKinds(state, seat);
  const calledKind = kindOf(pending.tile);

  let best: CallEvaluation | null = null;
  for (const action of calls) {
    const evaluation = evaluateCall(
      state,
      seat,
      action,
      concealed,
      meldCount,
      shantenBefore,
      menzen,
      yakuhai.has(calledKind),
      ctx,
    );
    if (evaluation === null) continue;
    if (
      best === null ||
      evaluation.shantenAfter < best.shantenAfter ||
      (evaluation.shantenAfter === best.shantenAfter && evaluation.doraUsed < best.doraUsed)
    ) {
      best = evaluation;
    }
  }
  return best === null ? pass : best.action;
}

function evaluateCall(
  state: RoundState,
  seat: Seat,
  action: CallAction,
  concealed: TileCounts,
  meldCount: number,
  shantenBefore: number,
  menzen: boolean,
  createsYakuhai: boolean,
  ctx: SafetyContext,
): CallEvaluation | null {
  const pending = state.pendingDiscard;
  if (pending === null) return null;

  const after = Uint8Array.from(concealed);
  for (const tile of action.tiles) after[kindOf(tile)] -= 1;

  const melds: Meld[] = [
    ...state.players[seat].melds,
    {
      type: action.type,
      tiles: [...action.tiles, pending.tile],
      calledTile: pending.tile,
      fromSeat: pending.seat,
    },
  ];

  const shantenAfter = shantenAfterCall(after, meldCount + 1, action.type !== 'minkan');
  if (!Number.isFinite(shantenAfter)) return null;
  if (!hasOpenYakuPath(state, seat, after, melds)) return null;

  if (menzen) {
    // A closed hand gives up riichi, menzen tsumo, ura dora and half its value
    // by opening, so it only ever opens for a genuine step forward — and once
    // it is close to tenpai, only for tenpai itself.
    if (shantenAfter >= shantenBefore) return null;
    if (shantenBefore <= CALL_MENZEN_PROTECT_SHANTEN && shantenAfter > 0) return null;
  }

  if (createsYakuhai && action.type !== 'chi') {
    if (shantenAfter > shantenBefore) return null;
    if (shantenAfter > CALL_YAKUHAI_MAX_SHANTEN) return null;
  } else {
    // Speed calls are only allowed to accelerate a hand that already had an
    // open yaku to aim at; otherwise the call is exactly the yakuless open
    // hand the policy forbids.
    if (!hasOpenYakuPath(state, seat, concealed, state.players[seat].melds)) return null;
    if (shantenAfter >= shantenBefore) return null;
    if (shantenAfter > CALL_MAX_RESULT_SHANTEN) return null;
  }

  let doraUsed = 0;
  for (const tile of action.tiles) doraUsed += doraValueOf(state, tile, ctx.dora);
  return { action, shantenAfter, doraUsed };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Decide what `seat` does in `state`.
 *
 * The returned action is always one of `legalActions(state, seat)` — asserted
 * before returning, so a policy bug fails loudly here instead of silently
 * corrupting a round through `applyAction`.
 *
 * `rng` is only consulted by the `easy` policy, but it is required for every
 * level so the signature never changes when a level starts using it.
 */
export function chooseAction(
  state: RoundState,
  seat: Seat,
  difficulty: Difficulty,
  rng: Rng,
): Action {
  const legal = legalActions(state, seat);
  if (legal.length === 0) {
    throw new Error(
      `chooseAction: seat ${seat} has no legal action in phase ${state.phase}`,
    );
  }

  const policy = policyFor(difficulty);
  const action = decide(state, seat, policy, rng, legal);

  if (!legal.some((candidate) => sameAction(candidate, action))) {
    throw new Error(
      `chooseAction produced an illegal action for seat ${seat}: ${JSON.stringify(action)}`,
    );
  }
  return action;
}

function decide(
  state: RoundState,
  seat: Seat,
  policy: AiPolicy,
  rng: Rng,
  legal: readonly Action[],
): Action {
  // The engine only offers a win that is both complete and scorable, and it
  // has already applied furiten, so an offered win is always taken.
  const win = legal.find((action) => action.type === 'tsumo' || action.type === 'ron');
  if (win !== undefined) return win;

  if (state.phase === 'call') return chooseCall(state, seat, policy, legal);
  return chooseTurnAction(state, seat, policy, rng, legal);
}
