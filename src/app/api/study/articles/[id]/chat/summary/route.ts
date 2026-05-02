// Study Article Chat Summary API
import { NextRequest, NextResponse } from 'next/server';
import { getCloudFunctionUrl } from '../../../../../constants';
import { logCloudFunctionError } from '../../../../../utils/errorLogger';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';
// POST /api/study/articles/[id]/chat/summary - Generate chat summary
export const POST = withActivityLog('next_api.study.articles.id.chat.summary.POST', async (request: NextRequest,
  { params }: { params: Promise<{ id: string }> }) => {
  try {
    const { id } = await params;
    const authHeader = request.headers.get('authorization');

    const response = await fetch(getCloudFunctionUrl('generateArticleChatSummary'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader && { Authorization: authHeader }),
      },
      body: JSON.stringify({ articleId: id }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      await logCloudFunctionError({
        functionName: 'generateArticleChatSummary',
        endpoint: `/api/study/articles/${id}/chat/summary`,
        response: { status: response.status, error: data.error, details: data.details, message: data.message },
        metadata: { articleId: id },
      });
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Error generating chat summary:', error);
    await logCloudFunctionError({
      functionName: 'generateArticleChatSummary',
      endpoint: '/api/study/articles/[id]/chat/summary',
      response: { status: 500, error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return NextResponse.json(
      { success: false, error: 'Failed to generate summary' },
      { status: 500 }
    );
  }
});
