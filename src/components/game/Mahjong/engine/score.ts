/**
 * Riichi Mahjong — fu, points and settlement.
 *
 * Pure functions only; no DOM/React. `yaku.ts` calls {@link calculateFu} and
 * {@link handValue}; `gameState.ts` calls the `settle*` helpers.
 *
 * ## Fu (符)
 *
 * | source                                   | fu |
 * |------------------------------------------|----|
 * | base (futei)                             | 20 |
 * | menzen ron bonus                          | 10 |
 * | tsumo (suppressed by pinfu)               |  2 |
 * | open triplet of simples                   |  2 |
 * | closed triplet of simples                 |  4 |
 * | open triplet of terminals/honours         |  4 |
 * | closed triplet of terminals/honours       |  8 |
 * | open kan of simples                       |  8 |
 * | closed kan of simples                     | 16 |
 * | open kan of terminals/honours             | 16 |
 * | closed kan of terminals/honours           | 32 |
 * | kanchan / penchan / tanki wait            |  2 |
 * | yakuhai pair (dragon / seat / round wind) |  2 |
 * | chiitoitsu (fixed, nothing else added)    | 25 |
 *
 * v1 decisions that the rule set (§1 of the plan) leaves open:
 *
 * - A **double-wind pair** (seat wind == round wind) is worth **4 fu**, i.e.
 *   the two roles are counted separately, mirroring how the double-wind
 *   *triplet* yields two yakuhai. (The 2-fu reading is also common; we pick
 *   the one that is consistent with our yakuhai handling.)
 * - A triplet completed by a **ron** counts as an open triplet (minko) both
 *   for fu and for sanankou. Only a tsumo, or a shanpon that was already
 *   complete, gives an ankou.
 * - An open hand whose fu total is exactly 20 ("kuipinfu") is floored to
 *   **30 fu**. A closed pinfu tsumo stays at 20 fu.
 * - Fu is rounded **up** to the next multiple of 10 (kiriage of fu, which is
 *   universal, is unrelated to kiriage *mangan*, which v1 does not use).
 * - Fu is meaningless for a yakuman; kokushi reports the bare 20 fu base.
 */

import { HONOR_START, isDragon, isHonor, isYaochuu } from './tiles';
import {
  isMenzen,
  type HandValue,
  type LimitName,
  type Rules,
  type Seat,
  type YakuEntry,
} from './types';
import type { HandParse, ParsedSet, WaitType, WinContext } from './yaku';

// ---------------------------------------------------------------------------
// Fu
// ---------------------------------------------------------------------------

/** Fu contributed by one set. Sequences are always worth 0. */
export function setFu(set: ParsedSet): number {
  if (set.type === 'shuntsu') return 0;
  const yao = isYaochuu(set.kind);
  if (set.type === 'kantsu') {
    if (set.concealed) return yao ? 32 : 16;
    return yao ? 16 : 8;
  }
  if (set.concealed) return yao ? 8 : 4;
  return yao ? 4 : 2;
}

/** Fu for the wait shape. Ryanmen and shanpon are worth 0. */
export function waitFu(wait: WaitType): number {
  return wait === 'kanchan' || wait === 'penchan' || wait === 'tanki' ? 2 : 0;
}

/** Fu for the pair. A double wind is worth 4 — see the module docblock. */
export function pairFu(
  pairKind: number,
  seatWind: number,
  roundWind: number,
): number {
  if (isDragon(pairKind)) return 2;
  if (!isHonor(pairKind)) return 0;
  let fu = 0;
  if (pairKind === HONOR_START + seatWind) fu += 2;
  if (pairKind === HONOR_START + roundWind) fu += 2;
  return fu;
}

/**
 * Fu for one reading of the hand. `yaku` is the output of `detectYaku` for the
 * same reading — only the presence of `pinfu` is read from it.
 */
export function calculateFu(
  ctx: WinContext,
  parse: HandParse,
  yaku: readonly YakuEntry[],
): number {
  if (parse.shape === 'chiitoitsu') return 25;
  if (parse.shape === 'kokushi') return 20;

  const menzen = isMenzen(ctx.melds);
  const pinfu = yaku.some((y) => y.id === 'pinfu');

  let fu = 20;
  if (menzen && !ctx.isTsumo) fu += 10;
  if (ctx.isTsumo && !pinfu) fu += 2;
  for (const set of parse.sets) fu += setFu(set);
  fu += waitFu(parse.wait);
  fu += pairFu(parse.pairKind, ctx.seatWind, ctx.roundWind);

  // Kuipinfu: an open all-sequences hand bottoms out at 30 fu.
  if (fu === 20 && !pinfu) fu = 30;

  return Math.ceil(fu / 10) * 10;
}

