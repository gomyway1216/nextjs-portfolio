import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from '@/lib/firebase-admin';
import { KUIZU_CUSTOM_QUIZZES_COLLECTION } from '../../../constants';
import type { Quiz } from '@/types/kuizu';

interface RouteParams {
  params: Promise<{ shareCode: string }>;
}

// GET /api/kuizu/share/[shareCode] - Get custom quiz by share code
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { shareCode } = await params;
    const db = getFirestore();

    const snapshot = await db
      .collection(KUIZU_CUSTOM_QUIZZES_COLLECTION)
      .where('shareCode', '==', shareCode)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return NextResponse.json(
        { error: 'Quiz not found with this share code' },
        { status: 404 }
      );
    }

    const doc = snapshot.docs[0];
    const data = doc.data();

    const quiz: Quiz = {
      id: doc.id,
      title: data.title,
      description: data.description,
      category: data.category,
      difficulty: data.difficulty,
      questionCount: data.questionCount,
      questions: data.questions || [],
      timePerQuestion: data.timePerQuestion,
      createdBy: data.createdBy,
      isCustom: data.isCustom,
      shareCode: data.shareCode,
      hasPasscode: data.hasPasscode || false,
      createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
      updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt,
    };

    return NextResponse.json(quiz);
  } catch (error) {
    console.error('Error fetching quiz by share code:', error);
    return NextResponse.json(
      { error: 'Failed to fetch quiz' },
      { status: 500 }
    );
  }
}
