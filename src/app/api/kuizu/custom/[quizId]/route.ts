import { NextRequest, NextResponse } from 'next/server';
import { getFirestore, getServerTimestamp } from '@/lib/firebase-admin';
import { getOptionalUser } from '@/lib/auth-utils';
import { KUIZU_CUSTOM_QUIZZES_COLLECTION } from '../../../constants';
import type { Quiz, CreateCustomQuizInput } from '@/types/kuizu';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';
interface RouteParams {
  params: Promise<{ quizId: string }>;
}

// GET /api/kuizu/custom/[quizId] - Get custom quiz by ID (optional auth)
export const GET = withActivityLog('next_api.kuizu.custom.quizId.GET', async (request: NextRequest, { params }: RouteParams) => {
  try {
    const { quizId } = await params;
    const { searchParams } = new URL(request.url);
    const verified = searchParams.get('verified') === 'true';

    const db = getFirestore();
    const quizDoc = await db.collection(KUIZU_CUSTOM_QUIZZES_COLLECTION).doc(quizId).get();

    if (!quizDoc.exists) {
      return NextResponse.json({ error: 'Quiz not found' }, { status: 404 });
    }

    const data = quizDoc.data()!;

    // If quiz has passcode and user hasn't verified, return limited info
    if (data.hasPasscode && !verified) {
      return NextResponse.json({
        requiresPasscode: true,
        id: quizDoc.id,
        title: data.title,
      });
    }

    const quiz: Quiz = {
      id: quizDoc.id,
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
    console.error('Error fetching custom quiz:', error);
    return NextResponse.json(
      { error: 'Failed to fetch custom quiz' },
      { status: 500 }
    );
  }
});

// PUT /api/kuizu/custom/[quizId] - Update custom quiz (only creator can update)
export const PUT = withActivityLog('next_api.kuizu.custom.quizId.PUT', async (request: NextRequest, { params }: RouteParams) => {
  try {
    const user = await getOptionalUser(request);
    const { quizId } = await params;
    const body: Partial<CreateCustomQuizInput> = await request.json();

    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required to update quiz' },
        { status: 401 }
      );
    }

    const db = getFirestore();
    const quizDoc = await db.collection(KUIZU_CUSTOM_QUIZZES_COLLECTION).doc(quizId).get();

    if (!quizDoc.exists) {
      return NextResponse.json({ error: 'Quiz not found' }, { status: 404 });
    }

    const data = quizDoc.data()!;

    // Check if user is the creator
    if (data.createdBy !== user.uid) {
      return NextResponse.json(
        { error: 'Only the creator can update this quiz' },
        { status: 403 }
      );
    }

    const updateData: any = {
      updatedAt: getServerTimestamp(),
    };

    if (body.title !== undefined) updateData.title = body.title;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.category !== undefined) updateData.category = body.category;
    if (body.questions !== undefined) {
      updateData.questions = body.questions;
      updateData.questionCount = body.questions.length;
    }
    if (body.timePerQuestion !== undefined) updateData.timePerQuestion = body.timePerQuestion;

    await quizDoc.ref.update(updateData);

    return NextResponse.json({ message: 'Quiz updated successfully' });
  } catch (error) {
    console.error('Error updating custom quiz:', error);
    return NextResponse.json(
      { error: 'Failed to update custom quiz' },
      { status: 500 }
    );
  }
});

// DELETE /api/kuizu/custom/[quizId] - Delete custom quiz (only creator can delete)
export const DELETE = withActivityLog('next_api.kuizu.custom.quizId.DELETE', async (request: NextRequest, { params }: RouteParams) => {
  try {
    const user = await getOptionalUser(request);
    const { quizId } = await params;

    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required to delete quiz' },
        { status: 401 }
      );
    }

    const db = getFirestore();
    const quizDoc = await db.collection(KUIZU_CUSTOM_QUIZZES_COLLECTION).doc(quizId).get();

    if (!quizDoc.exists) {
      return NextResponse.json({ error: 'Quiz not found' }, { status: 404 });
    }

    const data = quizDoc.data()!;

    // Check if user is the creator
    if (data.createdBy !== user.uid) {
      return NextResponse.json(
        { error: 'Only the creator can delete this quiz' },
        { status: 403 }
      );
    }

    await quizDoc.ref.delete();

    return NextResponse.json({ message: 'Quiz deleted successfully' });
  } catch (error) {
    console.error('Error deleting custom quiz:', error);
    return NextResponse.json(
      { error: 'Failed to delete custom quiz' },
      { status: 500 }
    );
  }
});
