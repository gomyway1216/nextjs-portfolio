import { NextRequest, NextResponse } from 'next/server';
import { getFirestore, getServerTimestamp } from '@/lib/firebase-admin';
import { getOptionalUser } from '@/lib/auth-utils';
import {
  KUIZU_SOLO_RESULTS_COLLECTION,
  KUIZU_USER_STATS_COLLECTION,
  KUIZU_USER_HISTORY_COLLECTION,
} from '../../constants';
import type { SoloResult, KuizuUserStats, KuizuHistoryEntry, QuizMode } from '@/types/kuizu';
import { v4 as uuidv4 } from 'uuid';

// POST /api/kuizu/results - Submit solo quiz result (optional auth)
export async function POST(request: NextRequest) {
  try {
    const user = await getOptionalUser(request);
    const body: Partial<SoloResult> = await request.json();

    // Validate required fields
    if (!body.quizId || !body.category || !body.difficulty || !body.answers) {
      return NextResponse.json(
        { error: 'Missing required fields: quizId, category, difficulty, answers' },
        { status: 400 }
      );
    }

    const db = getFirestore();
    const resultId = uuidv4();

    const result: SoloResult = {
      id: resultId,
      quizId: body.quizId,
      userId: user?.uid || null,
      category: body.category,
      difficulty: body.difficulty,
      answers: body.answers,
      totalQuestions: body.totalQuestions || body.answers.length,
      correctCount: body.correctCount || body.answers.filter(a => a.isCorrect).length,
      totalPoints: body.totalPoints || body.answers.reduce((sum, a) => sum + a.points, 0),
      maxPoints: body.maxPoints || 0,
      accuracy: body.accuracy || 0,
      streak: body.streak || 0,
      timeTaken: body.timeTaken || 0,
      createdAt: new Date().toISOString(),
    };

    // Save result to Firestore
    await db.collection(KUIZU_SOLO_RESULTS_COLLECTION).doc(resultId).set({
      ...result,
      createdAt: getServerTimestamp(),
    });

    // If user is logged in, update stats and history
    if (user) {
      await updateUserStats(db, user.uid, result);
      await addToUserHistory(db, user.uid, result);
    }

    return NextResponse.json(
      { id: resultId, message: 'Result saved successfully' },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error saving kuizu result:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to save result', details: errorMessage },
      { status: 500 }
    );
  }
}

async function updateUserStats(db: FirebaseFirestore.Firestore, userId: string, result: SoloResult) {
  const statsRef = db.collection(KUIZU_USER_STATS_COLLECTION).doc(userId);
  const statsDoc = await statsRef.get();

  if (!statsDoc.exists) {
    // Create initial stats
    const initialStats: KuizuUserStats = {
      userId,
      totalQuizzesTaken: 1,
      totalCorrect: result.correctCount,
      totalPoints: result.totalPoints,
      bestStreak: result.streak,
      categoryStats: {
        [result.category]: {
          quizzesTaken: 1,
          correctAnswers: result.correctCount,
          totalQuestions: result.totalQuestions,
          accuracy: result.accuracy,
          bestScore: result.totalPoints,
        },
      } as any,
      dailyChallengesCompleted: 0,
      multiplayerGamesPlayed: 0,
      multiplayerWins: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await statsRef.set({
      ...initialStats,
      createdAt: getServerTimestamp(),
      updatedAt: getServerTimestamp(),
    });
  } else {
    // Update existing stats
    const stats = statsDoc.data() as KuizuUserStats;
    const categoryStats = stats.categoryStats || {};
    const currentCategoryStats = categoryStats[result.category] || {
      quizzesTaken: 0,
      correctAnswers: 0,
      totalQuestions: 0,
      accuracy: 0,
      bestScore: 0,
    };

    const updatedCategoryStats = {
      quizzesTaken: currentCategoryStats.quizzesTaken + 1,
      correctAnswers: currentCategoryStats.correctAnswers + result.correctCount,
      totalQuestions: currentCategoryStats.totalQuestions + result.totalQuestions,
      accuracy: ((currentCategoryStats.correctAnswers + result.correctCount) /
                 (currentCategoryStats.totalQuestions + result.totalQuestions)) * 100,
      bestScore: Math.max(currentCategoryStats.bestScore, result.totalPoints),
    };

    await statsRef.update({
      totalQuizzesTaken: (stats.totalQuizzesTaken || 0) + 1,
      totalCorrect: (stats.totalCorrect || 0) + result.correctCount,
      totalPoints: (stats.totalPoints || 0) + result.totalPoints,
      bestStreak: Math.max(stats.bestStreak || 0, result.streak),
      [`categoryStats.${result.category}`]: updatedCategoryStats,
      updatedAt: getServerTimestamp(),
    });
  }
}

async function addToUserHistory(db: FirebaseFirestore.Firestore, userId: string, result: SoloResult) {
  const historyEntry: KuizuHistoryEntry = {
    id: uuidv4(),
    userId,
    quizId: result.quizId,
    quizTitle: `${result.category} - ${result.difficulty}`,
    mode: 'solo' as QuizMode,
    category: result.category,
    difficulty: result.difficulty,
    score: result.totalPoints,
    accuracy: result.accuracy,
    questionCount: result.totalQuestions,
    correctCount: result.correctCount,
    timeTaken: result.timeTaken,
    createdAt: new Date().toISOString(),
  };

  await db.collection(KUIZU_USER_HISTORY_COLLECTION).add({
    ...historyEntry,
    createdAt: getServerTimestamp(),
  });
}
