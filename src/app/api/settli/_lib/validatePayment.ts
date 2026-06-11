// Split values feed calculateParticipantAmounts directly, so a negative,
// NaN, or Infinity in any of them corrupts the settlement math the same
// way a bad top-level amount would.

interface ParticipantSplitInput {
  weight?: unknown;
  amount?: unknown;
  percentage?: unknown;
  shares?: unknown;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Returns an error message for the first invalid split value, or null. */
export function validateParticipantSplits(participants: ParticipantSplitInput[]): string | null {
  for (const participant of participants) {
    const { weight, amount, percentage, shares } = participant;
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
