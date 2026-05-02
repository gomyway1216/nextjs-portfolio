import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from '@/lib/firebase-admin';
import { KUIZU_DAILY_LEADERBOARD_COLLECTION } from '../../../constants';
import type { DailyChallengeEntry } from '@/types/kuizu';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';
// GET /api/kuizu/daily/leaderboard - Get daily leaderboard
export const GET = withActivityLog('next_api.kuizu.daily.leaderboard.GET', async (request: NextRequest) => {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');

    // Get today's date in YYYYMMDD format if no date provided
    const today = new Date();
    const dateStr = date || today.toISOString().split('T')[0].replace(/-/g, '');
    const challengeId = `daily_${dateStr}`;

    const db = getFirestore();

    const snapshot = await db
      .collection(KUIZU_DAILY_LEADERBOARD_COLLECTION)
      .where('challengeId', '==', challengeId)
      .orderBy('score', 'desc')
      .limit(50)
      .get();

    const entries: DailyChallengeEntry[] = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        challengeId: data.challengeId,
        userId: data.userId,
        displayName: data.displayName,
        score: data.score,
        accuracy: data.accuracy,
        timeTaken: data.timeTaken,
        completedAt: data.completedAt?.toDate?.()?.toISOString() || data.completedAt,
      };
    });

    return NextResponse.json({ entries, total: entries.length });
  } catch (error) {
    console.error('Error fetching daily leaderboard:', error);
    return NextResponse.json(
      { error: 'Failed to fetch daily leaderboard' },
      { status: 500 }
    );
  }
});
