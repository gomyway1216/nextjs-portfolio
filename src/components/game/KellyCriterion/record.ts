/**
 * The record of finished games at the table: what each one ended with, and what
 * the Kelly stake made of the very same flips. Kept for the visit only.
 */

import { CAP, MIN_STAKE, SCENARIOS, fixedFractionPath, isFinished, kellyFraction, type ScenarioId } from './engine';
import type { FinishReason } from './i18n';

/** Why play is over, or `null` while it can go on. Bust and the cap come before running out of flips. */
export function finishReason(bankroll: number, flipsUsed: number): FinishReason | null {
  if (!isFinished(bankroll, flipsUsed)) return null;
  return bankroll < MIN_STAKE ? 'bust' : bankroll >= CAP ? 'cap' : 'flips';
}

export interface GameRecord {
  scenario: ScenarioId;
  reason: FinishReason;
  /** Flips played before the game ended. */
  flips: number;
  /** The bankroll the game ended with. */
  final: number;
  /** The mean share of the bankroll staked, over the flips played. */
  averageStake: number;
  /** Where staking the Kelly fraction on every one of the same flips ended. */
  kellyFinal: number;
}

/**
 * The record of a game from what the table keeps of it: the flips, the bankroll
 * before the first flip and after each one, and the share staked on each flip.
 * `null` while the game is still going.
 */
export function recordOf(scenario: ScenarioId, flips: readonly boolean[], path: readonly number[], fractions: readonly number[]): GameRecord | null {
  const final = path[path.length - 1];
  const reason = finishReason(final, flips.length);
  if (reason === null) return null;
  const wager = SCENARIOS[scenario];
  const kellyPath = fixedFractionPath(wager, kellyFraction(wager), flips);
  return {
    scenario,
    reason,
    flips: flips.length,
    final,
    averageStake: fractions.length > 0 ? fractions.reduce((sum, f) => sum + f, 0) / fractions.length : 0,
    kellyFinal: kellyPath[kellyPath.length - 1],
  };
}

const cents = (amount: number) => Math.round(amount * 100);

/** Whether the game ended with more than, the same as, or less than the Kelly stake on the same flips, to the cent. */
export function againstKelly(record: GameRecord): 'ahead' | 'level' | 'behind' {
  const difference = cents(record.final) - cents(record.kellyFinal);
  return difference > 0 ? 'ahead' : difference < 0 ? 'behind' : 'level';
}

export interface Tally {
  games: number;
  bust: number;
  cap: number;
  /** Games that ended with strictly more than the Kelly stake made of the same flips. */
  ahead: number;
  /** Games that ended with strictly less. */
  behind: number;
}

export function tallyOf(records: readonly GameRecord[]): Tally {
  const tally: Tally = { games: records.length, bust: 0, cap: 0, ahead: 0, behind: 0 };
  for (const record of records) {
    if (record.reason === 'bust') tally.bust++;
    if (record.reason === 'cap') tally.cap++;
    const versus = againstKelly(record);
    if (versus === 'ahead') tally.ahead++;
    if (versus === 'behind') tally.behind++;
  }
  return tally;
}
