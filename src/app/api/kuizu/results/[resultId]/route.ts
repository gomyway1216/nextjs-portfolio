import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from '@/lib/firebase-admin';
import { KUIZU_SOLO_RESULTS_COLLECTION } from '../../../constants';
import type { SoloResult } from '@/types/kuizu';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';
interface RouteParams {
  params: Promise<{
    resultId: string;
  }>;
}

// GET /api/kuizu/results/[resultId] - Get a specific solo result by ID
export const GET = withActivityLog('next_api.kuizu.results.resultId.GET', async (request: NextRequest, { params }: RouteParams) => {
  try {
    const { resultId } = await params;

    if (!resultId) {
      return NextResponse.json(
        { error: 'Result ID is required' },
        { status: 400 }
      );
    }

    const db = getFirestore();
    const resultDoc = await db.collection(KUIZU_SOLO_RESULTS_COLLECTION).doc(resultId).get();

    if (!resultDoc.exists) {
      return NextResponse.json(
        { error: 'Result not found' },
        { status: 404 }
      );
    }

    const data = resultDoc.data()!;
    const result: SoloResult = {
      id: resultDoc.id,
      quizId: data.quizId,
      userId: data.userId,
      category: data.category,
      difficulty: data.difficulty,
      answers: data.answers,
      totalQuestions: data.totalQuestions,
      correctCount: data.correctCount,
      totalPoints: data.totalPoints,
      maxPoints: data.maxPoints,
      accuracy: data.accuracy,
      streak: data.streak,
      timeTaken: data.timeTaken,
      createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
    };

    return NextResponse.json({ result });
  } catch (error) {
    console.error('Error fetching kuizu result:', error);
    return NextResponse.json(
      { error: 'Failed to fetch result' },
      { status: 500 }
    );
  }
});
