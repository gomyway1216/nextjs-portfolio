import { NextRequest, NextResponse } from 'next/server';
import { getFirestore, getServerTimestamp } from '@/lib/firebase-admin';
import { getOptionalUser } from '@/lib/auth-utils';
import { withActivityLog } from '@/app/api/_lib/withActivityLog';
import {
  KUIZU_DAILY_LEADERBOARD_COLLECTION,
  KUIZU_USER_STATS_COLLECTION,
} from '../../../constants';

interface SubmitDailyBody {
  challengeId: string;
  score: number;
  accuracy: number;
  timeTaken: number;
  displayName: string;
}

// POST /api/kuizu/daily/submit - Submit daily challenge result (requires auth)
export const POST = withActivityLog('next_api.kuizu.daily.submit.POST', async (request: NextRequest) => {
  try {
    const user = await getOptionalUser(request);

    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required to submit daily challenge' },
        { status: 401 }
      );
    }

    const body: SubmitDailyBody = await request.json();
    const { challengeId, score, accuracy, timeTaken, displayName } = body;

    if (!challengeId || score === undefined || accuracy === undefined || timeTaken === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const db = getFirestore();

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
      displayName: displayName || user.email?.split('@')[0] || 'Anonymous',
      score,
      accuracy,
      timeTaken,
      completedAt: getServerTimestamp(),
    };

    await db.collection(KUIZU_DAILY_LEADERBOARD_COLLECTION).add(newEntry);

    // Update user stats
    const statsDoc = await db.collection(KUIZU_USER_STATS_COLLECTION).doc(user.uid).get();

    if (statsDoc.exists) {
      const stats = statsDoc.data()!;
      await statsDoc.ref.update({
        dailyChallengesCompleted: (stats.dailyChallengesCompleted || 0) + 1,
        totalPoints: (stats.totalPoints || 0) + score,
        updatedAt: getServerTimestamp(),
      });
    } else {
      await db.collection(KUIZU_USER_STATS_COLLECTION).doc(user.uid).set({
        userId: user.uid,
        totalQuizzesTaken: 0,
        totalCorrect: 0,
        totalPoints: score,
        bestStreak: 0,
        categoryStats: {},
        dailyChallengesCompleted: 1,
        multiplayerGamesPlayed: 0,
        multiplayerWins: 0,
        createdAt: getServerTimestamp(),
        updatedAt: getServerTimestamp(),
      });
    }

    return NextResponse.json({ message: 'Daily challenge result submitted successfully' });
  } catch (error) {
    console.error('Error submitting daily challenge:', error);
    return NextResponse.json(
      { error: 'Failed to submit daily challenge result' },
      { status: 500 }
    );
  }
});
