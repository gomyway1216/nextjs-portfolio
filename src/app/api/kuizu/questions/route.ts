import { NextRequest, NextResponse } from 'next/server';
import { getFirestore, getServerTimestamp } from '@/lib/firebase-admin';
import { getOptionalUser } from '@/lib/auth-utils';
import { KUIZU_QUESTIONS_COLLECTION } from '../../constants';
import type { QuestionTemplate, QuizCategory, QuizDifficulty, QuestionType } from '@/types/kuizu';
import { v4 as uuidv4 } from 'uuid';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';
// GET /api/kuizu/questions - Get questions by category/difficulty (optional auth)
export const GET = withActivityLog('next_api.kuizu.questions.GET', async (request: NextRequest) => {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category') as QuizCategory | null;
    const difficulty = searchParams.get('difficulty') as QuizDifficulty | null;
    const type = searchParams.get('type') as QuestionType | null;
    const limit = parseInt(searchParams.get('limit') || '100', 10);

    const db = getFirestore();
    let query: FirebaseFirestore.Query = db.collection(KUIZU_QUESTIONS_COLLECTION);

    // Apply filters
    if (category) {
      query = query.where('category', '==', category);
    }
    if (difficulty) {
      query = query.where('difficulty', '==', difficulty);
    }
    if (type) {
      query = query.where('type', '==', type);
    }

    const snapshot = await query.limit(limit).get();

    const questions: QuestionTemplate[] = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        type: data.type,
        category: data.category,
        difficulty: data.difficulty,
        questionText: data.questionText,
        questionImageUrl: data.questionImageUrl,
        options: data.options || [],
        correctOptionId: data.correctOptionId,
        correctText: data.correctText,
        acceptableAnswers: data.acceptableAnswers,
        explanation: data.explanation,
        hint: data.hint,
        tags: data.tags,
        createdBy: data.createdBy,
        isBuiltIn: data.isBuiltIn,
        usageCount: data.usageCount || 0,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt,
      };
    });

    return NextResponse.json({
      questions,
      total: questions.length,
    });
  } catch (error) {
    console.error('Error fetching kuizu questions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch questions' },
      { status: 500 }
    );
  }
});

// POST /api/kuizu/questions - Create custom question (auth required)
export const POST = withActivityLog('next_api.kuizu.questions.POST', async (request: NextRequest) => {
  try {
    const user = await getOptionalUser(request);

    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required to create questions' },
        { status: 401 }
      );
    }

    const body = await request.json();

    // Validate required fields
    if (!body.questionText || !body.type || !body.category || !body.difficulty) {
      return NextResponse.json(
        { error: 'Missing required fields: questionText, type, category, difficulty' },
        { status: 400 }
      );
    }

    const db = getFirestore();

    const questionId = uuidv4();
    const newQuestion = {
      id: questionId,
      type: body.type,
      category: body.category,
      difficulty: body.difficulty,
      questionText: body.questionText,
      questionImageUrl: body.questionImageUrl || null,
      options: body.options || [],
      correctOptionId: body.correctOptionId,
      correctText: body.correctText || null,
      acceptableAnswers: body.acceptableAnswers || null,
      explanation: body.explanation || null,
      hint: body.hint || null,
      tags: body.tags || [],
      createdBy: user.uid,
      isBuiltIn: false,
      usageCount: 0,
      createdAt: getServerTimestamp(),
      updatedAt: getServerTimestamp(),
    };

    await db.collection(KUIZU_QUESTIONS_COLLECTION).doc(questionId).set(newQuestion);

    return NextResponse.json(
      { id: questionId, message: 'Question created successfully' },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating kuizu question:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to create question', details: errorMessage },
      { status: 500 }
    );
  }
});
