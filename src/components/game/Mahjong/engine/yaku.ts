/**
 * Riichi Mahjong — winning-hand decomposition and yaku detection.
 *
 * Pure and free of DOM/React, so `scripts/` and the AI worker import it
 * directly.
 *
 * The module does three things:
 *
 * 1. {@link parseWinningHand} enumerates **every** legal reading of a winning
 *    hand (4 sets + pair, chiitoitsu, kokushi), including which set the
 *    winning tile completed. Yaku *and* fu depend on that reading, so the
 *    enumeration has to be exhaustive.
 * 2. {@link detectYaku} scores one reading.
 * 3. {@link evaluateHand} runs 1+2 over every reading and keeps the best under
 *    高点法 (takame): more yakuman, then more han, then more fu, then more
 *    points.
 *
 * Dora, red fives and ura dora are deliberately **not** yaku. They are added
 * to {@link HandValue.han} but never appear in {@link HandValue.yaku}, so a
 * dora-only hand can never be declared a win — gate it with {@link hasYaku}.
 *
 * ### Yaku ids
 *
 * `riichi` `double-riichi` `ippatsu` `menzen-tsumo` `haitei` `houtei`
 * `rinshan` `chankan` `pinfu` `tanyao` `yakuhai-round-wind`
 * `yakuhai-seat-wind` `yakuhai-haku` `yakuhai-hatsu` `yakuhai-chun` `iipeiko`
 * `chanta` `sanshoku-doujun` `ittsuu` `sanshoku-doukou` `sanankou` `toitoi`
 * `sankantsu` `shousangen` `honroutou` `chiitoitsu` `junchan` `ryanpeikou`
 * `honitsu` `chinitsu` — and the yakuman `tenhou` `chiihou` `kokushi`
 * `kokushi-13` `suuankou` `suuankou-tanki` `daisangen` `daisuushii`
 * `shousuushii` `suukantsu` `tsuuiisou` `chinroutou` `ryuuiisou` `chuuren`
 * `chuuren-9`.
 *
 * {@link detectYaku} always emits them in that order.
 */

import { calculateFu, handValue } from './score';
import {
  HONOR_START,
  countsToKinds,
  doraFromIndicator,
  isDragon,
  isHonor,
  isRedFive,
  isTerminal,
  isYaochuu,
  kindOf,
  rankOf,
  suitOf,
  tilesToCounts,
  YAOCHUU_KINDS,
} from './tiles';
import {
  isMenzen,
  TILE_KIND_COUNT,
  type HandValue,
  type Meld,
  type Rules,
  type TileCounts,
  type TileId,
  type TileKind,
  type Wind,
  type YakuEntry,
} from './types';

// ---------------------------------------------------------------------------
// Win context
// ---------------------------------------------------------------------------

/**
 * Everything the scorer needs about a completed hand. Owned by this module (it
 * is intentionally not part of the frozen `types.ts` contract) and built by
 * `gameState.ts` at the moment a tsumo/ron is declared.
 */
export interface WinContext {
  /** Concealed tiles, INCLUDING the winning tile. Meld tiles excluded. */
  hand: TileId[];
  melds: Meld[];
  winTile: TileId;
  isTsumo: boolean;
  seatWind: Wind;
  roundWind: Wind;
  riichi: boolean;
  doubleRiichi: boolean;
  ippatsu: boolean;
  chankan: boolean;
  rinshan: boolean;
  /** Last tile of the live wall, tsumo. */
  haitei: boolean;
  /** Last discard of the hand, ron. */
  houtei: boolean;
  tenhou: boolean;
  chiihou: boolean;
  doraIndicators: TileId[];
  uraIndicators: TileId[];
  rules: Rules;
}

/** Fill the situational fields of a {@link WinContext} with their defaults. */
export function makeWinContext(
  partial: Pick<WinContext, 'hand' | 'winTile' | 'rules'> & Partial<WinContext>,
): WinContext {
  return {
    melds: [],
    isTsumo: false,
    seatWind: 0,
    roundWind: 0,
    riichi: false,
    doubleRiichi: false,
    ippatsu: false,
    chankan: false,
    rinshan: false,
    haitei: false,
    houtei: false,
    tenhou: false,
    chiihou: false,
    doraIndicators: [],
    uraIndicators: [],
    ...partial,
  };
}

// ---------------------------------------------------------------------------
// Parses
// ---------------------------------------------------------------------------

