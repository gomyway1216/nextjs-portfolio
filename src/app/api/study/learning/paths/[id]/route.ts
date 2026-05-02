// Learning Path by ID API
import { NextRequest, NextResponse } from 'next/server';
import { getCloudFunctionUrl } from '../../../../constants';
import { logCloudFunctionError } from '../../../../utils/errorLogger';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';
const endpoint = '/api/study/learning/paths/[id]';

// GET /api/study/learning/paths/[id] - Get a single learning path
export const GET = withActivityLog('next_api.study.learning.paths.id.GET', async (request: NextRequest,
  { params }: { params: Promise<{ id: string }> }) => {
  try {
    const { id: pathId } = await params;
    const authHeader = request.headers.get('authorization');
    const url = new URL(getCloudFunctionUrl('getLearningPath'));
    url.searchParams.set('pathId', pathId);

    const response = await fetch(url.toString(), {
      headers: {
        ...(authHeader && { Authorization: authHeader }),
      },
    });
    const data = await response.json();

    if (!response.ok || !data.success) {
      await logCloudFunctionError({
        functionName: 'getLearningPath',
        endpoint,
        response: { status: response.status, error: data.error, details: data.details, message: data.message },
        metadata: { pathId },
      });
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[Learning Paths API] Error fetching path:', error);
    await logCloudFunctionError({
      functionName: 'getLearningPath',
      endpoint,
      response: { status: 500, error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return NextResponse.json(
      { success: false, error: 'Failed to fetch learning path' },
      { status: 500 }
    );
  }
});
