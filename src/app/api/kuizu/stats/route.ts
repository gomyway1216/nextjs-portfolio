import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from '@/lib/firebase-admin';
import { getOptionalUser } from '@/lib/auth-utils';
import { KUIZU_USER_STATS_COLLECTION } from '../../constants';
import type { KuizuUserStats } from '@/types/kuizu';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';
// GET /api/kuizu/stats - Get user stats (auth required)
export const GET = withActivityLog('next_api.kuizu.stats.GET', async (request: NextRequest) => {
  try {
    const user = await getOptionalUser(request);

    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const db = getFirestore();
    const statsDoc = await db.collection(KUIZU_USER_STATS_COLLECTION).doc(user.uid).get();

    if (!statsDoc.exists) {
      // Return empty/default stats if no stats doc exists
      const emptyStats: KuizuUserStats = {
        userId: user.uid,
        totalQuizzesTaken: 0,
        totalCorrect: 0,
        totalPoints: 0,
        bestStreak: 0,
        categoryStats: {} as any,
        dailyChallengesCompleted: 0,
        multiplayerGamesPlayed: 0,
        multiplayerWins: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      return NextResponse.json({ stats: emptyStats });
    }

    const data = statsDoc.data()!;
    const stats: KuizuUserStats = {
      userId: data.userId,
      totalQuizzesTaken: data.totalQuizzesTaken || 0,
      totalCorrect: data.totalCorrect || 0,
      totalPoints: data.totalPoints || 0,
      bestStreak: data.bestStreak || 0,
      categoryStats: data.categoryStats || {},
      dailyChallengesCompleted: data.dailyChallengesCompleted || 0,
      multiplayerGamesPlayed: data.multiplayerGamesPlayed || 0,
      multiplayerWins: data.multiplayerWins || 0,
      createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
      updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt,
    };

    return NextResponse.json({ stats });
  } catch (error) {
    console.error('Error fetching kuizu stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
});