export type SetType = 'shuntsu' | 'koutsu' | 'kantsu';

export interface ParsedSet {
  type: SetType;
  /** Lowest kind for a shuntsu; the kind itself for a koutsu/kantsu. */
  kind: TileKind;
  /**
   * Counts as an ankou/ankan for fu and sanankou. A triplet completed by a ron
   * is a *minko*, so this is `false` even though the tiles sat in hand.
   */
  concealed: boolean;
  /** The set came from a call (chi/pon/kan, ankan included). */
  fromMeld: boolean;
  /** The winning tile completed this set. */
  containsWinTile: boolean;
}

export type ParseShape = 'standard' | 'chiitoitsu' | 'kokushi';

export type WaitType =
  | 'ryanmen'
  | 'kanchan'
  | 'penchan'
  | 'shanpon'
  | 'tanki'
  | 'none';

export interface HandParse {
  shape: ParseShape;
  /** Four sets for `standard` (melds included); empty otherwise. */
  sets: ParsedSet[];
  /** Pair kind for `standard`, the doubled orphan for `kokushi`, else `-1`. */
  pairKind: TileKind;
  /** The seven pair kinds for `chiitoitsu`; empty otherwise. */
  pairs: TileKind[];
  wait: WaitType;
  /** The winning tile completed the pair rather than a set. */
  winIsPair: boolean;
}

function meldToSet(meld: Meld): ParsedSet {
  const kinds = meld.tiles.map(kindOf).sort((a, b) => a - b);
  if (meld.type === 'chi') {
    return {
      type: 'shuntsu',
      kind: kinds[0],
      concealed: false,
      fromMeld: true,
      containsWinTile: false,
    };
  }
  const isKan = meld.type !== 'pon';
  return {
    type: isKan ? 'kantsu' : 'koutsu',
    kind: kinds[0],
    concealed: meld.type === 'ankan',
    fromMeld: true,
    containsWinTile: false,
  };
}

interface RawSet {
  type: SetType;
  kind: TileKind;
}

interface RawDecomposition {
  sets: RawSet[];
  pairKind: TileKind;
}

/**
 * Every way to cut `counts` into `setsNeeded` sets plus exactly one pair.
 *
 * The recursion always consumes the lowest remaining kind, so each distinct
 * decomposition is produced exactly once.
 */
function enumerateStandard(
  counts: TileCounts,
  setsNeeded: number,
): RawDecomposition[] {
  const out: RawDecomposition[] = [];
  const work = Uint8Array.from(counts);

  const cutSets = (
    remaining: number,
    acc: RawSet[],
    pairKind: TileKind,
  ): void => {
    let lowest = -1;
    for (let k = 0; k < TILE_KIND_COUNT; k += 1) {
      if (work[k] > 0) {
        lowest = k;
        break;
      }
    }
    if (remaining === 0) {
      if (lowest < 0) out.push({ sets: acc.map((s) => ({ ...s })), pairKind });
      return;
    }
    if (lowest < 0) return;

    if (work[lowest] >= 3) {
      work[lowest] -= 3;
      acc.push({ type: 'koutsu', kind: lowest });
      cutSets(remaining - 1, acc, pairKind);
      acc.pop();
      work[lowest] += 3;
    }
    if (
      lowest < HONOR_START &&
      rankOf(lowest) <= 7 &&
      work[lowest + 1] > 0 &&
      work[lowest + 2] > 0
    ) {
      work[lowest] -= 1;
      work[lowest + 1] -= 1;
      work[lowest + 2] -= 1;
      acc.push({ type: 'shuntsu', kind: lowest });
      cutSets(remaining - 1, acc, pairKind);
      acc.pop();
      work[lowest] += 1;
      work[lowest + 1] += 1;
      work[lowest + 2] += 1;
    }
  };

  for (let pair = 0; pair < TILE_KIND_COUNT; pair += 1) {
    if (work[pair] < 2) continue;
    work[pair] -= 2;
    cutSets(setsNeeded, [], pair);
    work[pair] += 2;
  }
  return out;
}

/** Wait shape implied by which set the winning tile completed. */
function waitOf(set: RawSet, winKind: TileKind): WaitType {
  if (set.type !== 'shuntsu') return 'shanpon';
  const low = set.kind;
  if (winKind === low + 1) return 'kanchan';
  if (winKind === low && rankOf(low) === 7) return 'penchan';
  if (winKind === low + 2 && rankOf(low) === 1) return 'penchan';
  return 'ryanmen';
}

