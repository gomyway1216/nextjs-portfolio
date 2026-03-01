import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from '@/lib/firebase-admin';
import { getOptionalUser } from '@/lib/auth-utils';
import { KUIZU_USER_HISTORY_COLLECTION } from '../../constants';
import type { KuizuHistoryEntry } from '@/types/kuizu';

// GET /api/kuizu/history - Get quiz history (auth required)
export async function GET(request: NextRequest) {
  try {
    const user = await getOptionalUser(request);

    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const db = getFirestore();

    const snapshot = await db
      .collection(KUIZU_USER_HISTORY_COLLECTION)
      .where('userId', '==', user.uid)
      .orderBy('createdAt', 'desc')
      .get();

    const history: KuizuHistoryEntry[] = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        userId: data.userId,
        quizId: data.quizId,
        quizTitle: data.quizTitle,
        mode: data.mode,
        category: data.category,
        difficulty: data.difficulty,
        score: data.score,
        accuracy: data.accuracy,
        questionCount: data.questionCount,
        correctCount: data.correctCount,
        timeTaken: data.timeTaken,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
      };
    });

    return NextResponse.json({
      history,
      total: history.length,
    });
  } catch (error) {
    console.error('Error fetching kuizu history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch quiz history' },
      { status: 500 }
    );
  }
}
