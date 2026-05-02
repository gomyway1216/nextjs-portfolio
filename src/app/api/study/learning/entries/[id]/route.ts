// Learning Entry by ID API
import { NextRequest, NextResponse } from 'next/server';
import { getCloudFunctionUrl } from '../../../../constants';
import { logCloudFunctionError } from '../../../../utils/errorLogger';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';
// GET /api/study/learning/entries/[id] - Get a single learning entry
export const GET = withActivityLog('next_api.study.learning.entries.id.GET', async (request: NextRequest,
  { params }: { params: Promise<{ id: string }> }) => {
  try {
    const { id } = await params;
    const authHeader = request.headers.get('authorization');

    const url = new URL(getCloudFunctionUrl('getLearningEntry'));
    url.searchParams.set('entryId', id);

    const response = await fetch(url.toString(), {
      headers: {
        ...(authHeader && { Authorization: authHeader }),
      },
    });
    const data = await response.json();

    if (!response.ok || !data.success) {
      await logCloudFunctionError({
        functionName: 'getLearningEntry',
        endpoint: `/api/study/learning/entries/${id}`,
        response: { status: response.status, error: data.error, details: data.details, message: data.message },
        metadata: { entryId: id },
      });
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[Learning API] Error fetching entry:', error);
    await logCloudFunctionError({
      functionName: 'getLearningEntry',
      endpoint: '/api/study/learning/entries/[id]',
      response: { status: 500, error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return NextResponse.json(
      { success: false, error: 'Failed to fetch learning entry' },
      { status: 500 }
    );
  }
});