// ---------------------------------------------------------------------------
// Base points
// ---------------------------------------------------------------------------

function ceil100(points: number): number {
  return Math.ceil(points / 100) * 100;
}

export interface BasePoints {
  base: number;
  limit: LimitName | null;
}

/**
 * Base points (`fu × 2^(2+han)`), capped at the mangan base of 2000 and
 * replaced wholesale by the limit bases from 5 han up.
 *
 * No kiriage mangan: 4 han 30 fu stays 1920 (7700 / 11600).
 */
export function basePoints(
  han: number,
  fu: number,
  rules: Rules,
  yakuman = 0,
): BasePoints {
  if (yakuman > 0) return { base: 8000 * yakuman, limit: 'yakuman' };
  if (han >= 13) {
    return rules.kazoeYakuman
      ? { base: 8000, limit: 'yakuman' }
      : { base: 6000, limit: 'sanbaiman' };
  }
  if (han >= 11) return { base: 6000, limit: 'sanbaiman' };
  if (han >= 8) return { base: 4000, limit: 'baiman' };
  if (han >= 6) return { base: 3000, limit: 'haneman' };
  if (han === 5) return { base: 2000, limit: 'mangan' };
  const raw = fu * Math.pow(2, 2 + han);
  if (raw >= 2000) return { base: 2000, limit: 'mangan' };
  return { base: raw, limit: null };
}

export interface PointResult {
  /** Total moved to the winner, honba and riichi sticks excluded. */
  points: number;
  /** What each non-dealer pays on a tsumo; `0` on a ron. */
  tsumoNonDealer: number;
  /** What the dealer pays on a tsumo; `0` on a ron and on a dealer's tsumo. */
  tsumoDealer: number;
  limit: LimitName | null;
}

/**
 * Standard payment table.
 *
 * - non-dealer ron: `base × 4`, dealer ron: `base × 6`
 * - non-dealer tsumo: `base` from each non-dealer, `base × 2` from the dealer
 * - dealer tsumo: `base × 2` from each of the three others (reported as
 *   {@link PointResult.tsumoNonDealer}; {@link PointResult.tsumoDealer} is 0
 *   because there is no dealer left to pay)
 *
 * Every individual payment is rounded up to the next 100.
 */
export function handValue(
  han: number,
  fu: number,
  isDealer: boolean,
  isTsumo: boolean,
  rules: Rules,
  yakuman = 0,
): PointResult {
  const { base, limit } = basePoints(han, fu, rules, yakuman);

  if (!isTsumo) {
    return {
      points: ceil100(base * (isDealer ? 6 : 4)),
      tsumoNonDealer: 0,
      tsumoDealer: 0,
      limit,
    };
  }
  if (isDealer) {
    const each = ceil100(base * 2);
    return {
      points: each * 3,
      tsumoNonDealer: each,
      tsumoDealer: 0,
      limit,
    };
  }
  const ko = ceil100(base);
  const oya = ceil100(base * 2);
  return {
    points: ko * 2 + oya,
    tsumoNonDealer: ko,
    tsumoDealer: oya,
    limit,
  };
}

// ---------------------------------------------------------------------------
// Settlement
// ---------------------------------------------------------------------------

export interface WinEntry {
  winner: Seat;
  /** Discarder for a ron/chankan; `null` for a tsumo. */
  loser: Seat | null;
  value: HandValue;
}

export interface WinSettlementInput {
  /**
   * One entry per winner. On a double/triple ron the caller must order them
   * **head-bump first** (the winner closest to the discarder in turn order):
   * honba and riichi sticks go to `wins[0]`.
   */
  wins: WinEntry[];
  dealer: Seat;
  honba: number;
  /** Sticks already on the table, the winner's own declaration included. */
  riichiSticks: number;
  rules: Rules;
}

