import { NextRequest, NextResponse } from 'next/server';
import { getFirestore, getServerTimestamp } from '@/lib/firebase-admin';
import { ensureAdmin } from '@/lib/auth-utils';
import { KUIZU_QUESTIONS_COLLECTION } from '../../../constants';
import { QUESTION_BANK } from '@/lib/kuizuQuestionBank';
import { withActivityLog } from '@/app/api/_lib/withActivityLog';

// POST /api/kuizu/questions/seed - Seed built-in question bank (admin only)
export const POST = withActivityLog('next_api.kuizu.questions.seed.POST', async (request: NextRequest) => {
  try {
    const { user, response } = await ensureAdmin(request);
    if (!user) {
      return response!;
    }

    const db = getFirestore();

    let seeded = 0;
    let skipped = 0;

    for (const question of QUESTION_BANK) {
      const existingDoc = await db.collection(KUIZU_QUESTIONS_COLLECTION).doc(question.id).get();

      if (existingDoc.exists) {
        skipped++;
        continue;
      }

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
    return NextResponse.json(
      { error: 'Failed to seed questions' },
      { status: 500 }
    );
  }
});
