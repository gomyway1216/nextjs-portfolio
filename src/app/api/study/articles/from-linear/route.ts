// Generate a study article from a Linear Study Todo issue
import { NextRequest, NextResponse } from 'next/server';
import { getCloudFunctionUrl } from '../../../constants';
import { logCloudFunctionError } from '../../../utils/errorLogger';
import { withActivityLog } from '@/app/api/_lib/withActivityLog';

export const POST = withActivityLog(
  'next_api.study.articles.from_linear.POST',
  async (request: NextRequest) => {
    try {
      const body = await request.json().catch(() => ({} as Record<string, unknown>));
      const authHeader = request.headers.get('authorization');

      const response = await fetch(getCloudFunctionUrl('generateArticleFromLinearTopic'), {
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
          functionName: 'generateArticleFromLinearTopic',
          endpoint: '/api/study/articles/from-linear',
          response: { status: response.status, error: data.error, details: data.details, message: data.message },
        });
      }

      return NextResponse.json(data, { status: response.status });
    } catch (error) {
      console.error('Error generating article from Linear:', error);
      await logCloudFunctionError({
        functionName: 'generateArticleFromLinearTopic',
        endpoint: '/api/study/articles/from-linear',
        response: { status: 500, error: error instanceof Error ? error.message : 'Unknown error' },
      });
      return NextResponse.json(
        { success: false, error: 'Failed to generate article from Linear' },
        { status: 500 },
      );
    }
  },
);
