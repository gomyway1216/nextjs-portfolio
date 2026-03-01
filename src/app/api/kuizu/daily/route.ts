import { NextRequest, NextResponse } from 'next/server';
import { getFirestore, getServerTimestamp } from '@/lib/firebase-admin';
import { getOptionalUser } from '@/lib/auth-utils';
import {
  KUIZU_DAILY_CHALLENGES_COLLECTION,
  KUIZU_DAILY_LEADERBOARD_COLLECTION,
} from '../../constants';
import type { DailyChallenge, DailyChallengeEntry } from '@/types/kuizu';
import { QuizCategory, QuizDifficulty } from '@/types/kuizu';
import { getRandomQuestions } from '@/lib/kuizuQuestionBank';

// GET /api/kuizu/daily - Get today's daily challenge
export async function GET(request: NextRequest) {
  try {
    const user = await getOptionalUser(request);
    const db = getFirestore();

    // Get today's date in YYYYMMDD format
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
    const challengeId = `daily_${dateStr}`;

    // Check if today's challenge exists
    let challengeDoc = await db.collection(KUIZU_DAILY_CHALLENGES_COLLECTION).doc(challengeId).get();

    let challenge: DailyChallenge;

    if (!challengeDoc.exists) {
      // Generate new daily challenge
      const categories = [
        QuizCategory.ENGLISH_VOCAB,
        QuizCategory.TRAIN_STATION,
        QuizCategory.GENERAL_KNOWLEDGE,
        QuizCategory.JAPANESE_CULTURE,
        QuizCategory.GEOGRAPHY,
        QuizCategory.FOOD_DRINK,
        QuizCategory.SCIENCE,
        QuizCategory.HISTORY,
        QuizCategory.SPORTS,
        QuizCategory.MUSIC_ART,
      ];

      // Pick a random category
      const randomCategory = categories[Math.floor(Math.random() * categories.length)];

      // Get random questions
      const questions = getRandomQuestions(10, randomCategory, QuizDifficulty.NORMAL);

      const newChallenge = {
        date: today.toISOString().split('T')[0],
        quizId: challengeId,
        category: randomCategory,
        difficulty: QuizDifficulty.NORMAL,
        questionCount: 10,
        questions,
        createdAt: getServerTimestamp(),
      };

      await db.collection(KUIZU_DAILY_CHALLENGES_COLLECTION).doc(challengeId).set(newChallenge);

      challenge = {
        id: challengeId,
        date: newChallenge.date,
        quizId: newChallenge.quizId,
        category: newChallenge.category,
        difficulty: newChallenge.difficulty,
        questionCount: newChallenge.questionCount,
        questions: newChallenge.questions,
        createdAt: new Date().toISOString(),
      };
    } else {
      const data = challengeDoc.data()!;
      challenge = {
        id: challengeDoc.id,
        date: data.date,
        quizId: data.quizId,
        category: data.category,
        difficulty: data.difficulty,
        questionCount: data.questionCount,
        questions: data.questions || [],
        createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
      };
    }

    // If user is authenticated, check if they already have an entry
    let userEntry: DailyChallengeEntry | undefined;

    if (user) {
      const entrySnapshot = await db
        .collection(KUIZU_DAILY_LEADERBOARD_COLLECTION)
        .where('challengeId', '==', challengeId)
        .where('userId', '==', user.uid)
        .limit(1)
        .get();

      if (!entrySnapshot.empty) {
        const entryDoc = entrySnapshot.docs[0];
        const entryData = entryDoc.data();
        userEntry = {
          id: entryDoc.id,
          challengeId: entryData.challengeId,
          userId: entryData.userId,
          displayName: entryData.displayName,
          score: entryData.score,
          accuracy: entryData.accuracy,
          timeTaken: entryData.timeTaken,
          completedAt: entryData.completedAt?.toDate?.()?.toISOString() || entryData.completedAt,
        };
      }
    }

    return NextResponse.json({ challenge, userEntry });
  } catch (error) {
    console.error('Error fetching daily challenge:', error);
    return NextResponse.json(
      { error: 'Failed to fetch daily challenge' },
      { status: 500 }
    );
  }
}