function chiitoitsuParse(counts: TileCounts): HandParse | null {
  const pairs: TileKind[] = [];
  for (let k = 0; k < TILE_KIND_COUNT; k += 1) {
    if (counts[k] === 0) continue;
    if (counts[k] !== 2) return null;
    pairs.push(k);
  }
  if (pairs.length !== 7) return null;
  return {
    shape: 'chiitoitsu',
    sets: [],
    pairKind: -1,
    pairs,
    wait: 'tanki',
    winIsPair: true,
  };
}

function kokushiParse(counts: TileCounts, winKind: TileKind): HandParse | null {
  let doubled = -1;
  for (let k = 0; k < TILE_KIND_COUNT; k += 1) {
    if (counts[k] === 0) continue;
    if (!isYaochuu(k)) return null;
    if (counts[k] === 2) {
      if (doubled >= 0) return null;
      doubled = k;
    } else if (counts[k] !== 1) {
      return null;
    }
  }
  if (doubled < 0) return null;
  for (const k of YAOCHUU_KINDS) if (counts[k] === 0) return null;
  return {
    shape: 'kokushi',
    sets: [],
    pairKind: doubled,
    pairs: [],
    wait: doubled === winKind ? 'tanki' : 'none',
    winIsPair: doubled === winKind,
  };
}

/**
 * Every legal reading of a winning hand. Returns `[]` when the tiles are not a
 * winning shape (or when the winning tile is not in `ctx.hand`).
 */
export function parseWinningHand(ctx: WinContext): HandParse[] {
  const counts = tilesToCounts(ctx.hand);
  const winKind = kindOf(ctx.winTile);
  if (counts[winKind] === 0) return [];

  const meldSets = ctx.melds.map(meldToSet);
  const setsNeeded = 4 - meldSets.length;
  if (setsNeeded < 0) return [];

  const parses: HandParse[] = [];

  if (meldSets.length === 0) {
    const chiitoi = chiitoitsuParse(counts);
    if (chiitoi) parses.push(chiitoi);
    const kokushi = kokushiParse(counts, winKind);
    if (kokushi) parses.push(kokushi);
  }

  const seen = new Set<string>();

  const build = (
    decomp: RawDecomposition,
    winIndex: number,
    winIsPair: boolean,
  ): void => {
    const sets: ParsedSet[] = decomp.sets.map((set, i) => {
      const containsWinTile = !winIsPair && i === winIndex;
      // A triplet finished by a ron is a minko, never an ankou.
      const concealed = !(
        set.type === 'koutsu' &&
        containsWinTile &&
        !ctx.isTsumo
      );
      return {
        type: set.type,
        kind: set.kind,
        concealed,
        fromMeld: false,
        containsWinTile,
      };
    });
    for (const meldSet of meldSets) sets.push({ ...meldSet });

    const wait: WaitType = winIsPair
      ? 'tanki'
      : waitOf(decomp.sets[winIndex], winKind);
    const signature = sets
      .map(
        (s) =>
          `${s.type}${s.kind}${s.concealed ? 'c' : 'o'}${s.fromMeld ? 'm' : ''}`,
      )
      .sort()
      .join(',');
    const key = `${decomp.pairKind}|${winIsPair ? 'pair' : wait}|${signature}`;
    if (seen.has(key)) return;
    seen.add(key);

    parses.push({
      shape: 'standard',
      sets,
      pairKind: decomp.pairKind,
      pairs: [],
      wait,
      winIsPair,
    });
  };

  for (const decomp of enumerateStandard(counts, setsNeeded)) {
    const usedWinSets = new Set<string>();
    for (let i = 0; i < decomp.sets.length; i += 1) {
      const set = decomp.sets[i];
      const holds =
        set.type === 'shuntsu'
          ? winKind >= set.kind && winKind <= set.kind + 2
          : winKind === set.kind;
      if (!holds) continue;
      const dedupe = `${set.type}:${set.kind}`;
      if (usedWinSets.has(dedupe)) continue;
      usedWinSets.add(dedupe);
      build(decomp, i, false);
    }
    if (decomp.pairKind === winKind) build(decomp, -1, true);
  }

  return parses;
}

// ---------------------------------------------------------------------------
// Dora
// ---------------------------------------------------------------------------

