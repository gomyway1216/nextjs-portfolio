import { SCORING } from '@/types/kuizu';

/**
 * Get the streak multiplier for a given streak count
 */
export function getStreakMultiplier(streak: number): number {
  const multiplierKey = Math.min(streak, 4) as keyof typeof SCORING.STREAK_MULTIPLIERS;
  return SCORING.STREAK_MULTIPLIERS[multiplierKey];
}

/**
 * Calculate points for a quiz answer
 * @param isCorrect - Whether the answer was correct
 * @param answerTimeMs - Time taken to answer in milliseconds
 * @param timeLimitMs - Time limit for the question in milliseconds
 * @param streak - Current streak count
 * @returns Points earned
 */
export function calculatePoints(
  isCorrect: boolean,
  answerTimeMs: number,
  timeLimitMs: number,
  streak: number
): number {
  if (!isCorrect) return 0;

  const basePoints = SCORING.BASE_POINTS;

  // Calculate time bonus (faster = more points)
  const timeRatio = 1 - (answerTimeMs / timeLimitMs);
  const timeBonus = Math.max(0, Math.floor(timeRatio * SCORING.TIME_BONUS_MAX));

  // Get streak multiplier
  const streakMultiplier = getStreakMultiplier(streak);

  return Math.floor((basePoints + timeBonus) * streakMultiplier);
}
