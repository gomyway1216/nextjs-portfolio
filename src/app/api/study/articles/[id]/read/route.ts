// Mark Article as Read API
import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from '@/lib/firebase-admin';
import { ensureValidUser } from '@/lib/auth-utils';
import { getCloudFunctionUrl, STUDY_READ_HISTORY_COLLECTION } from '../../../../constants';
import { logCloudFunctionError } from '../../../../utils/errorLogger';

const TIME_SPENT_MULTIPLIER = 5;

// POST /api/study/articles/[id]/read - Mark article as read
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, response: authResponse } = await ensureValidUser(request);
    if (authResponse) return authResponse;
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const hasTimeSpent = typeof body?.timeSpentSeconds === 'number';
    const adjustedTimeSpentSeconds = hasTimeSpent
      ? Math.round(body.timeSpentSeconds * TIME_SPENT_MULTIPLIER)
      : undefined;
    const authHeader = request.headers.get('authorization');

    const response = await fetch(getCloudFunctionUrl('markArticleAsRead'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader && { Authorization: authHeader }),
      },
      body: JSON.stringify({ articleId: id, ...body }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      await logCloudFunctionError({
        functionName: 'markArticleAsRead',
        endpoint: `/api/study/articles/${id}/read`,
        response: { status: response.status, error: data.error, details: data.details, message: data.message },
        metadata: { articleId: id },
      });
    }

    if (response.ok && data?.success && hasTimeSpent && typeof adjustedTimeSpentSeconds === 'number') {
      try {
        const db = getFirestore();
        const snapshot = await db
          .collection(STUDY_READ_HISTORY_COLLECTION)
          .where('userId', '==', user.uid)
          .where('articleId', '==', id)
          .limit(1)
          .get();
        if (!snapshot.empty) {
          await snapshot.docs[0].ref.update({
            timeSpentSeconds: adjustedTimeSpentSeconds,
            timeSpentMultiplier: TIME_SPENT_MULTIPLIER,
          });
        }
      } catch (updateError) {
        console.error('[Study API] Failed to update time spent multiplier:', updateError);
      }
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Error marking article as read:', error);
    await logCloudFunctionError({
      functionName: 'markArticleAsRead',
      endpoint: '/api/study/articles/[id]/read',
      response: { status: 500, error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return NextResponse.json(
      { success: false, error: 'Failed to mark as read' },
      { status: 500 }
    );
  }
}
