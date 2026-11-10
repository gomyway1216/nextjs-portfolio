/**
 * What the bets on the table would do on the next roll alone: for each of the 36 ways two dice can land, the medals the
 * roll would win less the medals it would lose. A bet the roll does not decide (it stays up, moves to its number or is
 * pushed) counts as nothing, exactly as the table's own net does.
 */

import { resolveRoll, type Bets, type Dice, type PointNumber, type RollResolution } from './engine';

/** How many ways two dice can land. */
export const DICE_WAYS = 36;

/** What a roll wins less what it loses: the amount the table's net moves by on that roll. */
export const rollNet = (resolution: Pick<RollResolution, 'results'>): number =>
  resolution.results.reduce((sum, r) => sum + (r.outcome === 'win' ? r.profit : r.outcome === 'lose' ? -r.stake : 0), 0);

export interface OutlookRow {
  total: number;
  /**
   * Which ways of rolling the total the row is for: every way (null) when they all do the same, and otherwise the pair
   * (true) apart from the other ways (false), as a hardway bet makes them differ.
   */
  hard: boolean | null;
  /** How many of the 36 ways land here. */
  ways: number;
  net: number;
}

export interface Outlook {
  /** By total from 2 to 12, a total's other ways before its pair where the two differ. */
  rows: OutlookRow[];
  /** Of the 36 ways, how many leave the player ahead, behind, and neither. */
  ahead: number;
  behind: number;
  level: number;
  /** The net of the roll, averaged over the 36 ways. */
  average: number;
}

export function rollOutlook(point: PointNumber | null, bets: Bets): Outlook {
  const rows: OutlookRow[] = [];
  let ahead = 0;
  let behind = 0;
  let sum = 0;
  for (let total = 2; total <= 12; total++) {
    // A roll is decided by its total and by whether it is a pair, so a total has at most two outcomes.
    let pair: number | null = null;
    let other: number | null = null;
    let otherWays = 0;
    for (let a = Math.max(1, total - 6); a <= Math.min(6, total - 1); a++) {
      const dice: Dice = [a, total - a];
      const net = rollNet(resolveRoll(point, bets, dice));
      sum += net;
      if (net > 0) ahead += 1;
      else if (net < 0) behind += 1;
      if (a === total - a) pair = net;
      else {
        other = net;
        otherWays += 1;
      }
    }
    if (pair === null) rows.push({ total, hard: null, ways: otherWays, net: other ?? 0 });
    else if (other === null || other === pair) rows.push({ total, hard: null, ways: otherWays + 1, net: pair });
    else rows.push({ total, hard: false, ways: otherWays, net: other }, { total, hard: true, ways: 1, net: pair });
  }
  return { rows, ahead, behind, level: DICE_WAYS - ahead - behind, average: sum / DICE_WAYS };
}
