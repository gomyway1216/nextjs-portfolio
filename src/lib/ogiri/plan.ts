/** Two authors per question and two assignments per player keep opportunities equal. */
export function roundPlan(players: number, rounds: number) {
  if (!Number.isInteger(players) || players < 3 || players > 12 || !Number.isInteger(rounds) || rounds < 1 || rounds > 5) return null;
  return {
    questionsPerRound: players,
    answersPerPlayer: 2,
    votersPerQuestion: players - 2,
    votesPerPlayer: players - 2,
    totalQuestions: players * rounds,
    totalAnswersPerPlayer: 2 * rounds,
  };
}
