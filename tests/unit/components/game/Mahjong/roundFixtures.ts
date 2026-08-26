/**
 * Hand-built {@link RoundState} fixtures for the M4 scenario tests.
 *
 * Seeded rounds are great for fuzzing and useless for "what happens when the
 * kakan tile is robbed by the seat two to the left?" — so the scenario tests
 * describe the position directly and let this builder turn it into a
 * consistent round: real tile ids (no kind used more than four times), a wall
 * whose upcoming draws are exactly the ones the test names, and dora
 * indicators sitting in their proper dead-wall slots.
 *
 * This file is deliberately **not** a `*.test.ts`, so vitest's
 * `tests/unit/**\/*.test.ts` glob does not collect it — the same convention
 * `shantenReference.ts` uses next door.
 *
 * Notation is MPSZ with the usual `0` for a red five (`0m` is the red 5m).
 * Tiles are handed out in the order they are written, so the **last tile of a
 * hand string is the one `drawn: true` marks as freshly drawn**.
 */

import { DEFAULT_RULES } from '@/components/game/Mahjong/engine/rules';
import { sortTiles } from '@/components/game/Mahjong/engine/tiles';
import {
  DEAD_WALL_START,
  RED_FIVE_TILE_IDS,
  SEATS,
  TILE_COUNT,
  type DiscardEntry,
  type GameState,
  type Meld,
  type MeldType,
  type PendingDiscard,
  type PlayerState,
  type RiichiState,
  type RoundPhase,
  type RoundState,
  type Rules,
  type Seat,
  type TileId,
  type TileKind,
  type WallState,
  type Wind,
} from '@/components/game/Mahjong/engine/types';

const RED_IDS = new Set<TileId>(RED_FIVE_TILE_IDS);

const SUIT_BASE: Record<string, number> = { m: 0, p: 9, s: 18, z: 27 };

/**
 * Hands out concrete tile ids, never repeating one. `take` skips the red copy
 * of a five so an ordinary `5m` in a fixture is never accidentally aka dora;
 * `takeRed` asks for it explicitly.
 */
export interface TilePool {
  take(kind: TileKind): TileId;
  takeRed(kind: TileKind): TileId;
  /**
   * Any tile the fixture has not asked for, searched from the top of the wall
   * down. Used for the indicators a test does not care about, so they can
   * never exhaust a kind the test *does* care about.
   */
  takeAny(): TileId;
  /** Parse MPSZ into fresh tile ids, preserving the written order. */
  tiles(notation: string): TileId[];
  /** Every id not yet handed out, ascending. */
  leftovers(): TileId[];
}

export function createPool(): TilePool {
  const used = new Set<TileId>();

  const take = (kind: TileKind): TileId => {
    for (let copy = 0; copy < 4; copy += 1) {
      const id = kind * 4 + copy;
      if (used.has(id) || RED_IDS.has(id)) continue;
      used.add(id);
      return id;
    }
    throw new Error(`No ordinary copy of kind ${kind} left`);
  };

  const takeRed = (kind: TileKind): TileId => {
    const id = kind * 4;
    if (!RED_IDS.has(id)) throw new Error(`Kind ${kind} has no red copy`);
    if (used.has(id)) throw new Error(`The red copy of kind ${kind} is already used`);
    used.add(id);
    return id;
  };

  const takeAny = (): TileId => {
    for (let id = TILE_COUNT - 1; id >= 0; id -= 1) {
      if (used.has(id) || RED_IDS.has(id)) continue;
      used.add(id);
      return id;
    }
    throw new Error('No tiles left');
  };

  const tiles = (notation: string): TileId[] => {
    const out: TileId[] = [];
    let digits: number[] = [];
    for (const ch of notation) {
      if (ch >= '0' && ch <= '9') {
        digits.push(Number(ch));
        continue;
      }
      const base = SUIT_BASE[ch];
      if (base === undefined) throw new Error(`Bad suit "${ch}" in "${notation}"`);
      for (const digit of digits) {
        if (digit === 0) {
          if (base === SUIT_BASE.z) throw new Error(`No red honour in "${notation}"`);
          out.push(takeRed(base + 4));
        } else {
          out.push(take(base + digit - 1));
        }
      }
      digits = [];
    }
    if (digits.length > 0) throw new Error(`Trailing digits in "${notation}"`);
    return out;
  };

  const leftovers = (): TileId[] => {
    const out: TileId[] = [];
    for (let id = 0; id < TILE_COUNT; id += 1) if (!used.has(id)) out.push(id);
    return out;
  };

  return { take, takeRed, takeAny, tiles, leftovers };
}

