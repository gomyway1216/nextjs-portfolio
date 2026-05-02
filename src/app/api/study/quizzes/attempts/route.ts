// Study Quiz Attempts API
import { NextRequest, NextResponse } from 'next/server';
import { getCloudFunctionUrl } from '../../../constants';
import { logCloudFunctionError } from '../../../utils/errorLogger';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';
// GET /api/study/quizzes/attempts - Get user's quiz attempts
export const GET = withActivityLog('next_api.study.quizzes.attempts.GET', async (request: NextRequest) => {
  const endpoint = '/api/study/quizzes/attempts';
  try {
    const searchParams = request.nextUrl.searchParams;
    const authHeader = request.headers.get('authorization');

    const url = new URL(getCloudFunctionUrl('getQuizAttempts'));

    const quizId = searchParams.get('quizId');
    if (quizId) url.searchParams.set('quizId', quizId);

    const response = await fetch(url.toString(), {
      headers: {
        ...(authHeader && { Authorization: authHeader }),
      },
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      await logCloudFunctionError({
        functionName: 'getQuizAttempts',
        endpoint,
        response: { status: response.status, error: data.error, details: data.details, message: data.message },
        metadata: { quizId },
      });
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Error fetching quiz attempts:', error);
    await logCloudFunctionError({
      functionName: 'getQuizAttempts',
      endpoint,
      response: { status: 500, error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return NextResponse.json(
      { success: false, error: 'Failed to fetch attempts' },
      { status: 500 }
    );
  }
});
