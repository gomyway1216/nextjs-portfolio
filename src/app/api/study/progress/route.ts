// Study Progress API
import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from '@/lib/firebase-admin';
import { ensureValidUser } from '@/lib/auth-utils';
import { STUDY_READ_HISTORY_COLLECTION, STUDY_PROGRESS_COLLECTION } from '../../constants';
import { logApiError } from '../../utils/errorLogger';
import { ErrorSeverity } from '@/types/errors';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';
const endpoint = '/api/study/progress';

// GET /api/study/progress - Get user's study progress
export const GET = withActivityLog('next_api.study.progress.GET', async (request: NextRequest) => {
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

    // Get the actual count of articles read from read history
    const readHistorySnapshot = await db
      .collection(STUDY_READ_HISTORY_COLLECTION)
      .where('userId', '==', user.uid)
      .get();

    const totalArticlesRead = readHistorySnapshot.size;

    // Calculate total time spent from read history
    let totalTimeSpentMinutes = 0;
    readHistorySnapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.timeSpentSeconds) {
        totalTimeSpentMinutes += Math.round(data.timeSpentSeconds / 60);
      }
    });

    // Get the progress document for other stats (quizzes, streaks, etc.)
    const progressDoc = await db.collection(STUDY_PROGRESS_COLLECTION).doc(user.uid).get();
    const progressData = progressDoc.exists ? progressDoc.data() : null;

    // Merge the calculated values with the stored progress
    const progress = {
      id: user.uid,
      totalArticlesRead,
      totalTimeSpentMinutes,
      totalQuizzesCompleted: progressData?.totalQuizzesCompleted || 0,
      currentStreak: progressData?.currentStreak || 0,
      longestStreak: progressData?.longestStreak || 0,
      lastStudyDate: progressData?.lastStudyDate || null,
      topicProgress: progressData?.topicProgress || {},
      categoryProgress: progressData?.categoryProgress || {},
      weakAreas: progressData?.weakAreas || [],
      strongAreas: progressData?.strongAreas || [],
      suggestedNextTopics: progressData?.suggestedNextTopics || [],
      achievements: progressData?.achievements || [],
    };

    return NextResponse.json({
      success: true,
      progress,
    });
  } catch (error) {
    console.error('Error fetching progress:', error);
    await logApiError({
      severity: ErrorSeverity.MEDIUM,
      errorType: 'StudyProgressAPI:FetchError',
      message: 'Failed to fetch progress',
      details: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      endpoint,
    });
    return NextResponse.json(
      { success: false, error: 'Failed to fetch progress' },
      { status: 500 }
    );
  }
});
