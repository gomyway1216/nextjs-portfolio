/**
 * Riichi Mahjong M3 — yaku detection, fu and scoring.
 *
 * The score table in `SCORE_TABLE` is transcribed from the standard Japanese
 * fu x han payment table and is deliberately hard-coded rather than derived,
 * so that a regression in `basePoints` cannot silently "fix" the expectation.
 */

import { describe, expect, it } from 'vitest';

import { DEFAULT_RULES } from '@/components/game/Mahjong/engine/rules';
import {
  basePoints,
  calculateFu,
  handValue,
  settleAbortiveDraw,
  settleExhaustiveDraw,
  settleWin,
} from '@/components/game/Mahjong/engine/score';
import { kindOf, parseKinds } from '@/components/game/Mahjong/engine/tiles';
import {
  countDora,
  detectYaku,
  evaluateHand,
  hasYaku,
  makeWinContext,
  parseWinningHand,
  type WinContext,
} from '@/components/game/Mahjong/engine/yaku';
import type {
  HandValue,
  MeldType,
  Meld,
  Rules,
  Seat,
  TileId,
  TileKind,
  Wind,
} from '@/components/game/Mahjong/engine/types';

// ---------------------------------------------------------------------------
// Fixtures helpers
// ---------------------------------------------------------------------------

const FIVE_KINDS = new Set<TileKind>([4, 13, 22]);

/**
 * Hands out physical tile ids for a list of kinds. Copy 0 of each five is the
 * red five, so fives are handed out as copies 1,2,3,0 — a test only picks up
 * an aka dora when it explicitly asks for one.
 */
function makeAllocator(): (kind: TileKind) => TileId {
  const taken = new Set<TileId>();
  return (kind: TileKind): TileId => {
    const order = FIVE_KINDS.has(kind) ? [1, 2, 3, 0] : [0, 1, 2, 3];
    for (const copy of order) {
      const id = kind * 4 + copy;
      if (!taken.has(id)) {
        taken.add(id);
        return id;
      }
    }
    throw new Error(`no copies left for kind ${kind}`);
  };
}

type MeldSpec = [MeldType, string];

interface HandSpec {
  /** Concealed tiles in MPSZ notation, winning tile included. */
  hand: string;
  melds?: MeldSpec[];
  /** Winning tile, e.g. `'4m'`. */
  win: string;
  tsumo?: boolean;
  seat?: Wind;
  round?: Wind;
  riichi?: boolean;
  doubleRiichi?: boolean;
  ippatsu?: boolean;
  haitei?: boolean;
  houtei?: boolean;
  rinshan?: boolean;
  chankan?: boolean;
  tenhou?: boolean;
  chiihou?: boolean;
  /** Dora indicator kinds in MPSZ notation. */
  dora?: string;
  ura?: string;
  /** Fives to swap for their red copy, e.g. `'5m'`. */
  aka?: string;
  rules?: Partial<Rules>;
}

function buildContext(spec: HandSpec): WinContext {
  const alloc = makeAllocator();
  const melds: Meld[] = (spec.melds ?? []).map(([type, notation]) => {
    const tiles = parseKinds(notation).map(alloc);
    return {
      type,
      tiles,
      calledTile: type === 'ankan' ? null : tiles[0],
      fromSeat: type === 'ankan' ? null : (1 as Seat),
    };
  });

  const hand = parseKinds(spec.hand).map(alloc);

  // Swap in red fives where the case asks for them.
  for (const kind of parseKinds(spec.aka ?? '')) {
    const red = kind * 4;
    const index = hand.findIndex((t) => kindOf(t) === kind && t !== red);
    if (index < 0 || hand.includes(red)) {
      throw new Error(`cannot make an aka five of kind ${kind}`);
    }
    hand[index] = red;
  }

  const winKind = parseKinds(spec.win)[0];
  const winTile = hand.find((t) => kindOf(t) === winKind);
  if (winTile === undefined) {
    throw new Error(`winning tile ${spec.win} is not in the hand`);
  }

  // Indicators only need the right kind; copy 3 is never a red five.
  const indicators = (notation: string): TileId[] =>
    parseKinds(notation).map((kind) => kind * 4 + 3);

  return makeWinContext({
    hand,
    melds,
    winTile,
    isTsumo: spec.tsumo ?? false,
    seatWind: spec.seat ?? 1,
    roundWind: spec.round ?? 0,
    riichi: spec.riichi ?? false,
    doubleRiichi: spec.doubleRiichi ?? false,
    ippatsu: spec.ippatsu ?? false,
    haitei: spec.haitei ?? false,
    houtei: spec.houtei ?? false,
    rinshan: spec.rinshan ?? false,
    chankan: spec.chankan ?? false,
    tenhou: spec.tenhou ?? false,
    chiihou: spec.chiihou ?? false,
    doraIndicators: indicators(spec.dora ?? ''),
    uraIndicators: indicators(spec.ura ?? ''),
    rules: { ...DEFAULT_RULES, ...spec.rules },
  });
}

interface YakuCase extends HandSpec {
  name: string;
  yaku: string[];
  han: number;
  fu: number;
  yakuman?: number;
  points?: number;
}

// A closed all-simples body reused by the situational-yaku cases.
const PINFU_BODY = '234567m11p345678s';

// ---------------------------------------------------------------------------
// 1. The full fu x han payment table
// ---------------------------------------------------------------------------

/**
 * `[han, fu, ronNonDealer, ronDealer, tsumoFromNonDealer, tsumoFromDealer,
 *   dealerTsumoFromEach]`
 *
 * Transcribed from the standard table. Combinations that cannot occur in a
 * real hand (20fu 1han, 25fu 1han, ...) still follow `fu x 2^(2+han)` and are
 * listed for completeness.
 */
const SCORE_TABLE: readonly (readonly number[])[] = [
  [1, 20, 700, 1000, 200, 400, 400],
  [1, 25, 800, 1200, 200, 400, 400],
  [1, 30, 1000, 1500, 300, 500, 500],
  [1, 40, 1300, 2000, 400, 700, 700],
  [1, 50, 1600, 2400, 400, 800, 800],
  [1, 60, 2000, 2900, 500, 1000, 1000],
  [1, 70, 2300, 3400, 600, 1200, 1200],
  [1, 80, 2600, 3900, 700, 1300, 1300],
  [1, 90, 2900, 4400, 800, 1500, 1500],
  [1, 100, 3200, 4800, 800, 1600, 1600],
  [1, 110, 3600, 5300, 900, 1800, 1800],
  [2, 20, 1300, 2000, 400, 700, 700],
  [2, 25, 1600, 2400, 400, 800, 800],
  [2, 30, 2000, 2900, 500, 1000, 1000],
  [2, 40, 2600, 3900, 700, 1300, 1300],
  [2, 50, 3200, 4800, 800, 1600, 1600],
  [2, 60, 3900, 5800, 1000, 2000, 2000],
  [2, 70, 4500, 6800, 1200, 2300, 2300],
  [2, 80, 5200, 7700, 1300, 2600, 2600],
  [2, 90, 5800, 8700, 1500, 2900, 2900],
  [2, 100, 6400, 9600, 1600, 3200, 3200],
  [2, 110, 7100, 10600, 1800, 3600, 3600],
  [3, 20, 2600, 3900, 700, 1300, 1300],
  [3, 25, 3200, 4800, 800, 1600, 1600],
  [3, 30, 3900, 5800, 1000, 2000, 2000],
  [3, 40, 5200, 7700, 1300, 2600, 2600],
  [3, 50, 6400, 9600, 1600, 3200, 3200],
  [3, 60, 7700, 11600, 2000, 3900, 3900],
  [3, 70, 8000, 12000, 2000, 4000, 4000],
  [3, 80, 8000, 12000, 2000, 4000, 4000],
  [3, 90, 8000, 12000, 2000, 4000, 4000],
  [3, 100, 8000, 12000, 2000, 4000, 4000],
  [3, 110, 8000, 12000, 2000, 4000, 4000],
  [4, 20, 5200, 7700, 1300, 2600, 2600],
  [4, 25, 6400, 9600, 1600, 3200, 3200],
  [4, 30, 7700, 11600, 2000, 3900, 3900],
  [4, 40, 8000, 12000, 2000, 4000, 4000],
  [4, 50, 8000, 12000, 2000, 4000, 4000],
  [4, 60, 8000, 12000, 2000, 4000, 4000],
  [4, 70, 8000, 12000, 2000, 4000, 4000],
  [4, 80, 8000, 12000, 2000, 4000, 4000],
  [4, 90, 8000, 12000, 2000, 4000, 4000],
  [4, 100, 8000, 12000, 2000, 4000, 4000],
  [4, 110, 8000, 12000, 2000, 4000, 4000],
  [5, 30, 8000, 12000, 2000, 4000, 4000],
  [6, 30, 12000, 18000, 3000, 6000, 6000],
  [7, 30, 12000, 18000, 3000, 6000, 6000],
  [8, 30, 16000, 24000, 4000, 8000, 8000],
  [9, 30, 16000, 24000, 4000, 8000, 8000],
  [10, 30, 16000, 24000, 4000, 8000, 8000],
  [11, 30, 24000, 36000, 6000, 12000, 12000],
  [12, 30, 24000, 36000, 6000, 12000, 12000],
  [13, 30, 32000, 48000, 8000, 16000, 16000],
  [14, 30, 32000, 48000, 8000, 16000, 16000],
];

