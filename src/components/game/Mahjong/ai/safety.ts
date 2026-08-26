/**
 * Riichi Mahjong — the defensive half of the AI.
 *
 * Everything here answers one question: *if I put this tile on the table, how
 * likely is it to be ronned, and by whom?* The offensive half
 * (`heuristicAI.ts`) decides whether it cares about the answer.
 *
 * The reads implemented here are the standard ones a human uses, in the order
 * a human applies them:
 *
 * 1. **Genbutsu** (現物) — provably safe. A tile already sitting in that
 *    opponent's own pond can never be ronned by them (they would be furiten),
 *    and neither can a tile anybody else discarded *after* their riichi and
 *    which they did not claim.
 * 2. **Suji** (筋) — their pond contains the tile three away, so the ryanmen
 *    that would wait on this tile is furiten. **Suji only rules out ryanmen**:
 *    a suji tile is still fully live against tanki, shanpon and kanchan, which
 *    is why it lowers the danger by a factor rather than to zero.
 * 3. **Kabe / one-chance** (壁・ワンチャンス) — all four copies of a tile the
 *    ryanmen would need are already visible, so that ryanmen cannot exist.
 *    Same class of information as suji, so the two are combined per *side*
 *    rather than multiplied together (see {@link dangerLevel}).
 * 4. **Honours by remaining count** — an honour nobody can pair up is nearly
 *    safe; a fresh one is not.
 * 5. **No-suji middle tiles** — the most dangerous thing in the hand.
 *
 * Like the rest of `engine/` and `ai/`, this module never touches React or the
 * DOM and never calls `Math.random`, so `scripts/` can import it directly.
 */

import { pondKinds } from '../engine/furiten';
import { doraFromIndicator, isHonor, isRedFive, kindOf, rankOf, suitOf } from '../engine/tiles';
import { addVisible, emptyVisible } from '../engine/ukeire';
import {
  SEATS,
  TILE_KIND_COUNT,
  type Meld,
  type PlayerState,
  type RoundState,
  type Seat,
  type TileCounts,
  type TileId,
  type TileKind,
} from '../engine/types';

// ---------------------------------------------------------------------------
// Threat detection
// ---------------------------------------------------------------------------

/** Why a seat is considered dangerous. */
export type ThreatReason = 'riichi' | 'melds' | 'yakuhai' | 'flush';

export interface ThreatInfo {
  seat: Seat;
  reason: ThreatReason;
  /**
   * How seriously to take this seat, `0..1`. A declared riichi is the
   * reference point at `1`; the open-hand reads are guesses and are weighted
   * down accordingly.
   */
  weight: number;
}

/** A declared riichi is a certain tenpai — the reference threat. */
export const THREAT_WEIGHT_RIICHI = 1;
/** Three or more melds: almost always tenpai or one away, and usually with a yaku. */
export const THREAT_WEIGHT_MELDS = 0.7;
/** A yakuhai pon plus another meld: a cheap but fast open hand. */
export const THREAT_WEIGHT_YAKUHAI = 0.6;
/** A one-suit lean: slow, but expensive when it lands. */
export const THREAT_WEIGHT_FLUSH = 0.5;

/** Open melds at which a hand counts as threatening on meld count alone. */
export const THREAT_MELD_COUNT = 3;
/** Melds (one of them a yakuhai pon) at which a hand counts as threatening. */
export const THREAT_YAKUHAI_MELD_COUNT = 2;
/** Off-suit discards that make a one-suit lean visible. */
export const THREAT_FLUSH_MIN_OFFSUIT_DISCARDS = 5;

/** First honour kind (East). Winds are `27..30`, dragons `31..33`. */
const WIND_START = 27;
const DRAGON_START = 31;

/** Seat wind of `seat`, 0 = East. Mirrors `actions.seatWindOf`. */
function seatWind(state: RoundState, seat: Seat): number {
  return (((seat - state.dealer) % 4) + 4) % 4;
}

/** Kinds that are always worth a yaku as a triplet for `seat`. */
export function yakuhaiKinds(state: RoundState, seat: Seat): Set<TileKind> {
  const kinds = new Set<TileKind>([DRAGON_START, DRAGON_START + 1, DRAGON_START + 2]);
  kinds.add(WIND_START + seatWind(state, seat));
  kinds.add(WIND_START + state.roundWind);
  return kinds;
}

