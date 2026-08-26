/**
 * Riichi Mahjong — tile helpers.
 *
 * Pure functions over the {@link TileKind} / {@link TileId} representation
 * defined in `types.ts`. Every other engine module builds on these rather than
 * re-deriving suit/rank arithmetic.
 */

import {
  RED_FIVE_TILE_IDS,
  TILE_KIND_COUNT,
  type Suit,
  type TileCounts,
  type TileId,
  type TileKind,
} from './types';

/** First kind of each suit. */
export const MAN_START = 0;
export const PIN_START = 9;
export const SOU_START = 18;
export const HONOR_START = 27;

const RED_FIVE_SET = new Set<TileId>(RED_FIVE_TILE_IDS);

/** Kind of a physical tile. */
export function kindOf(tileId: TileId): TileKind {
  return tileId >> 2;
}

/** Suit of a kind. */
export function suitOf(kind: TileKind): Suit {
  if (kind < PIN_START) return 'm';
  if (kind < SOU_START) return 'p';
  if (kind < HONOR_START) return 's';
  return 'z';
}

/** Rank 1..9 for number tiles, 1..7 for honours (East..Chun). */
export function rankOf(kind: TileKind): number {
  if (kind < HONOR_START) return (kind % 9) + 1;
  return kind - HONOR_START + 1;
}

export function isHonor(kind: TileKind): boolean {
  return kind >= HONOR_START;
}

export function isWind(kind: TileKind): boolean {
  return kind >= HONOR_START && kind < HONOR_START + 4;
}

export function isDragon(kind: TileKind): boolean {
  return kind >= HONOR_START + 4;
}

/** Terminal (1 or 9) or honour. */
export function isYaochuu(kind: TileKind): boolean {
  if (isHonor(kind)) return true;
  const rank = rankOf(kind);
  return rank === 1 || rank === 9;
}

/** Terminal number tile (1 or 9), excluding honours. */
export function isTerminal(kind: TileKind): boolean {
  return !isHonor(kind) && (rankOf(kind) === 1 || rankOf(kind) === 9);
}

/** Simple (2-8) number tile. */
export function isSimple(kind: TileKind): boolean {
  return !isYaochuu(kind);
}

/** The 13 kinds used by kokushi musou, ascending. */
export const YAOCHUU_KINDS: readonly TileKind[] = [
  0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33,
];

/** True when this physical tile is a red five. */
export function isRedFive(tileId: TileId): boolean {
  return RED_FIVE_SET.has(tileId);
}

/** Kind of the dora indicated by an indicator tile. */
export function doraFromIndicator(indicator: TileId): TileKind {
  const kind = kindOf(indicator);
  if (kind < HONOR_START) {
    const base = kind - (kind % 9);
    return base + ((kind - base + 1) % 9);
  }
  if (kind < HONOR_START + 4) {
    // Winds cycle East -> South -> West -> North -> East.
    return HONOR_START + ((kind - HONOR_START + 1) % 4);
  }
  // Dragons cycle Haku -> Hatsu -> Chun -> Haku.
  return HONOR_START + 4 + ((kind - HONOR_START - 4 + 1) % 3);
}

/** Short notation for a kind, e.g. `3m`, `7p`, `1z` (East). */
export function kindToString(kind: TileKind): string {
  return `${rankOf(kind)}${suitOf(kind)}`;
}

/** Short notation for a physical tile; red fives render as `0m`/`0p`/`0s`. */
export function tileToString(tileId: TileId): string {
  const kind = kindOf(tileId);
  if (isRedFive(tileId)) return `0${suitOf(kind)}`;
  return kindToString(kind);
}

/** Histogram of tile kinds. */
export function tilesToCounts(tiles: readonly TileId[]): TileCounts {
  const counts = new Uint8Array(TILE_KIND_COUNT);
  for (const tileId of tiles) counts[kindOf(tileId)] += 1;
  return counts;
}

/** Expand a histogram back to kinds (not physical ids), ascending. */
export function countsToKinds(counts: TileCounts): TileKind[] {
  const kinds: TileKind[] = [];
  for (let kind = 0; kind < TILE_KIND_COUNT; kind += 1) {
    for (let i = 0; i < counts[kind]; i += 1) kinds.push(kind);
  }
  return kinds;
}

export function sortTiles(tiles: readonly TileId[]): TileId[] {
  return [...tiles].sort((a, b) => a - b);
}

/**
 * Parse MPSZ notation into tile kinds, e.g. `123m456p789s11z`.
 * `0` means a red five and parses to the corresponding 5.
 *
 * Returns kinds, not physical ids — use {@link kindsToTileIds} when concrete
 * tiles are needed.
 */
export function parseKinds(notation: string): TileKind[] {
  const kinds: TileKind[] = [];
  let digits: number[] = [];
  for (const ch of notation) {
    if (ch >= '0' && ch <= '9') {
      digits.push(Number(ch));
      continue;
    }
    const suit = ch as Suit;
    const base =
      suit === 'm' ? MAN_START
        : suit === 'p' ? PIN_START
          : suit === 's' ? SOU_START
            : HONOR_START;
    for (const digit of digits) {
      const rank = digit === 0 ? 5 : digit;
      if (suit === 'z' && (rank < 1 || rank > 7)) {
        throw new Error(`Invalid honour rank in "${notation}": ${rank}`);
      }
      kinds.push(base + rank - 1);
    }
    digits = [];
  }
  if (digits.length > 0) {
    throw new Error(`Trailing digits without a suit in "${notation}"`);
  }
  return kinds.sort((a, b) => a - b);
}

/** Parse MPSZ notation straight into a histogram. */
export function parseCounts(notation: string): TileCounts {
  const counts = new Uint8Array(TILE_KIND_COUNT);
  for (const kind of parseKinds(notation)) counts[kind] += 1;
  return counts;
}

/**
 * Pick concrete tile ids for a list of kinds, taking successive copies of each
 * kind. Throws when a kind is requested more than four times.
 */
export function kindsToTileIds(kinds: readonly TileKind[]): TileId[] {
  const used = new Uint8Array(TILE_KIND_COUNT);
  return kinds.map((kind) => {
    const copy = used[kind];
    if (copy >= 4) throw new Error(`More than four copies of kind ${kind}`);
    used[kind] += 1;
    return kind * 4 + copy;
  });
}

/** Format kinds back into MPSZ notation. */
export function formatKinds(kinds: readonly TileKind[]): string {
  const sorted = [...kinds].sort((a, b) => a - b);
  const suits: Suit[] = ['m', 'p', 's', 'z'];
  const buckets: Record<Suit, number[]> = { m: [], p: [], s: [], z: [] };
  for (const kind of sorted) buckets[suitOf(kind)].push(rankOf(kind));
  return suits
    .filter((suit) => buckets[suit].length > 0)
    .map((suit) => `${buckets[suit].join('')}${suit}`)
    .join('');
}