export interface Settlement {
  /**
   * Net change per seat. Point transfers between seats cancel out, so the sum
   * is exactly the value of the riichi sticks handed to the winner — those
   * were paid out of the players' scores when the declarations were made, so
   * collecting them puts points back into circulation. On a draw the sum is 0
   * (nothing leaves the table).
   */
  deltas: [number, number, number, number];
  dealerRepeat: boolean;
  /** Sticks left on the table for the next hand. */
  riichiSticksCarried: number;
  nextHonba: number;
}

function emptyDeltas(): [number, number, number, number] {
  return [0, 0, 0, 0];
}

/**
 * Turn one or more wins into per-seat deltas.
 *
 * - Honba is `rules.honbaValue` per stick, paid by the discarder on a ron and
 *   split three ways on a tsumo (`honbaValue / 3` per payer, 100 by default).
 *   `honbaValue` must be divisible by 3 or the split has no integer answer.
 * - All riichi sticks on the table go to `wins[0]` (head bump).
 * - The dealer keeps the deal when the dealer is **any** of the winners: v1
 *   explicitly does not head-bump the dealer-repeat decision.
 * - Honba increments on a dealer repeat and resets to 0 otherwise.
 */
export function settleWin(input: WinSettlementInput): Settlement {
  const { wins, dealer, honba, riichiSticks, rules } = input;
  if (wins.length === 0) throw new Error('settleWin requires at least one win');
  if (rules.honbaValue % 3 !== 0) {
    // Scores are whole points, so a honba value the three tsumo payers cannot
    // split evenly has no well-defined settlement. Reject it at the source
    // rather than silently producing fractional deltas.
    throw new Error(
      `rules.honbaValue must be divisible by 3, got ${rules.honbaValue}`,
    );
  }
  const deltas = emptyDeltas();
  const honbaPerPayer = (rules.honbaValue / 3) * honba;

  wins.forEach((win, index) => {
    const { winner, loser, value } = win;
    if (loser === null) {
      let received = 0;
      for (let seat = 0; seat < 4; seat += 1) {
        if (seat === winner) continue;
        const pay =
          seat === dealer ? value.tsumoDealer : value.tsumoNonDealer;
        const total = pay + honbaPerPayer;
        deltas[seat] -= total;
        received += total;
      }
      deltas[winner] += received;
    } else {
      // Honba is paid by the discarder, and only once — to the head bump.
      const honbaPart = index === 0 ? rules.honbaValue * honba : 0;
      const total = value.points + honbaPart;
      deltas[loser] -= total;
      deltas[winner] += total;
    }
  });

  deltas[wins[0].winner] += riichiSticks * rules.riichiStickValue;

  const dealerRepeat = wins.some((win) => win.winner === dealer);
  return {
    deltas,
    dealerRepeat,
    riichiSticksCarried: 0,
    nextHonba: dealerRepeat ? honba + 1 : 0,
  };
}

/**
 * Exhaustive draw (荒牌平局): the noten players split `rules.noTenPenalty`
 * among the tenpai players. Nobody pays when all four or none are tenpai.
 * Sticks stay on the table and honba always advances.
 */
export function settleExhaustiveDraw(
  tenpaiSeats: readonly Seat[],
  dealer: Seat,
  honba: number,
  riichiSticks: number,
  rules: Rules,
): Settlement {
  const deltas = emptyDeltas();
  const tenpai = new Set<Seat>(tenpaiSeats);
  const n = tenpai.size;
  if (n > 0 && n < 4) {
    const gain = rules.noTenPenalty / n;
    const loss = rules.noTenPenalty / (4 - n);
    for (let seat = 0; seat < 4; seat += 1) {
      deltas[seat] += tenpai.has(seat as Seat) ? gain : -loss;
    }
  }
  return {
    deltas,
    dealerRepeat: tenpai.has(dealer),
    riichiSticksCarried: riichiSticks,
    nextHonba: honba + 1,
  };
}

/**
 * Abortive draw (v1: kyuushu kyuuhai only). No payments, the dealer keeps the
 * deal, sticks stay on the table, honba advances.
 */
export function settleAbortiveDraw(
  honba: number,
  riichiSticks: number,
): Settlement {
  return {
    deltas: emptyDeltas(),
    dealerRepeat: true,
    riichiSticksCarried: riichiSticks,
    nextHonba: honba + 1,
  };
}