function meldKind(meld: Meld): TileKind {
  return kindOf(meld.tiles[0]);
}

/**
 * True when `player` shows a honitsu/chinitsu lean: at least one meld, every
 * melded number tile in a single suit (honours allowed alongside), and a pond
 * that has already thrown away {@link THREAT_FLUSH_MIN_OFFSUIT_DISCARDS}
 * numbered tiles from the other suits.
 *
 * Requiring a meld is deliberate — a concealed one-suit lean is not *visible*,
 * and guessing at it from the pond alone flags every ordinary hand.
 */
function looksLikeFlush(player: PlayerState): boolean {
  const melds = player.melds;
  if (melds.length === 0) return false;

  let suit: string | null = null;
  for (const meld of melds) {
    const kind = meldKind(meld);
    if (isHonor(kind)) continue;
    const meldSuit = suitOf(kind);
    if (suit === null) suit = meldSuit;
    else if (suit !== meldSuit) return false;
  }
  if (suit === null) return false;

  let offSuit = 0;
  for (const entry of player.discards) {
    const kind = kindOf(entry.tile);
    if (isHonor(kind)) continue;
    if (suitOf(kind) !== suit) offSuit += 1;
  }
  return offSuit >= THREAT_FLUSH_MIN_OFFSUIT_DISCARDS;
}

/**
 * Seats `seat` should be afraid of, strongest first.
 *
 * A seat is listed at most once, under the strongest reason that applies.
 * `seat` itself is never listed.
 */
export function threatSeats(state: RoundState, seat: Seat): ThreatInfo[] {
  const threats: ThreatInfo[] = [];
  for (const other of SEATS) {
    if (other === seat) continue;
    const player = state.players[other];

    if (player.riichi !== null) {
      threats.push({ seat: other, reason: 'riichi', weight: THREAT_WEIGHT_RIICHI });
      continue;
    }

    const melds = player.melds;
    if (melds.length >= THREAT_MELD_COUNT) {
      threats.push({ seat: other, reason: 'melds', weight: THREAT_WEIGHT_MELDS });
      continue;
    }

    const yakuhai = yakuhaiKinds(state, other);
    const hasYakuhaiPon = melds.some(
      (meld) => meld.type !== 'chi' && yakuhai.has(meldKind(meld)),
    );
    if (hasYakuhaiPon && melds.length >= THREAT_YAKUHAI_MELD_COUNT) {
      threats.push({ seat: other, reason: 'yakuhai', weight: THREAT_WEIGHT_YAKUHAI });
      continue;
    }

    if (looksLikeFlush(player)) {
      threats.push({ seat: other, reason: 'flush', weight: THREAT_WEIGHT_FLUSH });
    }
  }
  threats.sort((a, b) => b.weight - a.weight || a.seat - b.seat);
  return threats;
}

// ---------------------------------------------------------------------------
// Visibility
// ---------------------------------------------------------------------------

/**
 * Everything `seat` can see: their own concealed hand, every player's melds,
 * every pond, and every face-up dora indicator.
 *
 * Physical tile ids are de-duplicated before counting, because a discard that
 * was claimed into a meld appears in both the pond and the meld and must not
 * be counted twice. The result is exactly the `visible` histogram that
 * `ukeire()` and `bestDiscards()` expect.
 */
export function visibleCounts(state: RoundState, seat: Seat): TileCounts {
  const seen = new Set<TileId>();
  for (const tile of state.players[seat].hand) seen.add(tile);
  for (const player of state.players) {
    for (const meld of player.melds) for (const tile of meld.tiles) seen.add(tile);
    for (const entry of player.discards) seen.add(entry.tile);
  }
  for (const indicator of state.wall.doraIndicators) seen.add(indicator);

  const visible = emptyVisible();
  for (const tile of seen) addVisible(visible, kindOf(tile));
  return visible;
}

/** Dora kinds currently face up, as a histogram of how many indicators point at each. */
export function doraKindCounts(state: RoundState): TileCounts {
  const counts = new Uint8Array(TILE_KIND_COUNT);
  for (const indicator of state.wall.doraIndicators) {
    counts[doraFromIndicator(indicator)] += 1;
  }
  return counts;
}

