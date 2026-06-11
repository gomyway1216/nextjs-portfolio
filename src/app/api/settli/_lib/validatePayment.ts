// Split values feed calculateParticipantAmounts directly, so a negative,
// NaN, or Infinity in any of them corrupts the settlement math the same
// way a bad top-level amount would.

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Returns an error message for the first invalid participant entry, or
 * null. Also guards entry shape (object with a string `memberId`) so a
 * malformed array like `[null]` or `[{}]` returns 400 instead of
 * throwing a 500 in the caller's `.map(p => p.memberId)`. Accepts
 * `unknown` and verifies the array itself for the same reason.
 */
export function validateParticipantSplits(participants: unknown): string | null {
  if (!Array.isArray(participants)) {
    return 'participants must be an array';
  }
  for (const participant of participants) {
    if (!participant || typeof participant !== 'object') {
      return 'Each participant must be an object with a memberId';
    }
    const { memberId, weight, amount, percentage, shares } = participant as Record<string, unknown>;
    if (typeof memberId !== 'string' || memberId.length === 0) {
      return 'Each participant must have a memberId';
    }
    if (weight !== undefined && (!isFiniteNumber(weight) || weight <= 0)) {
      return 'Participant weight must be a finite number greater than 0';
    }
    if (amount !== undefined && (!isFiniteNumber(amount) || amount < 0)) {
      return 'Participant amount must be a non-negative finite number';
    }
    if (percentage !== undefined && (!isFiniteNumber(percentage) || percentage < 0 || percentage > 100)) {
      return 'Participant percentage must be a finite number between 0 and 100';
    }
    if (shares !== undefined && (!isFiniteNumber(shares) || shares < 0)) {
      return 'Participant shares must be a non-negative finite number';
    }
  }
  return null;
}