export interface MeldSpec {
  type: MeldType;
  /** Every tile in the meld, MPSZ. Four tiles for any kan. */
  tiles: string;
  /** Index (into the sorted meld) of the claimed tile; ignored for ankan. */
  calledIndex?: number;
  /** Seat the claimed tile came from; defaults to the kamicha. */
  from?: Seat;
}

export interface SeatSpec {
  /** Concealed tiles, MPSZ, in the order they should be handed out. */
  hand: string;
  melds?: MeldSpec[];
  /** Tiles already in this seat's pond, MPSZ. */
  discards?: string;
  /** Mark the last tile of `hand` as the freshly drawn tile. */
  drawn?: boolean;
  riichi?: boolean | Partial<RiichiState>;
  ippatsu?: boolean;
  score?: number;
  temporaryFuriten?: boolean;
  riichiFuriten?: boolean;
}

export interface RoundSpec {
  rules?: Rules;
  roundWind?: Wind;
  dealer?: Seat;
  honba?: number;
  riichiSticks?: number;
  seats: [SeatSpec, SeatSpec, SeatSpec, SeatSpec];
  /** Tiles the live wall will hand out next, in order. */
  nextDraws?: string;
  /**
   * Face-up dora indicators, in reveal order. Defaults to one tile picked
   * from whatever the fixture has not used, so a test that says nothing about
   * dora cannot run a kind out of copies.
   */
  doraIndicators?: string;
  /** Ura indicators matching `doraIndicators`; defaults the same way. */
  uraIndicators?: string;
  /** Tiles the next replacement (rinshan) draws will hand out, in order. */
  rinshan?: string;
  /** Live tiles left to draw. Defaults to 30. */
  liveRemaining?: number;
  turn?: Seat;
  phase?: RoundPhase;
  /**
   * Open a response window on a tile already placed by `seat`: its last
   * discard, or (with `chankan`) the last tile of its last meld.
   */
  pending?: { seat: Seat; chankan?: boolean };
  turnCount?: number;
  firstGoAround?: boolean;
  kanCount?: number;
  lastDrawSource?: 'wall' | 'rinshan' | null;
}

function buildMeld(pool: TilePool, spec: MeldSpec, seat: Seat): Meld {
  const tiles = sortTiles(pool.tiles(spec.tiles));
  const expected = spec.type === 'chi' || spec.type === 'pon' ? 3 : 4;
  if (tiles.length !== expected) {
    throw new Error(`${spec.type} needs ${expected} tiles, got ${tiles.length}`);
  }
  if (spec.type === 'ankan') {
    return { type: 'ankan', tiles, calledTile: null, fromSeat: null };
  }
  return {
    type: spec.type,
    tiles,
    calledTile: tiles[spec.calledIndex ?? 0],
    fromSeat: spec.from ?? (((seat + 3) % 4) as Seat),
  };
}

function buildDiscards(pool: TilePool, notation: string | undefined): DiscardEntry[] {
  if (notation === undefined) return [];
  return pool.tiles(notation).map((tile) => ({
    tile,
    riichi: false,
    tsumogiri: false,
    calledBy: null,
  }));
}

function buildRiichi(spec: SeatSpec): RiichiState | null {
  if (spec.riichi === undefined || spec.riichi === false) return null;
  const base: RiichiState = { declaredAtDiscard: 0, declaredAtTurn: 0, double: false };
  return spec.riichi === true ? base : { ...base, ...spec.riichi };
}

/**
 * Turn a {@link RoundSpec} into a playable round.
 *
 * The wall is laid out so that the tiles the fixture never mentions fill the
 * unused slots, `nextDraws` sits immediately under `drawIndex`, the dora and
 * ura indicators occupy their real dead-wall positions, and the replacement
 * tiles come off the far end. Tile conservation therefore holds for a fixture
 * exactly as it does for a dealt round.
 */