/** Dora value of one physical tile: indicator dora plus the red-five bonus. */
export function doraValueOf(state: RoundState, tile: TileId, dora: TileCounts): number {
  return dora[kindOf(tile)] + (state.rules.redFives && isRedFive(tile) ? 1 : 0);
}

// ---------------------------------------------------------------------------
// Genbutsu
// ---------------------------------------------------------------------------

/**
 * Index of the first discard by `seat` that is certainly later than
 * `riichiSeat`'s declaration.
 *
 * The engine records the declaration as "the declarer's `d`-th own discard, at
 * global discard number `declaredAtTurn`", and `DiscardEntry` carries no
 * timestamp, so the position of the other seats' ponds at that moment has to
 * be reconstructed. In an uninterrupted go-around every seat discards once per
 * lap, so a seat that plays *before* the declarer in turn order has completed
 * `d + 1` discards and a seat that plays after has completed `d`.
 *
 * Calls break the lap structure. A call that skips seats leaves those seats
 * with *fewer* discards than the estimate, which is harmless — the entry at
 * the estimated index then happened even later, so it is still safe. A call
 * made by the seat itself is the dangerous direction: it can hand that seat an
 * extra out-of-turn discard. One meld is therefore worth one extra index of
 * margin, which keeps the answer conservative (it may miss a genuinely safe
 * tile, and never invents one).
 *
 * An ankan is excluded on purpose. It happens on the seat's own turn — draw,
 * declare, draw the replacement, discard — so the seat still discards exactly
 * once that lap and the lap structure is untouched. A kakan is the same shape
 * but is counted anyway, which only makes the estimate more conservative.
 */
function firstDiscardAfterRiichi(
  state: RoundState,
  seat: Seat,
  riichiSeat: Seat,
  declaredAtDiscard: number,
): number {
  const position = (target: Seat): number => (((target - state.dealer) % 4) + 4) % 4;
  const base =
    position(seat) < position(riichiSeat) ? declaredAtDiscard + 1 : declaredAtDiscard;
  const calls = state.players[seat].melds.filter((meld) => meld.type !== 'ankan').length;
  return base + calls;
}

/**
 * Kinds `againstSeat` provably cannot ron: their own pond, plus — when they
 * have declared riichi and so can no longer change their wait — everything
 * anybody else has discarded since the declaration.
 *
 * Both halves are equally valid as suji evidence, which is why the suji test
 * reads this whole set rather than the pond alone. Suji is the inference "a
 * ryanmen waiting on this tile would have ronned the tile three away"; that
 * argument only needs the tile three away to have *passed* the opponent, and a
 * tile another seat discarded after the riichi passed it just as conclusively
 * as one the opponent discarded themselves.
 */
export function safeKindsAgainst(state: RoundState, againstSeat: Seat): Set<TileKind> {
  const player = state.players[againstSeat];
  const safe = pondKinds(player);

  const riichi = player.riichi;
  if (riichi !== null) {
    for (const other of SEATS) {
      if (other === againstSeat) continue;
      const pond = state.players[other].discards;
      const start = firstDiscardAfterRiichi(
        state,
        other,
        againstSeat,
        riichi.declaredAtDiscard,
      );
      for (let i = start; i < pond.length; i += 1) safe.add(kindOf(pond[i].tile));
    }
  }
  return safe;
}

// ---------------------------------------------------------------------------
// Danger
// ---------------------------------------------------------------------------

/** A tile the opponent has already let past. Provably unronnable by them. */
export const DANGER_GENBUTSU = 0;

/**
 * Base danger of an honour, indexed by how many copies are still unseen.
 * Zero unseen copies means no shanpon and no tanki is possible; three or four
 * means a live honour, which is still much safer than any middle tile.
 */
export const HONOUR_DANGER_BY_REMAINING: readonly number[] = [0.3, 1.0, 2.6, 4.4, 4.4];

/** Base danger of a number tile, indexed by rank `1..9` (index 0 unused). */
export const NUMBER_DANGER_BY_RANK: readonly number[] = [
  0, 5.0, 6.4, 7.6, 8.6, 9.0, 8.6, 7.6, 6.4, 5.0,
];

/** Every ryanmen that could wait on this tile is ruled out by suji or kabe. */
export const RYANMEN_BLOCKED_MULTIPLIER = 0.35;
/** Only one of the two ryanmen shapes is ruled out (middle tiles only). */
export const RYANMEN_HALF_MULTIPLIER = 0.7;
/** Dora are held longer and paid for harder, so they cost more to release. */
export const DANGER_DORA_MULTIPLIER = 1.35;
/** With at most one copy unseen, shanpon and tanki waits are nearly impossible. */
export const SCARCE_KIND_MULTIPLIER = 0.85;

