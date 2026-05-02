// Study Articles Count API - Efficient endpoint for read/unread counts
import { NextRequest, NextResponse } from 'next/server';
import { STUDY_ARTICLES_COLLECTION, STUDY_READ_HISTORY_COLLECTION } from '../../../constants';
import { logApiError } from '../../../utils/errorLogger';
import { ErrorSeverity } from '@/types/errors';
import { getFirestore } from '@/lib/firebase-admin';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';
// GET /api/study/articles/counts - Get article counts for a user
export const GET = withActivityLog('next_api.study.articles.counts.GET', async (request: NextRequest) => {
  const endpoint = '/api/study/articles/counts';
  try {
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'userId is required' },
        { status: 400 }
      );
    }

    const db = getFirestore();

    // Get total published articles count
    const articlesSnapshot = await db
      .collection(STUDY_ARTICLES_COLLECTION)
      .where('status', '==', 'published')
      .count()
      .get();
    const total = articlesSnapshot.data().count;

    // Get read articles count for this user
    const readSnapshot = await db
      .collection(STUDY_READ_HISTORY_COLLECTION)
      .where('userId', '==', userId)
      .count()
      .get();
    const read = readSnapshot.data().count;

    // Calculate unread
    const unread = Math.max(0, total - read);

    console.log('[Study API] Article counts:', { total, read, unread, userId });

    return NextResponse.json({
      success: true,
      counts: { total, read, unread },
    });
  } catch (error) {
    console.error('[Study API] Error fetching article counts:', error);

    await logApiError({
      severity: ErrorSeverity.HIGH,
      errorType: 'StudyArticleCountsAPI:FetchError',
      message: 'Failed to fetch article counts',
      details: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      endpoint,
    });

    return NextResponse.json(
      { success: false, error: 'Failed to fetch article counts' },
      { status: 500 }
    );
  }
});