export interface DoraCount {
  dora: number;
  aka: number;
  ura: number;
  total: number;
}

/** Every physical tile in the hand, meld tiles included. */
export function allTiles(ctx: WinContext): TileId[] {
  const tiles = [...ctx.hand];
  for (const meld of ctx.melds) tiles.push(...meld.tiles);
  return tiles;
}

/**
 * Dora / red five / ura dora han. These are **not** yaku: they are added to
 * {@link HandValue.han} only once the hand already has one.
 */
export function countDora(ctx: WinContext): DoraCount {
  const tiles = allTiles(ctx);
  const counts = tilesToCounts(tiles);

  let dora = 0;
  for (const indicator of ctx.doraIndicators) {
    dora += counts[doraFromIndicator(indicator)];
  }

  let aka = 0;
  if (ctx.rules.redFives) {
    for (const tile of tiles) if (isRedFive(tile)) aka += 1;
  }

  let ura = 0;
  if (ctx.rules.uraDora && (ctx.riichi || ctx.doubleRiichi)) {
    for (const indicator of ctx.uraIndicators) {
      ura += counts[doraFromIndicator(indicator)];
    }
  }

  return { dora, aka, ura, total: dora + aka + ura };
}

// ---------------------------------------------------------------------------
// Yaku detection
// ---------------------------------------------------------------------------

const HAKU = HONOR_START + 4;
const HATSU = HONOR_START + 5;
const CHUN = HONOR_START + 6;

const DRAGON_YAKU_ID: Record<number, string> = {
  [HAKU]: 'yakuhai-haku',
  [HATSU]: 'yakuhai-hatsu',
  [CHUN]: 'yakuhai-chun',
};

/** Kinds allowed in ryuuiisou: 2s 3s 4s 6s 8s and hatsu. */
const GREEN_KINDS = new Set<TileKind>([19, 20, 21, 23, 25, HATSU]);

function isTripletSet(set: ParsedSet): boolean {
  return set.type === 'koutsu' || set.type === 'kantsu';
}

/** Every tile kind the reading covers (a kan counts as four tiles). */
function parseTileKinds(parse: HandParse, ctx: WinContext): TileKind[] {
  if (parse.shape === 'chiitoitsu') return parse.pairs.flatMap((k) => [k, k]);
  if (parse.shape === 'kokushi') return countsToKinds(tilesToCounts(ctx.hand));
  const kinds: TileKind[] = [parse.pairKind, parse.pairKind];
  for (const set of parse.sets) {
    if (set.type === 'shuntsu') {
      kinds.push(set.kind, set.kind + 1, set.kind + 2);
    } else if (set.type === 'kantsu') {
      kinds.push(set.kind, set.kind, set.kind, set.kind);
    } else {
      kinds.push(set.kind, set.kind, set.kind);
    }
  }
  return kinds;
}

/** 1112345678999 + one duplicate, fully concealed. */
function chuurenShape(
  kinds: readonly TileKind[],
  ctx: WinContext,
): { chuuren: boolean; junsei: boolean } {
  const none = { chuuren: false, junsei: false };
  if (ctx.melds.length > 0 || kinds.length !== 14) return none;
  const suit = suitOf(kinds[0]);
  if (suit === 'z') return none;
  for (const k of kinds) if (suitOf(k) !== suit) return none;

  const base = kinds[0] - (rankOf(kinds[0]) - 1);
  const counts = new Array<number>(9).fill(0);
  for (const k of kinds) counts[k - base] += 1;
  const pattern = [3, 1, 1, 1, 1, 1, 1, 1, 3];
  let extra = -1;
  for (let i = 0; i < 9; i += 1) {
    const diff = counts[i] - pattern[i];
    if (diff === 0) continue;
    if (diff !== 1 || extra >= 0) return none;
    extra = i;
  }
  if (extra < 0) return none;
  return { chuuren: true, junsei: base + extra === kindOf(ctx.winTile) };
}

function yakumanEntry(id: string, multiplier: number): YakuEntry {
  return { id, han: 0, yakuman: multiplier };
}

/**
 * Yaku for one reading of the hand. Situational flags (riichi, haitei, …) come
 * from `ctx`; the shape-based yaku are read off `parse`.
 *
 * When the hand is a yakuman only the yakuman entries are returned — normal
 * yaku never stack with a yakuman. Distinct yakuman **do** stack with each
 * other (daisangen + tsuuiisou = double), and tenhou/chiihou stack on top.
 *
 * `rules.doubleYakuman` (v1: `false`) decides whether kokushi 13-wait,
 * suuankou tanki and junsei chuuren are worth two yakuman; when it is off they
 * are reported under their plain ids (`kokushi`, `suuankou`, `chuuren`).
 */