interface RyanmenSide {
  /** The tile whose presence in the pond makes this side suji. */
  suji: TileKind;
  /** The two tiles the ryanmen itself is made of; four visible copies kill it. */
  blockers: [TileKind, TileKind];
}

/**
 * The (at most two) ryanmen shapes that can wait on `kind`.
 *
 * The upper one is `(n+1, n+2)`, which waits on `n` and `n+3`; the lower one
 * is `(n-2, n-1)`, waiting on `n-3` and `n`. Terminals and the tiles next to
 * them only have one, which is why suji on a `1` or a `9` is worth as much as
 * double suji on a `5`.
 */
function ryanmenSides(kind: TileKind): RyanmenSide[] {
  const rank = rankOf(kind);
  const sides: RyanmenSide[] = [];
  if (rank + 3 <= 9) {
    sides.push({ suji: kind + 3, blockers: [kind + 1, kind + 2] });
  }
  if (rank - 3 >= 1) {
    sides.push({ suji: kind - 3, blockers: [kind - 1, kind - 2] });
  }
  return sides;
}

function doraFactor(state: RoundState, kind: TileKind): number {
  for (const indicator of state.wall.doraIndicators) {
    if (doraFromIndicator(indicator) === kind) return DANGER_DORA_MULTIPLIER;
  }
  return 1;
}

/**
 * The table reads that do not depend on which tile is being judged, computed
 * once per decision.
 *
 * `dangerLevel` is called for every tile in the hand against every threat, and
 * each of those calls would otherwise rebuild the whole visibility histogram
 * and re-walk four ponds. The context is deliberately **not** cached against
 * the `RoundState` object: `applyAction` mutates rounds in place, so a cache
 * keyed on identity would go stale without any way to notice.
 */
export interface SafetyContext {
  state: RoundState;
  seat: Seat;
  visible: TileCounts;
  dora: TileCounts;
  /** Genbutsu sets by seat, filled lazily (`safeKinds[seat]` may be undefined). */
  safeKinds: (Set<TileKind> | undefined)[];
}

/** Build the per-decision read cache for `seat`. */
export function createSafetyContext(state: RoundState, seat: Seat): SafetyContext {
  return {
    state,
    seat,
    visible: visibleCounts(state, seat),
    dora: doraKindCounts(state),
    safeKinds: [undefined, undefined, undefined, undefined],
  };
}

function safeKindsIn(ctx: SafetyContext, againstSeat: Seat): Set<TileKind> {
  const cached = ctx.safeKinds[againstSeat];
  if (cached !== undefined) return cached;
  const value = safeKindsAgainst(ctx.state, againstSeat);
  ctx.safeKinds[againstSeat] = value;
  return value;
}

/**
 * How dangerous it is to discard `kind` against `againstSeat`.
 *
 * `0` is provably safe ({@link DANGER_GENBUTSU}); the scale runs up to roughly
 * `12` for a no-suji dora five against a riichi. The numbers are ordinal, not
 * probabilities — `heuristicAI` only ever compares them.
 *
 * `fromSeat` is the seat that would make the discard. Discarding to yourself
 * is free, and the parameter is also what makes the visibility read correct:
 * only `fromSeat` knows their own concealed hand.
 *
 * Suji and kabe are combined *per ryanmen side* rather than multiplied
 * together: both say the same thing ("that ryanmen cannot exist"), so a tile
 * whose upper side is suji and whose lower side is walled is as safe as a
 * double-suji tile, and no safer.
 */
export function dangerLevel(
  kind: TileKind,
  againstSeat: Seat,
  state: RoundState,
  fromSeat: Seat,
): number {
  return dangerLevelIn(createSafetyContext(state, fromSeat), kind, againstSeat);
}

