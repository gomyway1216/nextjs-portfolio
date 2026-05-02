// Study Topics Suggestion API
import { NextRequest, NextResponse } from 'next/server';
import { getCloudFunctionUrl } from '../../../constants';
import { logCloudFunctionError } from '../../../utils/errorLogger';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';
// POST /api/study/topics/suggest - Get AI-suggested topics
export const POST = withActivityLog('next_api.study.topics.suggest.POST', async (request: NextRequest) => {
  try {
    const body = await request.json();
    const authHeader = request.headers.get('authorization');

    const response = await fetch(getCloudFunctionUrl('suggestStudyTopics'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader && { Authorization: authHeader }),
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      await logCloudFunctionError({
        functionName: 'suggestStudyTopics',
        endpoint: '/api/study/topics/suggest',
        response: { status: response.status, error: data.error, details: data.details, message: data.message },
      });
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Error suggesting topics:', error);
    await logCloudFunctionError({
      functionName: 'suggestStudyTopics',
      endpoint: '/api/study/topics/suggest',
      response: { status: 500, error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return NextResponse.json(
      { success: false, error: 'Failed to suggest topics' },
      { status: 500 }
    );
  }
});
