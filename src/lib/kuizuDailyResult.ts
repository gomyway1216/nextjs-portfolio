import { createHash } from 'node:crypto';
import { checkName } from '@/lib/medalFloor/names';
import { calculatePoints, SCORING } from '@/types/kuizu';

/**
 * What the daily challenge's public leaderboard takes from a player: a name
 * that is safe to show, and a result the challenge could have produced. The
 * browser's numbers are only a claim; the server decides both.
 */

/** "Player 1234": a player's name on the board when theirs cannot be shown. The digits come from the account, so they stay the same from day to day. */
export function defaultDailyName(uid: string): string {
  const digits = createHash('sha256').update(uid).digest().readUInt32BE(0) % 10_000;
  return `Player ${String(digits).padStart(4, '0')}`;
}

/**
 * The name to show: the one sent if it passes the medal floor's checks (2–12
 * characters; no email, link or phone number; nothing reserved or abusive),
 * otherwise the player's default. Never anything taken from the account's email.
 */
export function dailyDisplayName(raw: unknown, uid: string): string {
  const checked = checkName(raw);
  return checked.ok ? checked.name : defaultDailyName(uid);
}

/** The most points `correct` right answers can earn: all in one run, each answered at once (the full time bonus). */
export function maxDailyScore(correct: number): number {
  let total = 0;
  for (let streak = 1; streak <= correct; streak += 1) total += calculatePoints(true, 0, 1, streak);
  return total;
}

/** Each answer stays on screen for 1.5 s before the next question; this leaves room for timer and clock rounding. */
export const MIN_MS_PER_QUESTION = 1_000;
/** A daily challenge is played within a day. */
export const MAX_DAILY_MS = 24 * 60 * 60 * 1000;

export type DailyResultRefusal = 'accuracy' | 'score' | 'time';

export type DailyResultCheck =
  | { ok: true; score: number; accuracy: number; timeTaken: number }
  | { ok: false; reason: DailyResultRefusal };

/**
 * Whether a challenge of `questions` questions could have produced this result.
 * Accuracy is the share of right answers, so it is a whole number of answers;
 * the score lies between what that many right answers earn at the slowest
 * (1,000 points each) and at the fastest in one unbroken streak.
 */
export function checkDailyResult(claimed: { score: unknown; accuracy: unknown; timeTaken: unknown }, questions: number): DailyResultCheck {
  const { score, accuracy, timeTaken } = claimed;
  if (typeof accuracy !== 'number' || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 100) return { ok: false, reason: 'accuracy' };
  const correct = Math.round((accuracy / 100) * questions);
  // The same sum the player does (DailyChallengePlayer), so the stored value is the one it showed.
  const exact = (correct / questions) * 100;
  if (Math.abs(exact - accuracy) > 1e-6) return { ok: false, reason: 'accuracy' };
  if (typeof score !== 'number' || !Number.isInteger(score) || score < correct * SCORING.BASE_POINTS || score > maxDailyScore(correct)) {
    return { ok: false, reason: 'score' };
  }
  if (typeof timeTaken !== 'number' || !Number.isFinite(timeTaken) || timeTaken < questions * MIN_MS_PER_QUESTION || timeTaken > MAX_DAILY_MS) {
    return { ok: false, reason: 'time' };
  }
  return { ok: true, score, accuracy: exact, timeTaken: Math.round(timeTaken) };
}

/** How many questions a stored challenge has: the ones it plays, or its `questionCount` if they are missing. Null when it has none. */
export function dailyQuestionCount(challenge: Record<string, unknown> | undefined): number | null {
  const questions = challenge?.questions;
  const count = Array.isArray(questions) && questions.length > 0 ? questions.length : challenge?.questionCount;
  return typeof count === 'number' && Number.isInteger(count) && count > 0 ? count : null;
}

/** The id GET /api/kuizu/daily gives the challenge of the UTC day of `ms`. */
export const dailyChallengeId = (ms: number): string => `daily_${new Date(ms).toISOString().slice(0, 10).replace(/-/g, '')}`;

/** Results are taken for today's challenge, and for yesterday's so that a game begun before midnight (UTC) still counts. */
export const openDailyChallengeIds = (now: number): string[] => [dailyChallengeId(now), dailyChallengeId(now - 24 * 60 * 60 * 1000)];