/** {@link dangerLevel} against a prepared {@link SafetyContext}. */
export function dangerLevelIn(
  ctx: SafetyContext,
  kind: TileKind,
  againstSeat: Seat,
): number {
  const { state, seat: fromSeat, visible } = ctx;
  if (fromSeat === againstSeat) return DANGER_GENBUTSU;

  const safe = safeKindsIn(ctx, againstSeat);
  if (safe.has(kind)) return DANGER_GENBUTSU;

  const remaining = Math.max(0, 4 - visible[kind]);

  if (isHonor(kind)) {
    return HONOUR_DANGER_BY_REMAINING[Math.min(4, remaining)] * doraFactor(state, kind);
  }

  let danger = NUMBER_DANGER_BY_RANK[rankOf(kind)];

  const sides = ryanmenSides(kind);
  let covered = 0;
  for (const side of sides) {
    const isSuji = safe.has(side.suji);
    const isWalled = side.blockers.some((blocker) => visible[blocker] >= 4);
    if (isSuji || isWalled) covered += 1;
  }
  if (sides.length > 0 && covered === sides.length) danger *= RYANMEN_BLOCKED_MULTIPLIER;
  else if (covered > 0) danger *= RYANMEN_HALF_MULTIPLIER;

  if (remaining <= 1) danger *= SCARCE_KIND_MULTIPLIER;
  return danger * doraFactor(state, kind);
}

/**
 * Weight applied to every opponent when {@link safestDiscard} is asked for a
 * safe tile with no live threat on the table. Folding without a threat is
 * unusual, but the ordering still has to be defined.
 */
export const NO_THREAT_WEIGHT = 0.25;

/**
 * Aggregate danger of one kind against a set of threats: the weighted worst
 * case, since a single deal-in is what actually costs points.
 */
export function weightedDanger(
  kind: TileKind,
  threats: readonly ThreatInfo[],
  state: RoundState,
  seat: Seat,
): number {
  return weightedDangerIn(createSafetyContext(state, seat), kind, threats);
}

/** {@link weightedDanger} against a prepared {@link SafetyContext}. */
export function weightedDangerIn(
  ctx: SafetyContext,
  kind: TileKind,
  threats: readonly ThreatInfo[],
): number {
  let worst = 0;
  if (threats.length === 0) {
    for (const other of SEATS) {
      if (other === ctx.seat) continue;
      worst = Math.max(worst, dangerLevelIn(ctx, kind, other) * NO_THREAT_WEIGHT);
    }
    return worst;
  }
  for (const threat of threats) {
    worst = Math.max(worst, dangerLevelIn(ctx, kind, threat.seat) * threat.weight);
  }
  return worst;
}

function compareKeys(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

/**
 * The tile to throw when folding: the safest tile in `hand`.
 *
 * Ties are broken so that the fold can keep going for as many turns as
 * possible — a safe tile held in multiple copies is a multi-turn reserve, so
 * the single copies go first — and then by dora (never release one when an
 * equally safe alternative exists) and finally by tile id, so the choice is
 * deterministic.
 *
 * `hand` is the set of tiles the caller may actually discard, which is not
 * always the whole hand: a player in riichi is locked to the tile they just
 * drew.
 */
export function safestDiscard(
  hand: readonly TileId[],
  threats: readonly ThreatInfo[],
  state: RoundState,
  seat: Seat,
): TileId {
  return safestDiscardIn(createSafetyContext(state, seat), hand, threats);
}

/** {@link safestDiscard} against a prepared {@link SafetyContext}. */
export function safestDiscardIn(
  ctx: SafetyContext,
  hand: readonly TileId[],
  threats: readonly ThreatInfo[],
): TileId {
  const { state, seat } = ctx;
  if (hand.length === 0) {
    throw new Error(`safestDiscard: seat ${seat} was given no tiles to choose from`);
  }
  const held = new Uint8Array(TILE_KIND_COUNT);
  for (const tile of state.players[seat].hand) held[kindOf(tile)] += 1;

  const cache = new Map<TileKind, number>();
  const dangerOf = (kind: TileKind): number => {
    const cached = cache.get(kind);
    if (cached !== undefined) return cached;
    const value = weightedDangerIn(ctx, kind, threats);
    cache.set(kind, value);
    return value;
  };

  let best = hand[0];
  let bestKey: number[] | null = null;
  for (const tile of hand) {
    const kind = kindOf(tile);
    const key = [dangerOf(kind), held[kind], doraValueOf(state, tile, ctx.dora), tile];
    if (bestKey === null || compareKeys(key, bestKey) < 0) {
      best = tile;
      bestKey = key;
    }
  }
  return best;
}
