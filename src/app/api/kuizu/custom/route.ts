import { NextRequest, NextResponse } from 'next/server';
import { getFirestore, getServerTimestamp } from '@/lib/firebase-admin';
import { getOptionalUser } from '@/lib/auth-utils';
import { KUIZU_CUSTOM_QUIZZES_COLLECTION } from '../../constants';
import type { Quiz, CreateCustomQuizInput } from '@/types/kuizu';
import { QuizCategory, QuizDifficulty } from '@/types/kuizu';
import { generateShareCode } from '@/lib/settliAlgorithm';
import * as crypto from 'crypto';

function simpleHash(passcode: string): string {
  return crypto.createHash('sha256').update(passcode).digest('hex');
}

// GET /api/kuizu/custom - Get user's custom quizzes (requires auth)
export async function GET(request: NextRequest) {
  try {
    const user = await getOptionalUser(request);

    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required to view custom quizzes' },
        { status: 401 }
      );
    }

    const db = getFirestore();

    const snapshot = await db
      .collection(KUIZU_CUSTOM_QUIZZES_COLLECTION)
      .where('createdBy', '==', user.uid)
      .orderBy('updatedAt', 'desc')
      .get();

    const quizzes: Quiz[] = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
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
    });

    return NextResponse.json({ quizzes, total: quizzes.length });
  } catch (error) {
    console.error('Error fetching custom quizzes:', error);
    return NextResponse.json(
      { error: 'Failed to fetch custom quizzes' },
      { status: 500 }
    );
  }
}

// POST /api/kuizu/custom - Create custom quiz (optional auth)
export async function POST(request: NextRequest) {
  try {
    const user = await getOptionalUser(request);
    const body: CreateCustomQuizInput = await request.json();

    if (!body.title) {
      return NextResponse.json(
        { error: 'Quiz title is required' },
        { status: 400 }
      );
    }

    if (!body.questions || body.questions.length === 0) {
      return NextResponse.json(
        { error: 'At least one question is required' },
        { status: 400 }
      );
    }

    const db = getFirestore();

    // Generate unique share code
    let shareCode = generateShareCode();
    let attempts = 0;
    while (attempts < 10) {
      const existing = await db
        .collection(KUIZU_CUSTOM_QUIZZES_COLLECTION)
        .where('shareCode', '==', shareCode)
        .get();
      if (existing.empty) break;
      shareCode = generateShareCode();
      attempts++;
    }

    const hasPasscode = !!body.passcode;
    const passcodeHash = body.passcode ? simpleHash(body.passcode) : null;

    const newQuiz = {
      title: body.title,
      description: body.description || null,
      category: body.category || QuizCategory.CUSTOM,
      difficulty: body.questions[0]?.difficulty || QuizDifficulty.NORMAL,
      questionCount: body.questions.length,
      questions: body.questions,
      timePerQuestion: body.timePerQuestion || 30,
      createdBy: user?.uid || null,
      isCustom: true,
      shareCode,
      hasPasscode,
      passcodeHash,
      createdAt: getServerTimestamp(),
      updatedAt: getServerTimestamp(),
    };

    const docRef = await db.collection(KUIZU_CUSTOM_QUIZZES_COLLECTION).add(newQuiz);

    return NextResponse.json(
      { id: docRef.id, shareCode, message: 'Custom quiz created successfully' },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating custom quiz:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to create custom quiz', details: errorMessage },
      { status: 500 }
    );
  }
}