const LIMIT_TABLE: readonly (readonly [number, number, string | null])[] = [
  [1, 30, null],
  [3, 60, null],
  [4, 30, null],
  [3, 70, 'mangan'],
  [4, 40, 'mangan'],
  [5, 20, 'mangan'],
  [6, 30, 'haneman'],
  [7, 110, 'haneman'],
  [8, 30, 'baiman'],
  [10, 25, 'baiman'],
  [11, 30, 'sanbaiman'],
  [12, 40, 'sanbaiman'],
  [13, 25, 'yakuman'],
  [20, 30, 'yakuman'],
];

describe('handValue — the full fu x han table', () => {
  it.each(SCORE_TABLE)(
    '%d han %d fu',
    (han, fu, ronKo, ronOya, tsumoKoPays, tsumoOyaPays, dealerTsumoEach) => {
      const ronNonDealer = handValue(han, fu, false, false, DEFAULT_RULES);
      expect(ronNonDealer.points).toBe(ronKo);
      expect(ronNonDealer.tsumoNonDealer).toBe(0);
      expect(ronNonDealer.tsumoDealer).toBe(0);

      const ronDealer = handValue(han, fu, true, false, DEFAULT_RULES);
      expect(ronDealer.points).toBe(ronOya);

      const tsumoNonDealer = handValue(han, fu, false, true, DEFAULT_RULES);
      expect(tsumoNonDealer.tsumoNonDealer).toBe(tsumoKoPays);
      expect(tsumoNonDealer.tsumoDealer).toBe(tsumoOyaPays);
      expect(tsumoNonDealer.points).toBe(tsumoKoPays * 2 + tsumoOyaPays);

      const tsumoDealer = handValue(han, fu, true, true, DEFAULT_RULES);
      expect(tsumoDealer.tsumoNonDealer).toBe(dealerTsumoEach);
      expect(tsumoDealer.tsumoDealer).toBe(0);
      expect(tsumoDealer.points).toBe(dealerTsumoEach * 3);
    },
  );

  it.each(LIMIT_TABLE)('limit name for %d han %d fu', (han, fu, limit) => {
    expect(handValue(han, fu, false, false, DEFAULT_RULES).limit).toBe(limit);
  });

  it('does not apply kiriage mangan (4 han 30 fu stays 7700 / 11600)', () => {
    expect(basePoints(4, 30, DEFAULT_RULES).base).toBe(1920);
    expect(handValue(4, 30, false, false, DEFAULT_RULES).points).toBe(7700);
    expect(handValue(4, 30, true, false, DEFAULT_RULES).points).toBe(11600);
    expect(basePoints(3, 60, DEFAULT_RULES).base).toBe(1920);
    expect(handValue(3, 60, false, false, DEFAULT_RULES).points).toBe(7700);
  });

  it('counts 13+ han as kazoe yakuman only when the rule is on', () => {
    expect(handValue(13, 30, false, false, DEFAULT_RULES).points).toBe(32000);
    const noKazoe: Rules = { ...DEFAULT_RULES, kazoeYakuman: false };
    expect(handValue(13, 30, false, false, noKazoe).points).toBe(24000);
    expect(handValue(13, 30, false, false, noKazoe).limit).toBe('sanbaiman');
    expect(handValue(26, 30, false, false, noKazoe).points).toBe(24000);
  });

  it('scales true yakuman by the multiplier', () => {
    expect(handValue(0, 20, false, false, DEFAULT_RULES, 1).points).toBe(32000);
    expect(handValue(0, 20, true, false, DEFAULT_RULES, 1).points).toBe(48000);
    expect(handValue(0, 20, false, true, DEFAULT_RULES, 1)).toMatchObject({
      tsumoNonDealer: 8000,
      tsumoDealer: 16000,
      points: 32000,
    });
    expect(handValue(0, 20, true, true, DEFAULT_RULES, 2)).toMatchObject({
      tsumoNonDealer: 32000,
      points: 96000,
    });
    expect(handValue(0, 20, false, false, DEFAULT_RULES, 3).points).toBe(96000);
  });
});

// ---------------------------------------------------------------------------
// 2. Yaku snapshots
// ---------------------------------------------------------------------------

