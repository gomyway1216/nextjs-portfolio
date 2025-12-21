// Article Read History API - Manages read status for admin users
import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from '@/lib/firebase-admin';
import { ensureValidUser } from '@/lib/auth-utils';
import { STUDY_READ_HISTORY_COLLECTION } from '../../../constants';
import { logApiError } from '../../../utils/errorLogger';
import { ErrorSeverity } from '@/types/errors';

const TIME_SPENT_MULTIPLIER = 5;

// GET /api/study/articles/read-history - Get all read articles for the admin
export async function GET(request: NextRequest) {
  try {
    // Require authentication
    const { user, response } = await ensureValidUser(request);
    if (response) return response;
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const db = getFirestore();
    const snapshot = await db
      .collection(STUDY_READ_HISTORY_COLLECTION)
      .where('userId', '==', user.uid)
      .get();

    const readHistory = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Create a map of articleId -> readAt for quick lookup
    const readArticleIds: Record<string, string> = {};
    readHistory.forEach((item: any) => {
      readArticleIds[item.articleId] = item.readAt;
    });

    return NextResponse.json({
      success: true,
      readHistory,
      readArticleIds,
    });
  } catch (error) {
    console.error('[Read History API] Error fetching read history:', error);
    await logApiError({
      severity: ErrorSeverity.MEDIUM,
      errorType: 'ReadHistoryAPI:FetchError',
      message: 'Failed to fetch read history',
      details: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      endpoint: '/api/study/articles/read-history',
    });
    return NextResponse.json(
      { success: false, error: 'Failed to fetch read history' },
      { status: 500 }
    );
  }
}

// POST /api/study/articles/read-history - Mark an article as read
export async function POST(request: NextRequest) {
  try {
    // Require authentication
    const { user, response } = await ensureValidUser(request);
    if (response) return response;
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { articleId, timeSpentSeconds } = body;
    const hasTimeSpent = typeof timeSpentSeconds === 'number';
    const adjustedTimeSpentSeconds = hasTimeSpent
      ? Math.round(timeSpentSeconds * TIME_SPENT_MULTIPLIER)
      : undefined;

    if (!articleId) {
      return NextResponse.json(
        { success: false, error: 'articleId is required' },
        { status: 400 }
      );
    }

    const db = getFirestore();

    // Check if already marked as read
    const existingSnapshot = await db
      .collection(STUDY_READ_HISTORY_COLLECTION)
      .where('userId', '==', user.uid)
      .where('articleId', '==', articleId)
      .limit(1)
      .get();

    if (!existingSnapshot.empty) {
      // Already marked as read, update the timestamp and time spent
      const existingDoc = existingSnapshot.docs[0];
      const updatePayload: Record<string, number | string> = {
        readAt: new Date().toISOString(),
      };
      if (hasTimeSpent && typeof adjustedTimeSpentSeconds === 'number') {
        updatePayload.timeSpentSeconds = adjustedTimeSpentSeconds;
        updatePayload.timeSpentMultiplier = TIME_SPENT_MULTIPLIER;
      }
      await existingDoc.ref.update(updatePayload);

      return NextResponse.json({
        success: true,
        message: 'Read status updated',
        id: existingDoc.id,
      });
    }

    // Create new read history entry
    const readHistoryData = {
      articleId,
      userId: user.uid,
      readAt: new Date().toISOString(),
      timeSpentSeconds: hasTimeSpent ? adjustedTimeSpentSeconds : 0,
      timeSpentMultiplier: TIME_SPENT_MULTIPLIER,
    };

    const docRef = await db.collection(STUDY_READ_HISTORY_COLLECTION).add(readHistoryData);

    return NextResponse.json({
      success: true,
      message: 'Article marked as read',
      id: docRef.id,
    });
  } catch (error) {
    console.error('[Read History API] Error marking as read:', error);
    await logApiError({
      severity: ErrorSeverity.MEDIUM,
      errorType: 'ReadHistoryAPI:MarkAsReadError',
      message: 'Failed to mark as read',
      details: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      endpoint: '/api/study/articles/read-history',
    });
    return NextResponse.json(
      { success: false, error: 'Failed to mark as read' },
      { status: 500 }
    );
  }
}

// DELETE /api/study/articles/read-history - Unmark an article as read
export async function DELETE(request: NextRequest) {
  try {
    // Require authentication
    const { user, response } = await ensureValidUser(request);
    if (response) return response;
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { articleId } = body;

    if (!articleId) {
      return NextResponse.json(
        { success: false, error: 'articleId is required' },
        { status: 400 }
      );
    }

    const db = getFirestore();

    // Find and delete the read history entry
    const snapshot = await db
      .collection(STUDY_READ_HISTORY_COLLECTION)
      .where('userId', '==', user.uid)
      .where('articleId', '==', articleId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return NextResponse.json({
        success: true,
        message: 'Article was not marked as read',
      });
    }

    await snapshot.docs[0].ref.delete();

    return NextResponse.json({
      success: true,
      message: 'Article unmarked as read',
    });
  } catch (error) {
    console.error('[Read History API] Error unmarking as read:', error);
    await logApiError({
      severity: ErrorSeverity.MEDIUM,
      errorType: 'ReadHistoryAPI:UnmarkAsReadError',
      message: 'Failed to unmark as read',
      details: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      endpoint: '/api/study/articles/read-history',
    });
    return NextResponse.json(
      { success: false, error: 'Failed to unmark as read' },
      { status: 500 }
    );
  }
}