export function buildRound(spec: RoundSpec): RoundState {
  const rules = spec.rules ?? DEFAULT_RULES;
  const pool = createPool();
  const dealt: TileId[] = [];

  const players = SEATS.map((seat) => {
    const seatSpec = spec.seats[seat];
    const handTiles = pool.tiles(seatSpec.hand);
    const drawn = seatSpec.drawn === true ? handTiles[handTiles.length - 1] : null;
    const melds = (seatSpec.melds ?? []).map((meld) => buildMeld(pool, meld, seat));
    const discards = buildDiscards(pool, seatSpec.discards);

    dealt.push(...handTiles);
    for (const meld of melds) dealt.push(...meld.tiles);
    for (const entry of discards) dealt.push(entry.tile);

    const player: PlayerState = {
      seat,
      hand: sortTiles(handTiles),
      drawn,
      melds,
      discards,
      riichi: buildRiichi(seatSpec),
      score: seatSpec.score ?? rules.startingScore,
      temporaryFuriten: seatSpec.temporaryFuriten ?? false,
      riichiFuriten: seatSpec.riichiFuriten ?? false,
      ippatsu: seatSpec.ippatsu ?? false,
    };
    return player;
  }) as [PlayerState, PlayerState, PlayerState, PlayerState];

  const kanCount = spec.kanCount ?? players.reduce(
    (sum, player) => sum + player.melds.filter((m) => m.type !== 'chi' && m.type !== 'pon').length,
    0,
  );
  const liveEnd = DEAD_WALL_START - kanCount;
  const liveRemaining = spec.liveRemaining ?? 30;
  const drawIndex = liveEnd - liveRemaining;
  if (drawIndex < dealt.length) {
    throw new Error(
      `Fixture deals ${dealt.length} tiles but the live wall starts at ${drawIndex}`,
    );
  }

  const slots: (TileId | null)[] = new Array<TileId | null>(TILE_COUNT).fill(null);
  const doraTiles =
    spec.doraIndicators !== undefined ? pool.tiles(spec.doraIndicators) : [pool.takeAny()];
  doraTiles.forEach((tile, i) => {
    slots[130 - 2 * i] = tile;
  });
  const uraTiles =
    spec.uraIndicators !== undefined
      ? pool.tiles(spec.uraIndicators)
      : doraTiles.map(() => pool.takeAny());
  uraTiles.forEach((tile, i) => {
    slots[131 - 2 * i] = tile;
  });
  if (spec.rinshan !== undefined) {
    pool.tiles(spec.rinshan).forEach((tile, n) => {
      slots[135 - (kanCount + n)] = tile;
    });
  }
  // Replacement slots the fixture's kans already consumed hold nothing the
  // engine may read again, so they get a duplicate rather than eating a unique
  // tile id and breaking conservation.
  for (let n = 0; n < kanCount; n += 1) slots[135 - n] = dealt[n];
  if (spec.nextDraws !== undefined) {
    pool.tiles(spec.nextDraws).forEach((tile, i) => {
      slots[drawIndex + i] = tile;
    });
  }

  const filler = [...dealt, ...pool.leftovers()];
  let next = 0;
  for (let i = 0; i < TILE_COUNT; i += 1) {
    if (slots[i] !== null) continue;
    slots[i] = filler[next];
    next += 1;
  }

  const wall: WallState = {
    tiles: slots as TileId[],
    drawIndex,
    liveEnd,
    rinshanDrawn: kanCount,
    doraIndicators: doraTiles,
    uraIndicators: uraTiles.slice(0, doraTiles.length),
  };

  let pendingDiscard: PendingDiscard | null = null;
  if (spec.pending !== undefined) {
    const owner = players[spec.pending.seat];
    if (spec.pending.chankan === true) {
      const meld = owner.melds[owner.melds.length - 1];
      pendingDiscard = {
        seat: spec.pending.seat,
        tile: meld.tiles[meld.tiles.length - 1],
        chankan: true,
      };
    } else {
      pendingDiscard = {
        seat: spec.pending.seat,
        tile: owner.discards[owner.discards.length - 1].tile,
        chankan: false,
      };
    }
  }

  const dealer = spec.dealer ?? 0;
  const turn = spec.turn ?? pendingDiscard?.seat ?? dealer;
  const phase: RoundPhase =
    spec.phase ?? (pendingDiscard !== null ? 'call' : 'discard');

  return {
    rules,
    roundWind: spec.roundWind ?? 0,
    dealer,
    honba: spec.honba ?? 0,
    riichiSticks: spec.riichiSticks ?? 0,
    wall,
    players,
    turn,
    phase,
    pendingDiscard,
    pendingResponses: [],
    pendingClaims: [],
    lastDrawSource: spec.lastDrawSource ?? 'wall',
    kanCount,
    turnCount: spec.turnCount ?? 10,
    firstGoAround: spec.firstGoAround ?? false,
    result: null,
  };
}

/** Wrap a round in a minimal {@link GameState} for `advanceHand` tests. */
export function buildGame(
  round: RoundState,
  overrides: Partial<GameState> = {},
): GameState {
  return {
    rules: round.rules,
    handIndex: 0,
    roundWind: round.roundWind,
    dealer: round.dealer,
    honba: round.honba,
    riichiSticks: round.riichiSticks,
    scores: [
      round.players[0].score,
      round.players[1].score,
      round.players[2].score,
      round.players[3].score,
    ],
    round,
    finished: false,
    placements: null,
    ...overrides,
  };
}