export function detectYaku(ctx: WinContext, parse: HandParse): YakuEntry[] {
  const { rules } = ctx;
  const menzen = isMenzen(ctx.melds);
  const open = !menzen;
  const kinds = parseTileKinds(parse, ctx);

  const allYaochuu = kinds.every(isYaochuu);
  const allHonors = kinds.every(isHonor);
  const allTerminals = kinds.every(isTerminal);
  const hasHonor = kinds.some(isHonor);
  const suits = new Set(kinds.filter((k) => !isHonor(k)).map(suitOf));

  const triplets = parse.sets.filter(isTripletSet);
  const kans = parse.sets.filter((s) => s.type === 'kantsu');
  const sequences = parse.sets.filter((s) => s.type === 'shuntsu');
  const concealedTriplets = triplets.filter((s) => s.concealed);
  const seatWindKind = HONOR_START + ctx.seatWind;
  const roundWindKind = HONOR_START + ctx.roundWind;

  // -- Yakuman ------------------------------------------------------------
  const yakuman: YakuEntry[] = [];

  if (ctx.tenhou) yakuman.push(yakumanEntry('tenhou', 1));
  if (ctx.chiihou) yakuman.push(yakumanEntry('chiihou', 1));

  if (parse.shape === 'kokushi') {
    if (parse.winIsPair && rules.doubleYakuman) {
      yakuman.push(yakumanEntry('kokushi-13', 2));
    } else {
      yakuman.push(yakumanEntry('kokushi', 1));
    }
  }

  if (parse.shape === 'standard') {
    if (concealedTriplets.length === 4) {
      if (parse.winIsPair && rules.doubleYakuman) {
        yakuman.push(yakumanEntry('suuankou-tanki', 2));
      } else {
        yakuman.push(yakumanEntry('suuankou', 1));
      }
    }
    if (triplets.filter((s) => isDragon(s.kind)).length === 3) {
      yakuman.push(yakumanEntry('daisangen', 1));
    }
    const windTriplets = triplets.filter(
      (s) => s.kind >= HONOR_START && s.kind < HONOR_START + 4,
    );
    if (windTriplets.length === 4) {
      yakuman.push(yakumanEntry('daisuushii', 1));
    } else if (
      windTriplets.length === 3 &&
      parse.pairKind >= HONOR_START &&
      parse.pairKind < HONOR_START + 4
    ) {
      yakuman.push(yakumanEntry('shousuushii', 1));
    }
    if (kans.length === 4) yakuman.push(yakumanEntry('suukantsu', 1));
  }

  if (allHonors) yakuman.push(yakumanEntry('tsuuiisou', 1));
  if (allTerminals) yakuman.push(yakumanEntry('chinroutou', 1));
  if (kinds.every((k) => GREEN_KINDS.has(k))) {
    yakuman.push(yakumanEntry('ryuuiisou', 1));
  }

  if (parse.shape === 'standard') {
    const { chuuren, junsei } = chuurenShape(kinds, ctx);
    if (chuuren) {
      if (junsei && rules.doubleYakuman) {
        yakuman.push(yakumanEntry('chuuren-9', 2));
      } else {
        yakuman.push(yakumanEntry('chuuren', 1));
      }
    }
  }

  if (yakuman.length > 0) return yakuman;

  // -- Normal yaku --------------------------------------------------------
  const yaku: YakuEntry[] = [];
  const add = (id: string, han: number): void => {
    yaku.push({ id, han, yakuman: 0 });
  };
  /** Kuisagari: `closed` han when menzen, one less when the hand is open. */
  const addKui = (id: string, closed: number): void => {
    add(id, open ? closed - 1 : closed);
  };

  if (ctx.doubleRiichi) add('double-riichi', 2);
  else if (ctx.riichi) add('riichi', 1);
  if (ctx.ippatsu && rules.ippatsu && (ctx.riichi || ctx.doubleRiichi) && menzen) {
    add('ippatsu', 1);
  }
  if (menzen && ctx.isTsumo) add('menzen-tsumo', 1);
  if (ctx.haitei && ctx.isTsumo) add('haitei', 1);
  if (ctx.houtei && !ctx.isTsumo) add('houtei', 1);
  if (ctx.rinshan && ctx.isTsumo) add('rinshan', 1);
  if (ctx.chankan && !ctx.isTsumo) add('chankan', 1);

  const pairIsYakuhai =
    parse.shape === 'standard' &&
    (isDragon(parse.pairKind) ||
      parse.pairKind === seatWindKind ||
      parse.pairKind === roundWindKind);
  const pinfu =
    parse.shape === 'standard' &&
    menzen &&
    sequences.length === 4 &&
    !pairIsYakuhai &&
    parse.wait === 'ryanmen';
  if (pinfu) add('pinfu', 1);

  if (kinds.every((k) => !isYaochuu(k)) && (menzen || rules.kuitan)) {
    add('tanyao', 1);
  }

  if (parse.shape === 'standard') {
    if (roundWindKind === seatWindKind) {
      // Double wind: one triplet, two separate yakuhai.
      if (triplets.some((s) => s.kind === roundWindKind)) {
        add('yakuhai-round-wind', 1);
        add('yakuhai-seat-wind', 1);
      }
    } else {
      if (triplets.some((s) => s.kind === roundWindKind)) {
        add('yakuhai-round-wind', 1);
      }
      if (triplets.some((s) => s.kind === seatWindKind)) {
        add('yakuhai-seat-wind', 1);
      }
    }
    for (const set of triplets) {
      if (isDragon(set.kind)) add(DRAGON_YAKU_ID[set.kind], 1);
    }
  }

  // Iipeiko / ryanpeikou: identical sequences, closed hands only.
  let peiko = 0;
  if (parse.shape === 'standard' && menzen) {
    const bySequence = new Map<TileKind, number>();
    for (const s of sequences) {
      bySequence.set(s.kind, (bySequence.get(s.kind) ?? 0) + 1);
    }
    for (const n of bySequence.values()) peiko += Math.floor(n / 2);
  }
  if (peiko === 1) add('iipeiko', 1);

  const startsBySuit = new Map<string, Set<number>>();
  if (parse.shape === 'standard') {
    for (const s of sequences) {
      const suit = suitOf(s.kind);
      let starts = startsBySuit.get(suit);
      if (!starts) {
        starts = new Set<number>();
        startsBySuit.set(suit, starts);
      }
      starts.add(rankOf(s.kind));
    }

    const setHasYaochuu = (s: ParsedSet): boolean =>
      s.type === 'shuntsu'
        ? rankOf(s.kind) === 1 || rankOf(s.kind) === 7
        : isYaochuu(s.kind);
    const everySetYaochuu =
      parse.sets.every(setHasYaochuu) && isYaochuu(parse.pairKind);
    if (everySetYaochuu && sequences.length > 0 && hasHonor) {
      addKui('chanta', 2);
    }

    for (let rank = 1; rank <= 7; rank += 1) {
      if (
        startsBySuit.get('m')?.has(rank) &&
        startsBySuit.get('p')?.has(rank) &&
        startsBySuit.get('s')?.has(rank)
      ) {
        addKui('sanshoku-doujun', 2);
        break;
      }
    }

    for (const suit of ['m', 'p', 's']) {
      const starts = startsBySuit.get(suit);
      if (starts?.has(1) && starts.has(4) && starts.has(7)) {
        addKui('ittsuu', 2);
        break;
      }
    }

    const tripletRanks = new Map<string, Set<number>>();
    for (const s of triplets) {
      if (isHonor(s.kind)) continue;
      const suit = suitOf(s.kind);
      let ranks = tripletRanks.get(suit);
      if (!ranks) {
        ranks = new Set<number>();
        tripletRanks.set(suit, ranks);
      }
      ranks.add(rankOf(s.kind));
    }
    for (let rank = 1; rank <= 9; rank += 1) {
      if (
        tripletRanks.get('m')?.has(rank) &&
        tripletRanks.get('p')?.has(rank) &&
        tripletRanks.get('s')?.has(rank)
      ) {
        add('sanshoku-doukou', 2);
        break;
      }
    }

    if (concealedTriplets.length === 3) add('sanankou', 2);
    if (triplets.length === 4) add('toitoi', 2);
    if (kans.length === 3) add('sankantsu', 2);
    if (
      triplets.filter((s) => isDragon(s.kind)).length === 2 &&
      isDragon(parse.pairKind)
    ) {
      add('shousangen', 2);
    }
  }

  if (allYaochuu) add('honroutou', 2);
  if (parse.shape === 'chiitoitsu') add('chiitoitsu', 2);

  if (parse.shape === 'standard' && !hasHonor && sequences.length > 0) {
    const setHasTerminal = (s: ParsedSet): boolean =>
      s.type === 'shuntsu'
        ? rankOf(s.kind) === 1 || rankOf(s.kind) === 7
        : isTerminal(s.kind);
    if (parse.sets.every(setHasTerminal) && isTerminal(parse.pairKind)) {
      addKui('junchan', 3);
    }
  }

  if (peiko === 2) add('ryanpeikou', 3);

  if (suits.size === 1) {
    if (hasHonor) addKui('honitsu', 3);
    else addKui('chinitsu', 6);
  }

  return yaku;
}

