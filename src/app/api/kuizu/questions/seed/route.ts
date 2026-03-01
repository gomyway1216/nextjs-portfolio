import { NextRequest, NextResponse } from 'next/server';
import { getFirestore, getServerTimestamp } from '@/lib/firebase-admin';
import { KUIZU_QUESTIONS_COLLECTION } from '../../../constants';
import { QUESTION_BANK } from '@/lib/kuizuQuestionBank';

// POST /api/kuizu/questions/seed - Seed built-in question bank
export async function POST(request: NextRequest) {
  try {
    const db = getFirestore();

    let seeded = 0;
    let skipped = 0;

    for (const question of QUESTION_BANK) {
      // Check if question already exists by id
      const existingDoc = await db.collection(KUIZU_QUESTIONS_COLLECTION).doc(question.id).get();

      if (existingDoc.exists) {
        skipped++;
        continue;
      }

      // Add question with built-in flag
      await db.collection(KUIZU_QUESTIONS_COLLECTION).doc(question.id).set({
        ...question,
        isBuiltIn: true,
        usageCount: 0,
        createdBy: null,
        createdAt: getServerTimestamp(),
        updatedAt: getServerTimestamp(),
      });

      seeded++;
    }

    return NextResponse.json({
      seeded,
      skipped,
      total: QUESTION_BANK.length,
      message: `Seeded ${seeded} questions, skipped ${skipped} existing questions`,
    });
  } catch (error) {
    console.error('Error seeding kuizu questions:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to seed questions', details: errorMessage },
      { status: 500 }
    );
  }
}
