// Study Progress Insights API
import { NextRequest, NextResponse } from 'next/server';
import { getCloudFunctionUrl } from '../../../constants';
import { logCloudFunctionError } from '../../../utils/errorLogger';

const endpoint = '/api/study/progress/insights';

// GET /api/study/progress/insights - Get AI-generated learning insights
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');

    const response = await fetch(getCloudFunctionUrl('getLearningInsightsForUser'), {
      headers: {
        ...(authHeader && { Authorization: authHeader }),
      },
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      await logCloudFunctionError({
        functionName: 'getLearningInsightsForUser',
        endpoint,
        response: { status: response.status, error: data.error, details: data.details, message: data.message },
      });
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Error fetching insights:', error);
    await logCloudFunctionError({
      functionName: 'getLearningInsightsForUser',
      endpoint,
      response: { status: 500, error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return NextResponse.json(
      { success: false, error: 'Failed to fetch insights' },
      { status: 500 }
    );
  }
}