const YAKU_CASES: YakuCase[] = [
  // -- situational / 1 han ------------------------------------------------
  {
    name: 'riichi alone (kanchan ron)',
    hand: PINFU_BODY,
    win: '3m',
    riichi: true,
    yaku: ['riichi'],
    han: 1,
    fu: 40,
  },
  {
    name: 'riichi + ippatsu + menzen tsumo + pinfu',
    hand: PINFU_BODY,
    win: '4m',
    tsumo: true,
    riichi: true,
    ippatsu: true,
    yaku: ['riichi', 'ippatsu', 'menzen-tsumo', 'pinfu'],
    han: 4,
    fu: 20,
    points: 5200,
  },
  {
    name: 'ippatsu is suppressed when rules.ippatsu is off',
    hand: PINFU_BODY,
    win: '4m',
    tsumo: true,
    riichi: true,
    ippatsu: true,
    rules: { ippatsu: false },
    yaku: ['riichi', 'menzen-tsumo', 'pinfu'],
    han: 3,
    fu: 20,
  },
  {
    name: 'double riichi + houtei ron on a pinfu',
    hand: PINFU_BODY,
    win: '4m',
    doubleRiichi: true,
    houtei: true,
    yaku: ['double-riichi', 'houtei', 'pinfu'],
    han: 4,
    fu: 30,
  },
  {
    name: 'menzen tsumo alone',
    hand: '111m234567p88s234s',
    win: '1m',
    tsumo: true,
    yaku: ['menzen-tsumo'],
    han: 1,
    fu: 30,
  },
  {
    name: 'haitei raoyue',
    hand: '111m234567p88s234s',
    win: '1m',
    tsumo: true,
    haitei: true,
    yaku: ['menzen-tsumo', 'haitei'],
    han: 2,
    fu: 30,
  },
  {
    name: 'rinshan kaihou',
    hand: '111m234567p88s234s',
    win: '1m',
    tsumo: true,
    rinshan: true,
    yaku: ['menzen-tsumo', 'rinshan'],
    han: 2,
    fu: 30,
  },
  {
    name: 'houtei raoyui (ron)',
    hand: PINFU_BODY,
    win: '3m',
    houtei: true,
    yaku: ['houtei'],
    han: 1,
    fu: 40,
  },
  {
    name: 'chankan',
    hand: PINFU_BODY,
    win: '3m',
    chankan: true,
    yaku: ['chankan'],
    han: 1,
    fu: 40,
  },
  {
    name: 'haitei does not fire on a ron',
    hand: PINFU_BODY,
    win: '3m',
    haitei: true,
    riichi: true,
    yaku: ['riichi'],
    han: 1,
    fu: 40,
  },
  {
    name: 'houtei does not fire on a tsumo',
    hand: PINFU_BODY,
    win: '3m',
    tsumo: true,
    houtei: true,
    yaku: ['menzen-tsumo'],
    han: 1,
    fu: 30,
  },

  // -- pinfu --------------------------------------------------------------
  {
    name: 'pinfu tsumo is 20 fu',
    hand: PINFU_BODY,
    win: '4m',
    tsumo: true,
    yaku: ['menzen-tsumo', 'pinfu'],
    han: 2,
    fu: 20,
    points: 1500,
  },
  {
    name: 'pinfu ron is 30 fu',
    hand: PINFU_BODY,
    win: '4m',
    yaku: ['pinfu'],
    han: 1,
    fu: 30,
    points: 1000,
  },
  {
    name: 'no pinfu on a kanchan wait',
    hand: PINFU_BODY,
    win: '3m',
    riichi: true,
    yaku: ['riichi'],
    han: 1,
    fu: 40,
  },
  {
    name: 'no pinfu with a yakuhai pair (round wind East)',
    hand: '234567m11z345678s',
    win: '4m',
    riichi: true,
    yaku: ['riichi'],
    han: 1,
    fu: 40,
  },
  {
    name: 'open all-sequence hand floors at 30 fu (kuipinfu)',
    hand: '234m234p567m88p',
    melds: [['chi', '234s']],
    win: '4m',
    yaku: ['tanyao', 'sanshoku-doujun'],
    han: 2,
    fu: 30,
  },

  // -- tanyao -------------------------------------------------------------
  {
    name: 'tanyao closed ron',
    hand: '234567m22p345678s',
    win: '3m',
    yaku: ['tanyao'],
    han: 1,
    fu: 40,
  },
  {
    name: 'tanyao + pinfu + menzen tsumo',
    hand: '234567m22p345678s',
    win: '4m',
    tsumo: true,
    yaku: ['menzen-tsumo', 'pinfu', 'tanyao'],
    han: 3,
    fu: 20,
  },
  {
    name: 'open tanyao (kuitan on)',
    hand: '567m22p345678s',
    melds: [['chi', '234m']],
    win: '6m',
    yaku: ['tanyao'],
    han: 1,
    fu: 30,
  },
  {
    name: 'open tanyao is not a yaku when kuitan is off',
    hand: '567m22p345678s',
    melds: [['chi', '234m']],
    win: '6m',
    rules: { kuitan: false },
    yaku: [],
    han: 0,
    fu: 30,
    points: 0,
  },
  {
    name: 'closed tanyao still counts when kuitan is off',
    hand: '234567m22p345678s',
    win: '3m',
    rules: { kuitan: false },
    yaku: ['tanyao'],
    han: 1,
    fu: 40,
  },

  // -- yakuhai ------------------------------------------------------------
  {
    name: 'yakuhai haku (open pon)',
    hand: '234567m88p234s',
    melds: [['pon', '555z']],
    win: '4m',
    yaku: ['yakuhai-haku'],
    han: 1,
    fu: 30,
  },
  {
    name: 'yakuhai hatsu (closed triplet)',
    hand: '666z234567m88p234s',
    win: '4m',
    yaku: ['yakuhai-hatsu'],
    han: 1,
    fu: 40,
  },
  {
    name: 'yakuhai chun (closed triplet)',
    hand: '777z234567m88p234s',
    win: '4m',
    yaku: ['yakuhai-chun'],
    han: 1,
    fu: 40,
  },
  {
    name: 'seat wind South',
    hand: '222z234567m88p234s',
    win: '4m',
    seat: 1,
    round: 0,
    yaku: ['yakuhai-seat-wind'],
    han: 1,
    fu: 40,
  },
  {
    name: 'round wind East',
    hand: '111z234567m88p234s',
    win: '4m',
    seat: 1,
    round: 0,
    yaku: ['yakuhai-round-wind'],
    han: 1,
    fu: 40,
  },
  {
    name: 'double East counts twice',
    hand: '111z234567m88p234s',
    win: '4m',
    seat: 0,
    round: 0,
    yaku: ['yakuhai-round-wind', 'yakuhai-seat-wind'],
    han: 2,
    fu: 40,
  },
  {
    name: 'South wind is worthless in the East round to a West seat',
    hand: '222z234567m88p234s',
    win: '4m',
    seat: 2,
    round: 0,
    riichi: true,
    yaku: ['riichi'],
    han: 1,
    fu: 40,
  },
  {
    name: 'two dragon triplets stack',
    hand: '555z666z234m88p234s',
    win: '4m',
    yaku: ['yakuhai-haku', 'yakuhai-hatsu'],
    han: 2,
    fu: 50,
  },

  // -- pair fu: double wind is 4 fu ---------------------------------------
  {
    name: 'double East pair is 4 fu (42 -> 50)',
    hand: '999m234567p11z234s',
    win: '4p',
    seat: 0,
    round: 0,
    riichi: true,
    yaku: ['riichi'],
    han: 1,
    fu: 50,
  },
  {
    name: 'single wind pair is 2 fu (40 -> 40)',
    hand: '999m234567p11z234s',
    win: '4p',
    seat: 1,
    round: 0,
    riichi: true,
    yaku: ['riichi'],
    han: 1,
    fu: 40,
  },
  {
    name: 'valueless wind pair is 0 fu (38 -> 40)',
    hand: '999m234567p11z234s',
    win: '4p',
    seat: 2,
    round: 3,
    riichi: true,
    yaku: ['riichi'],
    han: 1,
    fu: 40,
  },
  {
    name: 'dragon pair is 2 fu',
    hand: '999m234567p77z234s',
    win: '4p',
    riichi: true,
    yaku: ['riichi'],
    han: 1,
    fu: 40,
  },

  // -- iipeiko / ryanpeikou ------------------------------------------------
  {
    name: 'iipeiko',
    hand: '112233m456789p99s',
    win: '9s',
    yaku: ['iipeiko'],
    han: 1,
    fu: 40,
  },
  {
    name: 'iipeiko is dead on an open hand',
    hand: '112233m456p99s',
    melds: [['chi', '789p']],
    win: '9s',
    yaku: [],
    han: 0,
    fu: 30,
    points: 0,
  },
  {
    name: 'ryanpeikou beats chiitoitsu (ron)',
    hand: '112233m445566p99s',
    win: '9s',
    yaku: ['ryanpeikou'],
    han: 3,
    fu: 40,
  },
  {
    name: 'ryanpeikou beats chiitoitsu (tsumo)',
    hand: '112233m445566p99s',
    win: '9s',
    tsumo: true,
    yaku: ['menzen-tsumo', 'ryanpeikou'],
    han: 4,
    fu: 30,
  },
  {
    name: 'ryanpeikou + chinitsu',
    hand: '112233445566p99p',
    win: '9p',
    yaku: ['ryanpeikou', 'chinitsu'],
    han: 9,
    fu: 40,
    points: 16000,
  },

  // -- chiitoitsu ----------------------------------------------------------
  {
    name: 'chiitoitsu is fixed at 25 fu',
    hand: '1133m5577p99s2244z',
    win: '9s',
    yaku: ['chiitoitsu'],
    han: 2,
    fu: 25,
    points: 1600,
  },
  {
    name: 'chiitoitsu + tanyao + riichi',
    hand: '223344m5566p7788s',
    win: '8s',
    riichi: true,
    yaku: ['riichi', 'tanyao', 'chiitoitsu'],
    han: 4,
    fu: 25,
    points: 6400,
  },
  {
    name: 'chiitoitsu + honroutou',
    hand: '1199m1199p1199s11z',
    win: '1z',
    yaku: ['honroutou', 'chiitoitsu'],
    han: 4,
    fu: 25,
  },
  {
    name: 'chiitoitsu + honitsu',
    hand: '113399p11223355z',
    win: '5z',
    yaku: ['chiitoitsu', 'honitsu'],
    han: 5,
    fu: 25,
    points: 8000,
  },
  {
    name: 'chiitoitsu + chinitsu',
    hand: '11223344557799p',
    win: '5p',
    yaku: ['chiitoitsu', 'chinitsu'],
    han: 8,
    fu: 25,
    points: 16000,
  },
  {
    name: 'chiitoitsu tsumo',
    hand: '1133m5577p99s2244z',
    win: '4z',
    tsumo: true,
    yaku: ['menzen-tsumo', 'chiitoitsu'],
    han: 3,
    fu: 25,
    points: 3200,
  },

  // -- chanta / junchan ----------------------------------------------------
  {
    name: 'chanta closed',
    hand: '123m789m123p11z999s',
    win: '3p',
    yaku: ['chanta'],
    han: 2,
    fu: 50,
  },
  {
    name: 'chanta open (kuisagari to 1 han)',
    hand: '789m123p11z999s',
    melds: [['chi', '123m']],
    win: '3p',
    yaku: ['chanta'],
    han: 1,
    fu: 40,
  },
  {
    name: 'junchan closed',
    hand: '123m789m123p11s999s',
    win: '3p',
    yaku: ['junchan'],
    han: 3,
    fu: 40,
  },
  {
    name: 'junchan open (kuisagari to 2 han)',
    hand: '789m123p11s999s',
    melds: [['chi', '123m']],
    win: '3p',
    yaku: ['junchan'],
    han: 2,
    fu: 30,
  },
  {
    name: 'junchan + sanshoku doujun',
    hand: '123789m123p123s11s',
    win: '3s',
    yaku: ['sanshoku-doujun', 'junchan'],
    han: 5,
    fu: 40,
    points: 8000,
  },
  {
    name: 'chanta + honitsu + yakuhai',
    hand: '123789p99p111z555z',
    win: '3p',
    yaku: ['yakuhai-round-wind', 'yakuhai-haku', 'chanta', 'honitsu'],
    han: 7,
    fu: 50,
    points: 12000,
  },
  {
    name: 'all-triplet terminal hand is honroutou, not chanta',
    hand: '111m999m111z99p999s',
    win: '9s',
    yaku: ['yakuhai-round-wind', 'sanankou', 'toitoi', 'honroutou'],
    han: 7,
    fu: 60,
    points: 12000,
  },

  // -- sanshoku ------------------------------------------------------------
  {
    name: 'sanshoku doujun closed',
    hand: '234567m234p234s11z',
    win: '2m',
    yaku: ['sanshoku-doujun'],
    han: 2,
    fu: 40,
  },
  {
    name: 'sanshoku doujun open (kuisagari)',
    hand: '567m234p234s11z',
    melds: [['chi', '234m']],
    win: '2p',
    yaku: ['sanshoku-doujun'],
    han: 1,
    fu: 30,
  },
  {
    name: 'sanshoku doukou (ron on the third triplet)',
    hand: '333m333p333s567m11z',
    win: '3m',
    yaku: ['sanshoku-doukou'],
    han: 2,
    fu: 50,
  },
  {
    name: 'sanshoku doukou + sanankou on a tsumo',
    hand: '333m333p333s567m11z',
    win: '3m',
    tsumo: true,
    yaku: ['menzen-tsumo', 'sanshoku-doukou', 'sanankou'],
    han: 5,
    fu: 40,
    points: 8000,
  },

  // -- ittsuu --------------------------------------------------------------
  {
    name: 'ittsuu closed + pinfu',
    hand: '123456789m234p11s',
    win: '2p',
    yaku: ['pinfu', 'ittsuu'],
    han: 3,
    fu: 30,
  },
  {
    name: 'ittsuu open (kuisagari) with a kuipinfu 30 fu floor',
    hand: '456789m234p11s',
    melds: [['chi', '123m']],
    win: '2p',
    yaku: ['ittsuu'],
    han: 1,
    fu: 30,
  },
  {
    name: 'ittsuu + honitsu + yakuhai',
    hand: '123456789p22p111z',
    win: '3p',
    yaku: ['yakuhai-round-wind', 'ittsuu', 'honitsu'],
    han: 6,
    fu: 40,
    points: 12000,
  },
  {
    name: 'ittsuu + honitsu open',
    hand: '123456789p22p',
    melds: [['pon', '111z']],
    win: '3p',
    yaku: ['yakuhai-round-wind', 'ittsuu', 'honitsu'],
    han: 4,
    fu: 30,
    points: 7700,
  },

  // -- toitoi / sanankou ---------------------------------------------------
  {
    name: 'toitoi + sanankou + yakuhai',
    hand: '333m555p777s99m',
    melds: [['pon', '111z']],
    win: '9m',
    yaku: ['yakuhai-round-wind', 'sanankou', 'toitoi'],
    han: 5,
    fu: 40,
    points: 8000,
  },
  {
    name: 'a triplet completed by ron is a minko (sanankou, not suuankou)',
    hand: '111m333p555s777z99m',
    win: '1m',
    yaku: ['yakuhai-chun', 'sanankou', 'toitoi'],
    han: 5,
    fu: 50,
    points: 8000,
  },
  {
    name: 'toitoi alone (open, all simples is tanyao too)',
    hand: '222m444p66s',
    melds: [
      ['pon', '888s'],
      ['pon', '333p'],
    ],
    win: '6s',
    yaku: ['tanyao', 'toitoi'],
    han: 3,
    fu: 40,
  },

  // -- shousangen ----------------------------------------------------------
  {
    name: 'shousangen',
    hand: '555z666z77z111m234p',
    win: '4p',
    yaku: ['yakuhai-haku', 'yakuhai-hatsu', 'sanankou', 'shousangen'],
    han: 6,
    fu: 60,
    points: 12000,
  },
  {
    name: 'shousangen + honitsu + toitoi reaches kazoe yakuman',
    hand: '555z666z77z111z999s',
    win: '9s',
    yaku: [
      'yakuhai-round-wind',
      'yakuhai-haku',
      'yakuhai-hatsu',
      'sanankou',
      'toitoi',
      'shousangen',
      'honroutou',
      'honitsu',
    ],
    han: 14,
    fu: 60,
    points: 32000,
  },

  // -- honitsu / chinitsu --------------------------------------------------
  {
    name: 'honitsu closed',
    hand: '111234567999s55z',
    win: '7s',
    yaku: ['honitsu'],
    han: 3,
    fu: 50,
    points: 6400,
  },
  {
    name: 'chinitsu closed + pinfu + ittsuu',
    hand: '12233445678999p',
    win: '1p',
    yaku: ['pinfu', 'ittsuu', 'chinitsu'],
    han: 9,
    fu: 30,
    points: 16000,
  },
  {
    name: 'chinitsu open (kuisagari to 5 han)',
    hand: '23445678999p',
    melds: [['chi', '123p']],
    win: '2p',
    yaku: ['ittsuu', 'chinitsu'],
    han: 6,
    fu: 30,
    points: 12000,
  },

  // -- kan fu --------------------------------------------------------------
  {
    name: 'closed kan of honours is 32 fu',
    hand: '234567m88p234s',
    melds: [['ankan', '1111z']],
    win: '4m',
    yaku: ['yakuhai-round-wind'],
    han: 1,
    fu: 70,
    points: 2300,
  },
  {
    name: 'open kan of honours is 16 fu',
    hand: '234567m88p234s',
    melds: [['minkan', '1111z']],
    win: '4m',
    yaku: ['yakuhai-round-wind'],
    han: 1,
    fu: 40,
    points: 1300,
  },
  {
    name: 'closed kan of simples is 16 fu',
    hand: '234567m88p678s',
    melds: [['ankan', '3333s']],
    win: '4m',
    riichi: true,
    yaku: ['riichi', 'tanyao'],
    han: 2,
    fu: 50,
    points: 3200,
  },
  {
    name: 'open kan of simples is 8 fu',
    hand: '234567m88p678s',
    melds: [['minkan', '3333s']],
    win: '4m',
    yaku: ['tanyao'],
    han: 1,
    fu: 30,
    points: 1000,
  },
  {
    name: 'closed kan of terminals is 32 fu',
    hand: '234567m88p678s',
    melds: [['ankan', '1111m']],
    win: '4m',
    riichi: true,
    yaku: ['riichi'],
    han: 1,
    fu: 70,
  },
  {
    name: 'open kan of terminals is 16 fu',
    hand: '234567m88p678s',
    melds: [['minkan', '9999s']],
    win: '4m',
    riichi: false,
    yaku: [],
    han: 0,
    fu: 40,
    points: 0,
  },
  {
    name: 'sankantsu',
    hand: '99m678s',
    melds: [
      ['ankan', '1111m'],
      ['minkan', '3333s'],
      ['ankan', '7777p'],
    ],
    win: '8s',
    yaku: ['sankantsu'],
    han: 2,
    fu: 80,
    points: 5200,
  },

  // -- fu boundaries -------------------------------------------------------
  {
    name: 'closed shanpon tsumo: ankou keeps 8 fu',
    hand: '11122m456p789p345s',
    win: '1m',
    tsumo: true,
    riichi: true,
    yaku: ['riichi', 'menzen-tsumo'],
    han: 2,
    fu: 30,
  },
  {
    name: 'closed tanki tsumo on the same tiles: +2 wait fu',
    hand: '11122m456p789p345s',
    win: '2m',
    tsumo: true,
    riichi: true,
    yaku: ['riichi', 'menzen-tsumo'],
    han: 2,
    fu: 40,
  },
  {
    name: 'penchan wait is 2 fu',
    hand: '123m456p789p11s345s',
    win: '3m',
    riichi: true,
    yaku: ['riichi'],
    han: 1,
    fu: 40,
  },
  {
    name: 'ryanmen ron on the same body is pinfu at 30 fu',
    hand: '234m456p789p11s345s',
    win: '4m',
    riichi: true,
    yaku: ['riichi', 'pinfu'],
    han: 2,
    fu: 30,
  },
  {
    name: 'open triplet of simples is 2 fu',
    hand: '234567m88p234s',
    melds: [['pon', '333p']],
    win: '4m',
    yaku: ['tanyao'],
    han: 1,
    fu: 30,
  },
  {
    name: 'closed triplet of simples is 4 fu',
    hand: '333p234567m88p234s',
    win: '4m',
    riichi: true,
    yaku: ['riichi', 'tanyao'],
    han: 2,
    fu: 40,
  },
  {
    name: 'open triplet of terminals is 4 fu',
    hand: '234567m88p234s',
    melds: [['pon', '111p']],
    win: '4m',
    riichi: false,
    yaku: [],
    han: 0,
    fu: 30,
    points: 0,
  },

  // -- dora ----------------------------------------------------------------
  {
    name: 'dora adds han on top of a yaku',
    hand: PINFU_BODY,
    win: '4m',
    riichi: true,
    dora: '3m',
    yaku: ['riichi', 'pinfu'],
    han: 3,
    fu: 30,
  },
  {
    name: 'ura dora counts on a riichi win',
    hand: PINFU_BODY,
    win: '4m',
    riichi: true,
    dora: '3m',
    ura: '6s',
    yaku: ['riichi', 'pinfu'],
    han: 4,
    fu: 30,
    points: 7700,
  },
  {
    name: 'ura dora is ignored without riichi',
    hand: PINFU_BODY,
    win: '4m',
    dora: '3m',
    ura: '6s',
    yaku: ['pinfu'],
    han: 2,
    fu: 30,
  },
  {
    name: 'red five adds a han',
    hand: PINFU_BODY,
    win: '4m',
    riichi: true,
    aka: '5m',
    yaku: ['riichi', 'pinfu'],
    han: 3,
    fu: 30,
  },
  {
    name: 'red fives are off when the rule is off',
    hand: PINFU_BODY,
    win: '4m',
    riichi: true,
    aka: '5m',
    rules: { redFives: false },
    yaku: ['riichi', 'pinfu'],
    han: 2,
    fu: 30,
  },
  {
    name: 'dora in a meld counts too',
    hand: '567m22p345678s',
    melds: [['chi', '234m']],
    win: '6m',
    dora: '1m',
    yaku: ['tanyao'],
    han: 2,
    fu: 30,
  },
  {
    name: 'dora alone is not a yaku',
    hand: '456m789p11p234s',
    melds: [['chi', '123m']],
    win: '6m',
    dora: '1m',
    yaku: [],
    han: 1,
    fu: 30,
    points: 0,
  },
  {
    name: 'dora pushes a hand to exactly kazoe yakuman (13 han)',
    hand: '12233445678999p',
    win: '1p',
    riichi: true,
    dora: '8p',
    yaku: ['riichi', 'pinfu', 'ittsuu', 'chinitsu'],
    han: 13,
    fu: 30,
    points: 32000,
  },
  {
    name: 'one han short of kazoe is a sanbaiman',
    hand: '12233445678999p',
    win: '1p',
    dora: '8p',
    yaku: ['pinfu', 'ittsuu', 'chinitsu'],
    han: 12,
    fu: 30,
    points: 24000,
  },
  {
    name: 'ura dora on a riichi chinitsu overshoots into kazoe yakuman',
    hand: '12233445678999p',
    win: '1p',
    riichi: true,
    dora: '8p',
    ura: '8p',
    yaku: ['riichi', 'pinfu', 'ittsuu', 'chinitsu'],
    han: 16,
    fu: 30,
    points: 32000,
  },

  // -- yakuman -------------------------------------------------------------
  {
    name: 'kokushi musou (12-sided wait)',
    hand: '119m19p19s1234567z',
    win: '7z',
    yaku: ['kokushi'],
    han: 13,
    fu: 20,
    yakuman: 1,
    points: 32000,
  },
  {
    name: 'kokushi 13-wait is a single yakuman in v1',
    hand: '119m19p19s1234567z',
    win: '1m',
    yaku: ['kokushi'],
    han: 13,
    fu: 20,
    yakuman: 1,
    points: 32000,
  },
  {
    name: 'kokushi 13-wait is double when doubleYakuman is on',
    hand: '119m19p19s1234567z',
    win: '1m',
    rules: { doubleYakuman: true },
    yaku: ['kokushi-13'],
    han: 26,
    fu: 20,
    yakuman: 2,
    points: 64000,
  },
  {
    name: 'suuankou by tanki tsumo',
    hand: '111m333p555s777z99m',
    win: '9m',
    tsumo: true,
    yaku: ['suuankou'],
    han: 13,
    fu: 50,
    yakuman: 1,
    points: 32000,
  },
  {
    name: 'suuankou tanki is double when doubleYakuman is on',
    hand: '111m333p555s777z99m',
    win: '9m',
    tsumo: true,
    rules: { doubleYakuman: true },
    yaku: ['suuankou-tanki'],
    han: 26,
    fu: 50,
    yakuman: 2,
    points: 64000,
  },
  {
    name: 'suuankou by shanpon tsumo',
    hand: '111m333p555s777z99m',
    win: '1m',
    tsumo: true,
    yaku: ['suuankou'],
    han: 13,
    fu: 50,
    yakuman: 1,
    points: 32000,
  },
  {
    name: 'daisangen',
    hand: '555z666z777z123m11p',
    win: '3m',
    yaku: ['daisangen'],
    han: 13,
    fu: 60,
    yakuman: 1,
    points: 32000,
  },
  {
    name: 'shousuushii',
    hand: '111z222z333z44z123m',
    win: '3m',
    yaku: ['shousuushii'],
    han: 13,
    fu: 60,
    yakuman: 1,
    points: 32000,
  },
  {
    name: 'daisuushii (ron on the fourth wind)',
    hand: '111z222z333z444z11m',
    win: '1z',
    yaku: ['daisuushii'],
    han: 13,
    fu: 60,
    yakuman: 1,
    points: 32000,
  },
  {
    name: 'daisuushii + suuankou stack to a double yakuman',
    hand: '111z222z333z444z11m',
    win: '1m',
    yaku: ['suuankou', 'daisuushii'],
    han: 26,
    fu: 70,
    yakuman: 2,
    points: 64000,
  },
  {
    name: 'tsuuiisou',
    hand: '111z222z555z666z77z',
    win: '6z',
    yaku: ['tsuuiisou'],
    han: 13,
    fu: 60,
    yakuman: 1,
    points: 32000,
  },
  {
    name: 'tsuuiisou as chiitoitsu',
    hand: '11223344556677z',
    win: '7z',
    yaku: ['tsuuiisou'],
    han: 13,
    fu: 25,
    yakuman: 1,
    points: 32000,
  },
  {
    name: 'daisangen + tsuuiisou stack',
    hand: '555z666z777z111z22z',
    win: '7z',
    yaku: ['daisangen', 'tsuuiisou'],
    han: 26,
    fu: 60,
    yakuman: 2,
    points: 64000,
  },
  {
    name: 'chinroutou',
    hand: '111m999m111p999p11s',
    win: '9p',
    yaku: ['chinroutou'],
    han: 13,
    fu: 60,
    yakuman: 1,
    points: 32000,
  },
  {
    name: 'ryuuiisou',
    hand: '22223344666888s',
    win: '8s',
    yaku: ['ryuuiisou'],
    han: 13,
    fu: 40,
    yakuman: 1,
    points: 32000,
  },
  {
    name: 'chuuren poutou (junsei is single in v1)',
    hand: '11123455678999p',
    win: '5p',
    tsumo: true,
    yaku: ['chuuren'],
    han: 13,
    fu: 40,
    yakuman: 1,
    points: 32000,
  },
  {
    name: 'junsei chuuren is double when doubleYakuman is on',
    hand: '11123455678999p',
    win: '5p',
    tsumo: true,
    rules: { doubleYakuman: true },
    yaku: ['chuuren-9'],
    han: 26,
    fu: 40,
    yakuman: 2,
    points: 64000,
  },
  {
    name: 'non-junsei chuuren stays single even with doubleYakuman on',
    hand: '11122345678999p',
    win: '5p',
    tsumo: true,
    rules: { doubleYakuman: true },
    yaku: ['chuuren'],
    han: 13,
    fu: 40,
    yakuman: 1,
    points: 32000,
  },
  {
    name: 'suukantsu',
    hand: '99m',
    melds: [
      ['ankan', '1111m'],
      ['ankan', '2222p'],
      ['minkan', '3333s'],
      ['ankan', '4444z'],
    ],
    win: '9m',
    tsumo: true,
    yaku: ['suukantsu'],
    han: 13,
    fu: 120,
    yakuman: 1,
    points: 32000,
  },
  {
    name: 'tenhou (dealer)',
    hand: PINFU_BODY,
    win: '4m',
    tsumo: true,
    seat: 0,
    round: 0,
    tenhou: true,
    yaku: ['tenhou'],
    han: 13,
    fu: 30,
    yakuman: 1,
    points: 48000,
  },
  {
    name: 'chiihou (non-dealer)',
    hand: PINFU_BODY,
    win: '4m',
    tsumo: true,
    chiihou: true,
    yaku: ['chiihou'],
    han: 13,
    fu: 30,
    yakuman: 1,
    points: 32000,
  },

  // -- takame (high-point) selection ---------------------------------------
  {
    name: 'takame: 222333444m scores as sanankou 40 fu, not pinfu 20 fu',
    hand: '222333444m567p88s',
    win: '4m',
    tsumo: true,
    yaku: ['menzen-tsumo', 'tanyao', 'sanankou'],
    han: 4,
    fu: 40,
    points: 8000,
  },
  {
    name: 'takame: 333444555m scores as sanankou 40 fu, not pinfu 20 fu',
    hand: '333444555m678p88s',
    win: '5m',
    tsumo: true,
    yaku: ['menzen-tsumo', 'tanyao', 'sanankou'],
    han: 4,
    fu: 40,
    points: 8000,
  },
  {
    name: 'takame: iipeiko/sanshoku conflict picks the sanshoku reading',
    hand: '22334455m234p234s',
    win: '5m',
    yaku: ['tanyao', 'iipeiko', 'sanshoku-doujun'],
    han: 4,
    fu: 40,
    points: 8000,
  },
  {
    name: 'takame: 111222333m picks sanankou over iipeiko + penchan',
    hand: '111222333m456p77s',
    win: '3m',
    tsumo: true,
    yaku: ['menzen-tsumo', 'sanankou'],
    han: 3,
    fu: 40,
  },

  // -- dealer variants -----------------------------------------------------
  {
    name: 'dealer ron pays 1.5x',
    hand: '234567m22p345678s',
    win: '3m',
    seat: 0,
    round: 0,
    riichi: true,
    yaku: ['riichi', 'tanyao'],
    han: 2,
    fu: 40,
    points: 3900,
  },
  {
    name: 'dealer tsumo splits evenly',
    hand: '234567m22p345678s',
    win: '4m',
    seat: 0,
    round: 0,
    tsumo: true,
    riichi: true,
    yaku: ['riichi', 'menzen-tsumo', 'pinfu', 'tanyao'],
    han: 4,
    fu: 20,
    points: 7800,
  },
];

