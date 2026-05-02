// Study Schedule Run Now API
import { NextRequest, NextResponse } from 'next/server';
import { getCloudFunctionUrl, STUDY_ARTICLES_COLLECTION } from '../../../../constants';
import { logCloudFunctionError } from '../../../../utils/errorLogger';
import { getFirestore } from '@/lib/firebase-admin';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';
// POST /api/study/schedules/[id]/run - Run a schedule immediately
export const POST = withActivityLog('next_api.study.schedules.id.run.POST', async (request: NextRequest,
  { params }: { params: Promise<{ id: string }> }) => {
  try {
    const { id } = await params;
    const authHeader = request.headers.get('authorization');

    const response = await fetch(getCloudFunctionUrl('runStudyScheduleNow'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader && { Authorization: authHeader }),
      },
      body: JSON.stringify({ scheduleId: id }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      await logCloudFunctionError({
        functionName: 'runStudyScheduleNow',
        endpoint: `/api/study/schedules/${id}/run`,
        response: { status: response.status, error: data.error, details: data.details, message: data.message },
        metadata: { scheduleId: id },
      });
    }

    if (data?.success && Array.isArray(data.articleIds) && data.articleIds.length > 0) {
      try {
        const db = getFirestore();
        const refs = data.articleIds.map((id: string) =>
          db.collection(STUDY_ARTICLES_COLLECTION).doc(id)
        );
        const snapshots = await db.getAll(...refs);
        const batch = db.batch();
        let updates = 0;

        snapshots.forEach((snap) => {
          if (!snap.exists) return;
          const article = snap.data();
          const current = article?.readingTimeMinutes;
          const multiplier = article?.readingTimeMultiplier;
          if (typeof current !== 'number' || multiplier === 5) return;
          batch.update(snap.ref, {
            readingTimeMinutes: current * 5,
            readingTimeMultiplier: 5,
          });
          updates += 1;
        });

        if (updates > 0) {
          await batch.commit();
        }
      } catch (updateError) {
        console.error('[Study API] Failed to update reading time after schedule run:', updateError);
      }
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Error running schedule:', error);
    await logCloudFunctionError({
      functionName: 'runStudyScheduleNow',
      endpoint: '/api/study/schedules/[id]/run',
      response: { status: 500, error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return NextResponse.json(
      { success: false, error: 'Failed to run schedule' },
      { status: 500 }
    );
  }
});
