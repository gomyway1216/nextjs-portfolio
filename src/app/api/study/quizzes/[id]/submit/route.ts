// Study Quiz Submit API
import { NextRequest, NextResponse } from 'next/server';
import { getCloudFunctionUrl } from '../../../../constants';
import { logCloudFunctionError } from '../../../../utils/errorLogger';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';
// POST /api/study/quizzes/[id]/submit - Submit quiz answers
export const POST = withActivityLog('next_api.study.quizzes.id.submit.POST', async (request: NextRequest,
  { params }: { params: Promise<{ id: string }> }) => {
  try {
    const { id } = await params;
    const body = await request.json();
    const authHeader = request.headers.get('authorization');

    const response = await fetch(getCloudFunctionUrl('submitQuizAttempt'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader && { Authorization: authHeader }),
      },
      body: JSON.stringify({ quizId: id, ...body }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      await logCloudFunctionError({
        functionName: 'submitQuizAttempt',
        endpoint: `/api/study/quizzes/${id}/submit`,
        response: { status: response.status, error: data.error, details: data.details, message: data.message },
        metadata: { quizId: id },
      });
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Error submitting quiz:', error);
    await logCloudFunctionError({
      functionName: 'submitQuizAttempt',
      endpoint: '/api/study/quizzes/[id]/submit',
      response: { status: 500, error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return NextResponse.json(
      { success: false, error: 'Failed to submit quiz' },
      { status: 500 }
    );
  }
});