describe('evaluateHand — yaku snapshots', () => {
  it('covers at least 100 hands', () => {
    expect(YAKU_CASES.length).toBeGreaterThanOrEqual(100);
  });

  it.each(YAKU_CASES.map((c) => [c.name, c] as const))('%s', (_name, spec) => {
    const ctx = buildContext(spec);
    const value = evaluateHand(ctx);
    expect(value.yaku.map((y) => y.id)).toEqual(spec.yaku);
    expect(value.han).toBe(spec.han);
    expect(value.fu).toBe(spec.fu);
    expect(value.yakuman).toBe(spec.yakuman ?? 0);
    if (spec.points !== undefined) expect(value.points).toBe(spec.points);
  });

  it('exercises every implemented yaku id at least once', () => {
    const seen = new Set<string>();
    for (const spec of YAKU_CASES) for (const id of spec.yaku) seen.add(id);
    const expected = [
      'riichi',
      'double-riichi',
      'ippatsu',
      'menzen-tsumo',
      'haitei',
      'houtei',
      'rinshan',
      'chankan',
      'pinfu',
      'tanyao',
      'yakuhai-round-wind',
      'yakuhai-seat-wind',
      'yakuhai-haku',
      'yakuhai-hatsu',
      'yakuhai-chun',
      'iipeiko',
      'chanta',
      'sanshoku-doujun',
      'ittsuu',
      'sanshoku-doukou',
      'sanankou',
      'toitoi',
      'sankantsu',
      'shousangen',
      'honroutou',
      'chiitoitsu',
      'junchan',
      'ryanpeikou',
      'honitsu',
      'chinitsu',
      'kokushi',
      'kokushi-13',
      'suuankou',
      'suuankou-tanki',
      'daisangen',
      'daisuushii',
      'shousuushii',
      'suukantsu',
      'tsuuiisou',
      'chinroutou',
      'ryuuiisou',
      'chuuren',
      'chuuren-9',
      'tenhou',
      'chiihou',
    ];
    expect(expected.filter((id) => !seen.has(id))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 3. Yakuless hands
// ---------------------------------------------------------------------------

describe('hasYaku', () => {
  it('rejects a dora-only hand', () => {
    const ctx = buildContext({
      hand: '456m789p11p234s',
      melds: [['chi', '123m']],
      win: '6m',
      dora: '1m2m3m',
    });
    const value = evaluateHand(ctx);
    expect(value.yaku).toEqual([]);
    expect(value.han).toBeGreaterThan(0);
    expect(value.points).toBe(0);
    expect(hasYaku(value)).toBe(false);
  });

  it('rejects an open hand whose only shape yaku needs menzen', () => {
    const ctx = buildContext({
      hand: '112233m456p99s',
      melds: [['chi', '789p']],
      win: '9s',
    });
    expect(hasYaku(evaluateHand(ctx))).toBe(false);
  });

  it('rejects an open tanyao when kuitan is off', () => {
    const ctx = buildContext({
      hand: '567m22p345678s',
      melds: [['chi', '234m']],
      win: '6m',
      rules: { kuitan: false },
    });
    expect(hasYaku(evaluateHand(ctx))).toBe(false);
  });

  it('accepts the same hand once a yaku is present', () => {
    const ctx = buildContext({
      hand: '567m22p345678s',
      melds: [['chi', '234m']],
      win: '6m',
    });
    expect(hasYaku(evaluateHand(ctx))).toBe(true);
  });

  it('returns a zero value for a hand that is not a winning shape', () => {
    const ctx = buildContext({
      hand: '123456789m1234p',
      win: '4p',
    });
    const value = evaluateHand(ctx);
    expect(value).toMatchObject({ han: 0, fu: 0, points: 0, yakuman: 0 });
    expect(hasYaku(value)).toBe(false);
  });

  it('counts dora, aka and ura separately', () => {
    const ctx = buildContext({
      hand: PINFU_BODY,
      win: '4m',
      riichi: true,
      dora: '3m',
      ura: '6s',
      aka: '5m',
    });
    expect(countDora(ctx)).toEqual({ dora: 1, aka: 1, ura: 1, total: 3 });
  });
});

// ---------------------------------------------------------------------------
// 4. Decomposition and takame
// ---------------------------------------------------------------------------

describe('parseWinningHand', () => {
  it('finds both the chiitoitsu and the ryanpeikou reading', () => {
    const ctx = buildContext({ hand: '112233m445566p99s', win: '9s' });
    const shapes = parseWinningHand(ctx).map((p) => p.shape);
    expect(shapes).toContain('chiitoitsu');
    expect(shapes).toContain('standard');
  });

  it('finds both readings of 222333444m', () => {
    const ctx = buildContext({ hand: '222333444m567p88s', win: '4m' });
    const parses = parseWinningHand(ctx).filter((p) => p.shape === 'standard');
    const shapes = parses.map((p) =>
      p.sets
        .map((s) => `${s.type}:${s.kind}`)
        .sort()
        .join(','),
    );
    expect(new Set(shapes).size).toBe(2);
  });

  it('marks a ron-completed triplet as open but a tsumo-completed one as closed', () => {
    const ron = buildContext({ hand: '11122m456p789p345s', win: '1m' });
    const tsumo = buildContext({
      hand: '11122m456p789p345s',
      win: '1m',
      tsumo: true,
    });
    const ronSet = parseWinningHand(ron)[0].sets.find((s) => s.containsWinTile);
    const tsumoSet = parseWinningHand(tsumo)[0].sets.find(
      (s) => s.containsWinTile,
    );
    expect(ronSet?.concealed).toBe(false);
    expect(tsumoSet?.concealed).toBe(true);
  });

  it('returns nothing when the winning tile is not in the hand', () => {
    const ctx = buildContext({ hand: PINFU_BODY, win: '4m' });
    expect(parseWinningHand({ ...ctx, winTile: 4 * 33 })).toEqual([]);
  });

  it('picks the highest-scoring reading, not the first one', () => {
    const ctx = buildContext({
      hand: '222333444m567p88s',
      win: '4m',
      tsumo: true,
    });
    const scored = parseWinningHand(ctx)
      .map((parse) => {
        const yaku = detectYaku(ctx, parse);
        return {
          han: yaku.reduce((sum, y) => sum + y.han, 0),
          fu: calculateFu(ctx, parse, yaku),
        };
      })
      .sort((a, b) => a.fu - b.fu);
    // A naive first-parse could land on the 20 fu pinfu reading.
    expect(scored[0].fu).toBe(20);
    expect(evaluateHand(ctx).fu).toBe(40);
  });
});

// ---------------------------------------------------------------------------
// 5. Fu edge cases
// ---------------------------------------------------------------------------

describe('calculateFu edge cases', () => {
  const fuOf = (spec: HandSpec): number => {
    const ctx = buildContext(spec);
    const parses = parseWinningHand(ctx);
    return Math.max(
      ...parses.map((p) => calculateFu(ctx, p, detectYaku(ctx, p))),
    );
  };

  it('chiitoitsu is always 25 fu', () => {
    expect(
      fuOf({ hand: '1133m5577p99s2244z', win: '9s' }),
    ).toBe(25);
    expect(
      fuOf({ hand: '1133m5577p99s2244z', win: '9s', tsumo: true }),
    ).toBe(25);
  });

  it('closed pinfu tsumo is 20 fu but pinfu ron is 30 fu', () => {
    expect(fuOf({ hand: PINFU_BODY, win: '4m', tsumo: true })).toBe(20);
    expect(fuOf({ hand: PINFU_BODY, win: '4m' })).toBe(30);
  });

  it('open pinfu-shaped hands floor at 30 fu', () => {
    expect(
      fuOf({
        hand: '456789m234p11s',
        melds: [['chi', '123m']],
        win: '2p',
      }),
    ).toBe(30);
  });

  it('a closed kan of honours is worth 32 fu', () => {
    expect(
      fuOf({
        hand: '234567m88p234s',
        melds: [['ankan', '1111z']],
        win: '4m',
      }),
    ).toBe(70);
    expect(
      fuOf({
        hand: '234567m88p234s',
        melds: [['minkan', '1111z']],
        win: '4m',
      }),
    ).toBe(40);
  });

  it('separates tanki from shanpon on the same tiles', () => {
    const shanpon = { hand: '11122m456p789p345s', win: '1m', tsumo: true };
    const tanki = { hand: '11122m456p789p345s', win: '2m', tsumo: true };
    expect(fuOf(shanpon)).toBe(30);
    expect(fuOf(tanki)).toBe(40);
  });

  it('rounds fu up to the next ten', () => {
    // 20 base + 10 menzen ron + 8 closed terminal triplet + 2 penchan = 40.
    expect(fuOf({ hand: '123m456p789p11s999s', win: '3m' })).toBe(40);
  });
});

// ---------------------------------------------------------------------------
// 6. Settlement
// ---------------------------------------------------------------------------

const value = (points: number, ko = 0, oya = 0) => ({
  yaku: [{ id: 'riichi', han: 1, yakuman: 0 }],
  han: 1,
  fu: 30,
  yakuman: 0,
  limit: null,
  points,
  tsumoNonDealer: ko,
  tsumoDealer: oya,
});

describe('settleWin', () => {
  it('moves points from the discarder on a ron', () => {
    const result = settleWin({
      wins: [{ winner: 2, loser: 0, value: value(3900) }],
      dealer: 0,
      honba: 0,
      riichiSticks: 0,
      rules: DEFAULT_RULES,
    });
    expect(result.deltas).toEqual([-3900, 0, 3900, 0]);
    expect(result.dealerRepeat).toBe(false);
    expect(result.nextHonba).toBe(0);
  });

  it('adds honba and riichi sticks on a ron', () => {
    const result = settleWin({
      wins: [{ winner: 2, loser: 0, value: value(3900) }],
      dealer: 0,
      honba: 2,
      riichiSticks: 3,
      rules: DEFAULT_RULES,
    });
    expect(result.deltas).toEqual([-4500, 0, 7500, 0]);
    expect(result.riichiSticksCarried).toBe(0);
  });

  it('splits honba three ways on a tsumo', () => {
    const result = settleWin({
      wins: [{ winner: 2, loser: null, value: value(3900, 1000, 2000) }],
      dealer: 0,
      honba: 1,
      riichiSticks: 0,
      rules: DEFAULT_RULES,
    });
    expect(result.deltas).toEqual([-2100, -1100, 4300, -1100]);
    expect(result.deltas.reduce((a, b) => a + b, 0)).toBe(0);
  });

  it('charges every other seat the same on a dealer tsumo', () => {
    const result = settleWin({
      wins: [{ winner: 0, loser: null, value: value(6000, 2000, 0) }],
      dealer: 0,
      honba: 0,
      riichiSticks: 0,
      rules: DEFAULT_RULES,
    });
    expect(result.deltas).toEqual([6000, -2000, -2000, -2000]);
    expect(result.dealerRepeat).toBe(true);
    expect(result.nextHonba).toBe(1);
  });

  it('pays both winners on a double ron, honba to the head bump only', () => {
    const result = settleWin({
      wins: [
        { winner: 1, loser: 0, value: value(1000) },
        { winner: 3, loser: 0, value: value(8000) },
      ],
      dealer: 0,
      honba: 1,
      riichiSticks: 1,
      rules: DEFAULT_RULES,
    });
    expect(result.deltas).toEqual([-9300, 2300, 0, 8000]);
    // The dealer lost, so the deal passes.
    expect(result.dealerRepeat).toBe(false);
  });

  it('keeps the deal when the dealer is any of the winners', () => {
    const result = settleWin({
      wins: [
        { winner: 1, loser: 2, value: value(1000) },
        { winner: 0, loser: 2, value: value(2000) },
      ],
      dealer: 0,
      honba: 3,
      riichiSticks: 0,
      rules: DEFAULT_RULES,
    });
    expect(result.dealerRepeat).toBe(true);
    expect(result.nextHonba).toBe(4);
  });
});

describe('settleExhaustiveDraw', () => {
  it.each([
    [[], [0, 0, 0, 0]],
    [[0], [3000, -1000, -1000, -1000]],
    [
      [0, 1],
      [1500, 1500, -1500, -1500],
    ],
    [
      [0, 1, 2],
      [1000, 1000, 1000, -3000],
    ],
    [
      [0, 1, 2, 3],
      [0, 0, 0, 0],
    ],
  ])('%j tenpai', (tenpai, expected) => {
    const result = settleExhaustiveDraw(
      tenpai as Seat[],
      0,
      0,
      1,
      DEFAULT_RULES,
    );
    expect(result.deltas).toEqual(expected);
    expect(result.riichiSticksCarried).toBe(1);
    expect(result.nextHonba).toBe(1);
  });

  it('repeats the deal only when the dealer is tenpai', () => {
    expect(
      settleExhaustiveDraw([1, 2], 0, 0, 0, DEFAULT_RULES).dealerRepeat,
    ).toBe(false);
    expect(
      settleExhaustiveDraw([0, 2], 0, 0, 0, DEFAULT_RULES).dealerRepeat,
    ).toBe(true);
  });
});

describe('settleAbortiveDraw', () => {
  it('moves nothing and keeps the deal', () => {
    expect(settleAbortiveDraw(2, 1)).toEqual({
      deltas: [0, 0, 0, 0],
      dealerRepeat: true,
      riichiSticksCarried: 1,
      nextHonba: 3,
    });
  });
});

// ---------------------------------------------------------------------------
// 7. Randomised sanity check
// ---------------------------------------------------------------------------

describe('evaluateHand fuzz', () => {
  /** Deterministic xorshift32 so a failure is reproducible. */
  function rng(seed: number): () => number {
    let state = seed >>> 0 || 1;
    return () => {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      state >>>= 0;
      return state / 0x100000000;
    };
  }

  it('parses and scores 2000 random winning hands without throwing', () => {
    const next = rng(20260826);
    let checked = 0;
    for (let iteration = 0; iteration < 2000; iteration += 1) {
      const counts = new Array<number>(34).fill(0);
      const kinds: TileKind[] = [];
      const take = (kind: TileKind, n: number): boolean => {
        if (counts[kind] + n > 4) return false;
        counts[kind] += n;
        for (let i = 0; i < n; i += 1) kinds.push(kind);
        return true;
      };
      let sets = 0;
      let guard = 0;
      while (sets < 4 && guard < 200) {
        guard += 1;
        const kind = Math.floor(next() * 34);
        if (next() < 0.5 && kind < 27 && kind % 9 <= 6) {
          if (counts[kind] < 4 && counts[kind + 1] < 4 && counts[kind + 2] < 4) {
            take(kind, 1);
            take(kind + 1, 1);
            take(kind + 2, 1);
            sets += 1;
          }
        } else if (take(kind, 3)) {
          sets += 1;
        }
      }
      if (sets < 4) continue;
      let pair = -1;
      for (let attempt = 0; attempt < 40 && pair < 0; attempt += 1) {
        const kind = Math.floor(next() * 34);
        if (take(kind, 2)) pair = kind;
      }
      if (pair < 0) continue;

      const alloc = makeAllocator();
      const hand = kinds.sort((a, b) => a - b).map(alloc);
      const winTile = hand[Math.floor(next() * hand.length)];
      const ctx = makeWinContext({
        hand,
        winTile,
        isTsumo: next() < 0.5,
        seatWind: Math.floor(next() * 4) as Wind,
        roundWind: Math.floor(next() * 4) as Wind,
        rules: DEFAULT_RULES,
      });

      const parses = parseWinningHand(ctx);
      expect(parses.length).toBeGreaterThan(0);
      const result = evaluateHand(ctx);
      expect(result.fu === 25 || result.fu % 10 === 0).toBe(true);
      expect(result.han).toBeGreaterThanOrEqual(0);
      if (result.yakuman === 0 && result.yaku.length > 0) {
        expect(result.points).toBeGreaterThan(0);
      }
      if (result.yaku.length === 0) expect(result.points).toBe(0);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(1000);
  });

  it('honours an explicit isDealer override', () => {
    const ctx = buildContext({ hand: PINFU_BODY, win: '4m', seat: 1 });
    expect(evaluateHand(ctx, false).points).toBe(1000);
    expect(evaluateHand(ctx, true).points).toBe(1500);
  });
});

/**
 * `settleWin` takes a full {@link HandValue}; `handValue` only returns the
 * payment half of one. These settlement tests care about the payments alone,
 * so fill in the descriptive fields with a plain 1-yaku placeholder.
 */
function winValue(
  han: number,
  fu: number,
  isDealer: boolean,
  isTsumo: boolean,
  rules: Rules = DEFAULT_RULES,
): HandValue {
  const payments = handValue(han, fu, isDealer, isTsumo, rules);
  return {
    yaku: [{ id: 'riichi', han, yakuman: 0 }],
    han,
    fu,
    yakuman: 0,
    ...payments,
  };
}

describe('settlement invariants', () => {
  it('rejects a honba value the three tsumo payers cannot split', () => {
    expect(() =>
      settleWin({
        wins: [
          {
            winner: 1,
            loser: null,
            value: winValue(1, 30, false, true),
          },
        ],
        dealer: 0,
        honba: 1,
        riichiSticks: 0,
        rules: { ...DEFAULT_RULES, honbaValue: 100 },
      }),
    ).toThrow(/divisible by 3/);
  });

  it('moves exactly the riichi sticks into circulation', () => {
    const settlement = settleWin({
      wins: [
        {
          winner: 2,
          loser: 0,
          value: winValue(3, 40, false, false),
        },
      ],
      dealer: 0,
      honba: 2,
      riichiSticks: 3,
      rules: DEFAULT_RULES,
    });
    const sum = settlement.deltas.reduce((a, b) => a + b, 0);
    expect(sum).toBe(3 * DEFAULT_RULES.riichiStickValue);
  });
});