// ---------------------------------------------------------------------------
// Hand value
// ---------------------------------------------------------------------------

/** A hand is only a legal win when it has a yaku — dora alone is never one. */
export function hasYaku(value: HandValue): boolean {
  return value.yaku.length > 0;
}

function emptyValue(): HandValue {
  return {
    yaku: [],
    han: 0,
    fu: 0,
    yakuman: 0,
    limit: null,
    points: 0,
    tsumoNonDealer: 0,
    tsumoDealer: 0,
  };
}

/** Takame ordering: yakuman, then han, then fu, then points. */
function compareValues(a: HandValue, b: HandValue): number {
  const aHasYaku = a.yaku.length > 0;
  const bHasYaku = b.yaku.length > 0;
  if (aHasYaku !== bHasYaku) return aHasYaku ? 1 : -1;
  if (a.yakuman !== b.yakuman) return a.yakuman - b.yakuman;
  if (a.han !== b.han) return a.han - b.han;
  if (a.fu !== b.fu) return a.fu - b.fu;
  return a.points - b.points;
}

/**
 * Score every reading of the hand and keep the best one under 高点法.
 *
 * `isDealer` defaults to `ctx.seatWind === 0`, which is always correct in a
 * normal game (the East seat is the dealer).
 *
 * - not a winning shape → a zero {@link HandValue} (`han` 0, `yaku` empty)
 * - complete but yakuless → `yaku` empty, `han` = dora count, `points` 0
 * - yakuman → `han` is reported as `13 × yakuman` for display; the yakuman
 *   multiplier itself lives in {@link HandValue.yakuman}
 * - otherwise → `han` = yaku han + dora + aka + ura
 */
