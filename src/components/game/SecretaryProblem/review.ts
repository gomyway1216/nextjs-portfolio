import { runTrial } from './engine';

/**
 * Post-round review: replays the finished round's exact candidate order through
 * the skip-r rule (the same `runTrial` the simulation is tested against) and
 * compares it with what the player actually did.
 */
export interface RoundReview {
  /** 0-based position of the single best candidate. */
  bestIndex: number;
  bestValue: number;
  /** True when the best candidate sat inside the first r (skipped) positions. */
  bestInObservation: boolean;
  /** What the skip-r rule does on this order. */
  rule: {
    pickedIndex: number;
    picked: number;
    won: boolean;
    forcedLast: boolean;
  };
  playerPickedIndex: number;
  playerWon: boolean;
  /** Player's hire position relative to the rule's: same / earlier / later. */
  comparison: 'same' | 'earlier' | 'later';
}

export function reviewRound(
  candidates: number[],
  r: number,
  playerPickedIndex: number,
): RoundReview {
  const n = candidates.length;
  if (n === 0) throw new Error('reviewRound: candidates must not be empty');
  if (!Number.isInteger(playerPickedIndex) || playerPickedIndex < 0 || playerPickedIndex >= n) {
    throw new Error('reviewRound: playerPickedIndex out of range');
  }
  const skipped = Math.max(0, Math.min(n, Math.floor(r)));

  let bestIndex = 0;
  for (let i = 1; i < n; i++) {
    if (candidates[i] > candidates[bestIndex]) bestIndex = i;
  }

  const trial = runTrial(candidates, skipped);
  // runTrial always reports a pick for a non-empty order (the last one if forced).
  const rulePickedIndex = trial.pickedIndex ?? n - 1;

  return {
    bestIndex,
    bestValue: candidates[bestIndex],
    bestInObservation: bestIndex < skipped,
    rule: {
      pickedIndex: rulePickedIndex,
      picked: candidates[rulePickedIndex],
      won: rulePickedIndex === bestIndex,
      forcedLast: trial.forcedLast,
    },
    playerPickedIndex,
    playerWon: playerPickedIndex === bestIndex,
    comparison:
      playerPickedIndex === rulePickedIndex
        ? 'same'
        : playerPickedIndex < rulePickedIndex
          ? 'earlier'
          : 'later',
  };
}
