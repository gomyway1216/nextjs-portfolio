// Learning Stats API
import { NextRequest, NextResponse } from 'next/server';
import { getCloudFunctionUrl } from '../../../constants';
import { logCloudFunctionError } from '../../../utils/errorLogger';

const endpoint = '/api/study/learning/stats';

// GET /api/study/learning/stats - Get learning statistics
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');

    const response = await fetch(getCloudFunctionUrl('getLearningStats'), {
      headers: {
        ...(authHeader && { Authorization: authHeader }),
      },
    });
    const data = await response.json();

    if (!response.ok || !data.success) {
      await logCloudFunctionError({
        functionName: 'getLearningStats',
        endpoint,
        response: { status: response.status, error: data.error, details: data.details, message: data.message },
      });
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[Learning API] Error fetching learning stats:', error);
    await logCloudFunctionError({
      functionName: 'getLearningStats',
      endpoint,
      response: { status: 500, error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return NextResponse.json(
      { success: false, error: 'Failed to fetch learning stats' },
      { status: 500 }
    );
  }
}
