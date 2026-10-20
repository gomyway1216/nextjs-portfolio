import { NextRequest, NextResponse } from 'next/server';
import { getFirestore, getServerTimestamp } from '@/lib/firebase-admin';
import { getOptionalUser } from '@/lib/auth-utils';
import { withActivityLog } from '@/app/api/_lib/withActivityLog';
import { checkDailyResult, dailyDisplayName, dailyQuestionCount, openDailyChallengeIds } from '@/lib/kuizuDailyResult';
import { clientIpFrom, isRateLimited } from '@/lib/rateLimit';
import {
  KUIZU_DAILY_CHALLENGES_COLLECTION,
  KUIZU_DAILY_LEADERBOARD_COLLECTION,
  KUIZU_USER_STATS_COLLECTION,
} from '../../../constants';

// A player has one entry per challenge, so a few tries covers retries after a failed request.
const PER_USER = { limit: 5, windowMs: 10 * 60 * 1000 };
// Guest accounts cost nothing to make, so the address is limited too.
const PER_IP = { limit: 20, windowMs: 10 * 60 * 1000 };
const MAX_BODY_BYTES = 2_048;

const tooMany = () => NextResponse.json({ error: 'Too many requests' }, { status: 429 });

// POST /api/kuizu/daily/submit - Submit daily challenge result (requires auth)
// The leaderboard is public, so nothing in the body is taken on trust: a name that fails the
// name checks shows as "Player 1234", and the score, accuracy and time must be ones the
// challenge could have produced.
export const POST = withActivityLog('next_api.kuizu.daily.submit.POST', async (request: NextRequest) => {
  try {
    if (isRateLimited(`kuizu-daily-submit-ip:${clientIpFrom(request)}`, PER_IP)) return tooMany();

    const user = await getOptionalUser(request);

    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required to submit daily challenge' },
        { status: 401 }
      );
    }

    if (isRateLimited(`kuizu-daily-submit:${user.uid}`, PER_USER)) return tooMany();

    const length = Number(request.headers.get('content-length'));
    if (Number.isFinite(length) && length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }

    // Read as text and measured again: a chunked body has no content-length.
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: 'Malformed JSON body' }, { status: 400 });
    }
    const { challengeId, score, accuracy, timeTaken, displayName } =
      body !== null && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};

    if (typeof challengeId !== 'string' || score === undefined || accuracy === undefined || timeTaken === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (!openDailyChallengeIds(Date.now()).includes(challengeId)) {
      return NextResponse.json({ error: 'This daily challenge is not open for results' }, { status: 400 });
    }

    const db = getFirestore();

    const challengeDoc = await db.collection(KUIZU_DAILY_CHALLENGES_COLLECTION).doc(challengeId).get();
    const questions = challengeDoc.exists ? dailyQuestionCount(challengeDoc.data()) : null;
    if (questions === null) {
      return NextResponse.json({ error: 'Daily challenge not found' }, { status: 404 });
    }

    const result = checkDailyResult({ score, accuracy, timeTaken }, questions);
    if (!result.ok) {
      return NextResponse.json(
        { error: 'That result is not possible for this challenge', code: 'result', reason: result.reason },
        { status: 400 }
      );
    }

    // Check if user already submitted for this challenge
    const existingEntry = await db
      .collection(KUIZU_DAILY_LEADERBOARD_COLLECTION)
      .where('challengeId', '==', challengeId)
      .where('userId', '==', user.uid)
      .limit(1)
      .get();

    if (!existingEntry.empty) {
      return NextResponse.json(
        { error: 'You have already submitted for this daily challenge' },
        { status: 400 }
      );
    }

    // Save to leaderboard
    const newEntry = {
      challengeId,
      userId: user.uid,
      displayName: dailyDisplayName(displayName, user.uid),
      score: result.score,
      accuracy: result.accuracy,
      timeTaken: result.timeTaken,
      completedAt: getServerTimestamp(),
    };

    await db.collection(KUIZU_DAILY_LEADERBOARD_COLLECTION).add(newEntry);

    // Update user stats
    const statsDoc = await db.collection(KUIZU_USER_STATS_COLLECTION).doc(user.uid).get();

    if (statsDoc.exists) {
      const stats = statsDoc.data()!;
      await statsDoc.ref.update({
        dailyChallengesCompleted: (stats.dailyChallengesCompleted || 0) + 1,
        totalPoints: (stats.totalPoints || 0) + result.score,
        updatedAt: getServerTimestamp(),
      });
    } else {
      await db.collection(KUIZU_USER_STATS_COLLECTION).doc(user.uid).set({
        userId: user.uid,
        totalQuizzesTaken: 0,
        totalCorrect: 0,
        totalPoints: result.score,
        bestStreak: 0,
        categoryStats: {},
        dailyChallengesCompleted: 1,
        multiplayerGamesPlayed: 0,
        multiplayerWins: 0,
        createdAt: getServerTimestamp(),
        updatedAt: getServerTimestamp(),
      });
    }

    return NextResponse.json({ message: 'Daily challenge result submitted successfully', displayName: newEntry.displayName });
  } catch (error) {
    console.error('Error submitting daily challenge:', error);
    return NextResponse.json(
      { error: 'Failed to submit daily challenge result' },
      { status: 500 }
    );
  }
});