export function evaluateHand(ctx: WinContext, isDealer?: boolean): HandValue {
  const parses = parseWinningHand(ctx);
  if (parses.length === 0) return emptyValue();

  const dealer = isDealer ?? ctx.seatWind === 0;
  const dora = countDora(ctx);
  let best: HandValue | null = null;

  for (const parse of parses) {
    const yaku = detectYaku(ctx, parse);
    const fu = calculateFu(ctx, parse, yaku);
    const yakumanTotal = yaku.reduce((sum, y) => sum + y.yakuman, 0);

    let candidate: HandValue;
    if (yakumanTotal > 0) {
      const value = handValue(0, fu, dealer, ctx.isTsumo, ctx.rules, yakumanTotal);
      candidate = {
        yaku,
        han: 13 * yakumanTotal,
        fu,
        yakuman: yakumanTotal,
        limit: value.limit,
        points: value.points,
        tsumoNonDealer: value.tsumoNonDealer,
        tsumoDealer: value.tsumoDealer,
      };
    } else if (yaku.length === 0) {
      candidate = {
        yaku: [],
        han: dora.total,
        fu,
        yakuman: 0,
        limit: null,
        points: 0,
        tsumoNonDealer: 0,
        tsumoDealer: 0,
      };
    } else {
      const han = yaku.reduce((sum, y) => sum + y.han, 0) + dora.total;
      const value = handValue(han, fu, dealer, ctx.isTsumo, ctx.rules, 0);
      candidate = {
        yaku,
        han,
        fu,
        yakuman: 0,
        limit: value.limit,
        points: value.points,
        tsumoNonDealer: value.tsumoNonDealer,
        tsumoDealer: value.tsumoDealer,
      };
    }

    if (best === null || compareValues(candidate, best) > 0) best = candidate;
  }

  return best ?? emptyValue();
}
